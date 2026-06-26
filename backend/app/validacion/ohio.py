"""
validacion/ohio.py — Pipeline de validación predictiva (OE4).

Mide la precisión del gemelo digital prediciendo la glucosa `h` minutos hacia
adelante sobre una serie de referencia, y reportando RMSE, MAE y R² REALES
calculados con scikit-learn (no valores fijos).

Fuente de datos (en orden de preferencia):
  1. OhioT1DM real: si existe `datos/ohio/<id>-ws-testing.xml` (formato oficial
     del dataset), se parsea y se usa la serie CGM real del paciente.
  2. Referencia in-silico: si no hay dataset (requiere DUA con Ohio University),
     se genera una traza CGM realista con simglucose + ruido de sensor Dexcom,
     claramente etiquetada como sintética.

El predictor es un modelo autorregresivo Ridge (ventana de 30 min + tendencia)
entrenado sobre la primera mitad de la serie y evaluado en la segunda (hold-out),
una metodología estándar y reproducible en predicción glucémica.
"""

from __future__ import annotations

import warnings
import xml.etree.ElementTree as ET
from datetime import datetime
from functools import lru_cache

warnings.filterwarnings("ignore")

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ..config import METAS, OHIO_DIR, SIM

_PASO_SERIE = 5  # min por muestra de la serie de referencia


# ===================== Fuentes de datos =====================
def _parse_ohio_xml(ruta) -> list[float]:
    """Parsea la serie glucose_level de un archivo OhioT1DM (.xml)."""
    raiz = ET.parse(ruta).getroot()
    nodo = raiz.find("glucose_level")
    valores = [float(ev.get("value")) for ev in nodo.findall("event")]
    return valores


def _buscar_ohio(patient_id: str):
    for patron in (f"{patient_id}-ws-testing.xml", f"{patient_id}-ws-training.xml", f"{patient_id}.xml"):
        ruta = OHIO_DIR / patron
        if ruta.exists():
            return ruta
    return None


@lru_cache(maxsize=4)
def _serie_sintetica(semilla: int = 559, horas: int = 72) -> tuple:
    """
    Genera `horas` de CGM con simglucose (control basal-bolo + comidas diarias) y
    ruido de sensor Dexcom, remuestreada a 5 min (igual que OhioT1DM). Sirve como
    referencia mientras no se disponga del dataset real.
    """
    from simglucose.actuator.pump import InsulinPump
    from simglucose.controller.base import Action
    from simglucose.controller.basal_bolus_ctrller import BBController
    from simglucose.patient.t1dpatient import T1DPatient
    from simglucose.sensor.cgm import CGMSensor
    from simglucose.simulation.env import T1DSimEnv
    from simglucose.simulation.scenario import CustomScenario

    patient = T1DPatient.withName("adult#001")
    sensor = CGMSensor.withName("Dexcom", seed=semilla)
    pump = InsulinPump.withName("Insulet")
    start = datetime(2026, 1, 1, 0, 0, 0)
    comidas = []
    for dia in range(int(np.ceil(horas / 24))):
        comidas += [(dia * 24 + 7, 55), (dia * 24 + 13, 75), (dia * 24 + 19, 60)]
    env = T1DSimEnv(patient, sensor, pump, CustomScenario(start_time=start, scenario=comidas))
    env.reset()
    ctrller = BBController()
    st = int(sensor.sample_time)
    pasos = int(horas * 60 / st)

    # Control subóptimo (bolos parciales) → excursiones glucémicas realistas,
    # comparables a la variabilidad de pacientes reales de OhioT1DM.
    factor_dosis = 0.40
    serie_raw, tiempos, t = [], [], 0
    obs, reward, done, info = env.step(Action(basal=0, bolus=0))
    for _ in range(pasos):
        a = ctrller.policy(obs, reward, done, **info)
        accion = Action(basal=a.basal, bolus=a.bolus * factor_dosis)
        obs, reward, done, info = env.step(accion)
        serie_raw.append(float(obs.CGM))
        tiempos.append(t)
        t += st
        if done:
            break
    # Remuestreo a grilla de 5 min (resolución de OhioT1DM)
    grilla = np.arange(0, tiempos[-1] + 1, _PASO_SERIE)
    serie5 = np.interp(grilla, tiempos, serie_raw)
    return tuple(round(float(v), 2) for v in serie5), "in-silico (simglucose + ruido Dexcom)"


