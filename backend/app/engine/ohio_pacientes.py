"""
engine/ohio_pacientes.py — Perfiles de pacientes REALES de OhioT1DM.

Construye perfiles de gemelo digital a partir de los registros REALES de bomba de
insulina del dataset OhioT1DM (Bunescu et al., Ohio University). De cada paciente
se extraen sus parámetros terapéuticos documentados:

  - Ratio I:CHO (CR) : derivado de los pares (dosis de bolo, carbohidratos) del
                       asistente de bolo de la bomba; si el paciente no usó el
                       asistente, se estima con la regla 500 (CR = 500 / TDD).
  - Basal media      : promedio de las tasas basales programadas (U/h).
  - TDD              : dosis diaria total = basal·24 + bolos/día.
  - ISF              : factor de sensibilidad estimado con la regla 1800.
  - Glucosa media    : media observada de la serie CGM real.

LIMITACIÓN METODOLÓGICA (declarada con transparencia para la defensa):
OhioT1DM es un dataset *observacional* — no provee el modelo fisiológico
UVA/Padova del sujeto, por lo que simglucose no puede instanciar su cuerpo
directamente. Cada paciente real se MAPEA al modelo virtual UVA/Padova más
cercano por similitud de ratio I:CHO y dosis diaria total; ese modelo actúa como
sustituto fisiológico para la integración numérica. El parámetro clínico que
gobierna el comportamiento personalizado en la simulación (el bolo de comida =
carbohidratos / CR) es el CR REAL del paciente.
"""

from __future__ import annotations

import glob
import os
import xml.etree.ElementTree as ET
from functools import lru_cache

import numpy as np

from ..config import OHIO_DIR

_PASO_MIN = 5  # resolución CGM de OhioT1DM (min por muestra)


def _umbral_seguridad(tdd: float) -> float:
    """Bolo máximo seguro (~20 % de la TDD), redondeado a 0.5 U (igual heurística
    que los perfiles virtuales en pacientes.py)."""
    return round(max(2.0, 0.20 * tdd) * 2) / 2


def _extraer_clinico(ruta: str) -> dict | None:
    """Extrae los parámetros terapéuticos reales de un XML OhioT1DM."""
    raiz = ET.parse(ruta).getroot()
    pid = raiz.get("id")
    if pid is None:
        return None

    gl_nodo = raiz.find("glucose_level")
    if gl_nodo is None:
        return None
    glucosa = [float(e.get("value")) for e in gl_nodo.findall("event")]
    if len(glucosa) < 40:
        return None
    g_media = float(np.mean(glucosa))
    dias = max(1e-6, len(glucosa) * _PASO_MIN / 60 / 24)

    # Basal media (U/h)
    basal_nodo = raiz.find("basal")
    basal_vals = [float(e.get("value")) for e in basal_nodo.findall("event")] if basal_nodo is not None else []
    basal_media = float(np.mean(basal_vals)) if basal_vals else 0.7

    # Bolos: pares (dosis, carbohidratos) → CR real; total para TDD
    cr_pares: list[float] = []
    total_bolus = 0.0
    bolus_nodo = raiz.find("bolus")
    if bolus_nodo is not None:
        for e in bolus_nodo.findall("event"):
            dose = float(e.get("dose", 0) or 0)
            carb = float(e.get("bwz_carb_input", 0) or 0)
            total_bolus += dose
            if carb > 0 and dose > 0.5:
                cr_pares.append(carb / dose)

    tdd = basal_media * 24 + (total_bolus / dias)
    cr = float(np.median(cr_pares)) if cr_pares else (500.0 / tdd)
    cr_origen = "asistente de bolo" if cr_pares else "regla 500"
    isf = 1800.0 / tdd if tdd > 0 else 50.0

    return {
        "id": pid,
        "peso_header": float(raiz.get("weight", 0) or 0),
        "g_media": round(g_media, 0),
        "basal_media": round(basal_media, 2),
        "CR": round(cr, 1),
        "CR_origen": cr_origen,
        "ISF": round(isf, 1),
        "TDD": round(tdd, 1),
    }


def _mapear_uvapadova(cr: float, tdd: float, adultos: list[dict]) -> dict:
    """Devuelve el perfil adulto UVA/Padova más cercano por (CR, TDD)."""
    mejor, mejor_d = adultos[0], float("inf")
    for a in adultos:
        acr = a["parametros"]["CR"]
        atdd = a["parametros"]["TDD"]
        d = ((cr - acr) / 10.0) ** 2 + ((tdd - atdd) / 40.0) ** 2
        if d < mejor_d:
            mejor_d, mejor = d, a
    return mejor


@lru_cache(maxsize=1)
def cargar_perfiles_ohio() -> dict[str, dict]:
    """Devuelve {ohio_id: perfil} para los pacientes reales disponibles en disco.

    Vacío si no hay XML en datos/ohio (el sistema sigue operando solo con los
    perfiles virtuales UVA/Padova)."""
    # Import diferido para romper la dependencia circular con pacientes.py
    from .pacientes import _cargar_virtuales

    adultos = [p for p in _cargar_virtuales().values() if p["tipo"] == "adulto"]
    if not adultos:
        return {}

    perfiles: dict[str, dict] = {}
    vistos: set[str] = set()
    for ruta in sorted(glob.glob(os.path.join(str(OHIO_DIR), "*-ws-testing.xml"))):
        clin = _extraer_clinico(ruta)
        if clin is None or clin["id"] in vistos:
            continue
        vistos.add(clin["id"])

        modelo = _mapear_uvapadova(clin["CR"], clin["TDD"], adultos)
        modelo_name = modelo["simglucose_name"]
        clave = f"ohio-{clin['id']}"

        perfiles[clave] = {
            "id": clave,
            "alias": f"OhioT1DM #{clin['id']} — real · I:CHO {clin['CR']} g/U",
            "tipo": "real",
            # El frontend envía este valor como patient_name; el API lo resuelve
            # con obtener_perfil() para recuperar el CR real.
            "simglucose_name": clave,
            # Modelo fisiológico real que ejecuta simglucose (sustituto UVA/Padova).
            "modelo_fisiologico": modelo_name,
            "parametros": {
                "CR": clin["CR"],
                "ISF": clin["ISF"],
                "TDD": clin["TDD"],
                "glucosaBasal": clin["g_media"],
                "peso_kg": modelo["parametros"]["peso_kg"],
                "edad": None,
            },
            "perfil_clinico": (
                f"Paciente REAL del dataset OhioT1DM (#{clin['id']}). Parámetros "
                f"terapéuticos documentados: ratio comida={clin['CR']} g/U "
                f"({clin['CR_origen']}), sensibilidad≈{clin['ISF']} mg/dL/U, "
                f"dosis diaria≈{clin['TDD']} U/día, basal media={clin['basal_media']} U/h. "
                f"Simulado sobre el modelo fisiológico UVA/Padova más cercano "
                f"({modelo_name})."
            ),
            "umbral_hipoglicemia_critica": _umbral_seguridad(clin["TDD"]),
        }
    return perfiles
