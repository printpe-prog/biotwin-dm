"""
engine/pacientes.py — Perfiles de pacientes virtuales REALES.

Construye los perfiles directamente desde los parámetros clínicos que distribuye
simglucose (Quest.csv y vpatient_params.csv), que provienen del UVA/Padova T1DM
Metabolic Simulator (aprobado por la FDA). Esto satisface el OE1 del informe:
≥10 perfiles virtuales (10 niños, 10 adolescentes, 10 adultos = 30).

Campos clínicos por paciente:
  - CR  : carb ratio (g/U)           ← Quest.csv "CR"
  - ISF : factor de sensibilidad     ← Quest.csv "CF" (correction factor)
  - TDD : dosis diaria total (U/día) ← Quest.csv "TDI"
  - edad                             ← Quest.csv "Age"
  - peso_kg, glucosaBasal            ← vpatient_params.csv "BW", "Gb"
"""

from __future__ import annotations

import os
from functools import lru_cache

import pandas as pd
import simglucose

_PARAMS_DIR = os.path.join(os.path.dirname(simglucose.__file__), "params")

_TIPO = {"child": "pediatrico", "adolescent": "adolescente", "adult": "adulto"}

_DESC = {
    "pediatrico": "Paciente pediátrico (UVA/Padova). Alta sensibilidad y variabilidad glucémica.",
    "adolescente": "Paciente adolescente (UVA/Padova). Variabilidad elevada; fenómeno del alba frecuente.",
    "adulto": "Paciente adulto (UVA/Padova). Perfil metabólico estable de referencia.",
}


@lru_cache(maxsize=1)
def _tablas() -> tuple[pd.DataFrame, pd.DataFrame]:
    quest = pd.read_csv(os.path.join(_PARAMS_DIR, "Quest.csv"))
    vp = pd.read_csv(os.path.join(_PARAMS_DIR, "vpatient_params.csv"))
    return quest, vp


def _umbral_seguridad(tdi: float, cr: float) -> float:
    """
    Umbral de seguridad para un bolo único (U). Heurística clínica: un bolo no
    debería exceder ~20 % de la dosis diaria total. Se redondea a 0.5 U.
    """
    return round(max(2.0, 0.20 * tdi) * 2) / 2


@lru_cache(maxsize=1)
def _cargar_virtuales() -> dict[str, dict]:
    """Devuelve {simglucose_name: perfil} para los 30 pacientes virtuales UVA/Padova."""
    quest, vp = _tablas()
    vp_idx = vp.set_index("Name")
    perfiles: dict[str, dict] = {}

    for _, q in quest.iterrows():
        name = q["Name"]
        clase = name.split("#")[0]
        tipo = _TIPO.get(clase, "adulto")
        row = vp_idx.loc[name]
        cr = float(q["CR"])
        isf = round(float(q["CF"]), 1)
        tdd = round(float(q["TDI"]), 1)
        edad = int(q["Age"])
        peso = round(float(row["BW"]), 1)
        gb = round(float(row["Gb"]), 0)
        num = name.split("#")[1]

        perfiles[name] = {
            "id": f"sg-{clase}-{num}",
            "alias": f"{tipo.capitalize()} #{num} — {edad} años · {peso} kg",
            "tipo": tipo,
            "simglucose_name": name,
            "parametros": {
                "CR": cr,
                "ISF": isf,
                "TDD": tdd,
                "glucosaBasal": gb,
                "peso_kg": peso,
                "edad": edad,
            },
            "perfil_clinico": (
                f"{_DESC[tipo]} Ratio comida={cr} g/U, Sensibilidad={isf} mg/dL/U, "
                f"Dosis diaria={tdd} U/día. Modelo UVA/Padova FDA."
            ),
            "umbral_hipoglicemia_critica": _umbral_seguridad(tdd, cr),
        }
    return perfiles


@lru_cache(maxsize=1)
def cargar_perfiles() -> dict[str, dict]:
    """Devuelve {clave: perfil}: 30 virtuales UVA/Padova + N reales de OhioT1DM
    (si hay XML disponibles en datos/ohio)."""
    # Import diferido: ohio_pacientes usa _cargar_virtuales para el mapeo.
    from .ohio_pacientes import cargar_perfiles_ohio

    return {**_cargar_virtuales(), **cargar_perfiles_ohio()}


def listar_perfiles() -> list[dict]:
    """Lista ordenada: adultos, adolescentes, niños y, al final, pacientes reales."""
    perfiles = cargar_perfiles()
    orden = {"adulto": 0, "adolescente": 1, "pediatrico": 2, "real": 3}
    return sorted(perfiles.values(), key=lambda p: (orden.get(p["tipo"], 9), p["simglucose_name"]))


def obtener_perfil(simglucose_name: str) -> dict | None:
    return cargar_perfiles().get(simglucose_name)


@lru_cache(maxsize=64)
def basal_estacionario(simglucose_name: str) -> float:
    """
    Tasa basal de insulina en estado estacionario (U/min), derivada de los
    parámetros del paciente: u2ss [pmol/kg/min] · BW / 6000 → U/min.
    """
    _, vp = _tablas()
    row = vp.set_index("Name").loc[simglucose_name]
    return float(row["u2ss"]) * float(row["BW"]) / 6000.0