def _suavizar(serie: list[float], ventana: int = 7) -> list[float]:
    """
    Media móvil centrada (preprocesamiento del informe: filtrado de señal CGM).
    Reduce el ruido de calibración del sensor antes de la inferencia.
    """
    arr = np.asarray(serie, dtype=float)
    k = ventana // 2
    out = np.copy(arr)
    for i in range(len(arr)):
        a, b = max(0, i - k), min(len(arr), i + k + 1)
        out[i] = arr[a:b].mean()
    return out.tolist()


def _serie_referencia(patient_id: str):
    ruta = _buscar_ohio(patient_id)
    if ruta is not None:
        serie = _parse_ohio_xml(ruta)
        return _suavizar(serie), f"OhioT1DM real ({ruta.name})"
    serie, fuente = _serie_sintetica()
    return _suavizar(list(serie)), fuente


# ===================== Predictor autorregresivo =====================
def _ventanas(serie: np.ndarray, p: int, h: int):
    """
    Construye features AR y predice el INCREMENTO a h pasos (delta sobre la
    persistencia), lo que ancla el predictor al valor actual y mejora el R².
    Devuelve (X, delta, base) donde base = valor actual (serie[t]).
    """
    X, delta, base = [], [], []
    for t in range(p, len(serie) - h):
        ventana = serie[t - p : t]
        feats = np.concatenate(
            [ventana, [ventana[-1] - ventana[0], ventana[-1] - ventana[-2]]]
        )
        X.append(feats)
        base.append(serie[t])
        delta.append(serie[t + h] - serie[t])
    return np.array(X), np.array(delta), np.array(base)


def validar_ohio(patient_id: str = "559", horizonte_pred_min: int = 30) -> dict:
    serie_lst, fuente = _serie_referencia(patient_id)
    serie = np.array(serie_lst, dtype=float)
    n = len(serie)
    if n < 40:
        raise ValueError("Serie de referencia demasiado corta para validar.")

    h = max(1, horizonte_pred_min // _PASO_SERIE)
    p = 12  # ventana AR de 60 min (12 muestras de 5 min)
    X, delta, base = _ventanas(serie, p, h)

    split = int(len(X) * 0.6)
    modelo = make_pipeline(StandardScaler(), Ridge(alpha=1.0))
    modelo.fit(X[:split], delta[:split])
    delta_pred = modelo.predict(X[split:])

    base_te = base[split:]
    pred = base_te + delta_pred              # predicción absoluta = persistencia + corrección
    real = base_te + delta[split:]           # = serie[t+h]

    rmse = float(np.sqrt(mean_squared_error(real, pred)))
    mae = float(mean_absolute_error(real, pred))
    r2 = float(r2_score(real, pred))

    # Series alineadas para graficar (hold-out): None en la zona de entrenamiento.
    offset = p + split
    serie_real: list = [None] * n
    serie_pred: list = [None] * n
    for i in range(len(pred)):
        idx = offset + i
        if idx + h < n:
            serie_real[idx + h] = round(float(real[i]), 1)
            serie_pred[idx + h] = round(float(pred[i]), 1)

    labels = [_etiqueta(i * _PASO_SERIE) for i in range(n)]

    return {
        "patient_id": patient_id,
        "fuente": fuente,
        "n_muestras": int(len(real)),
        "rmse": round(rmse, 2),
        "mae": round(mae, 2),
        "r2": round(r2, 3),
        "cumple_rmse": bool(rmse < METAS["rmse_max"]),
        "cumple_r2": bool(r2 >= METAS["r2_min"]),
        "serie_real": serie_real,
        "serie_predicha": serie_pred,
        "labels": labels,
    }


def _etiqueta(minuto: int) -> str:
    total = minuto % 1440
    return f"{total // 60:02d}:{total % 60:02d}"
