"""
engine/simulador.py — Motor de simulación fisiológica REAL.

Reemplaza el motor RK4 reimplementado en JavaScript por el simulador UVA/Padova
T1DM (aprobado por la FDA) que distribuye simglucose. Simula la respuesta
glucémica de un paciente virtual ante una ingesta de carbohidratos y un bolo de
insulina, bajo el control del agente RL entrenado o del controlador PID base.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np
from simglucose.actuator.pump import InsulinPump
from simglucose.controller.base import Action
from simglucose.patient.t1dpatient import T1DPatient
from simglucose.sensor.cgm import CGMSensor
from simglucose.simulation.env import T1DSimEnv
from simglucose.simulation.scenario import CustomScenario

from ..config import RANGOS
from .pacientes import basal_estacionario, obtener_perfil
from ..rl.controlador_pid import ControladorPID
from ..rl.entorno import MAX_FACTOR_BASAL, OBJETIVO, construir_obs


def _metricas(valores: list[float]) -> dict:
    arr = [v for v in valores if v is not None]
    n = len(arr) or 1
    return {
        "tir": round(100 * sum(RANGOS["hipo"] <= v <= RANGOS["hiper"] for v in arr) / n, 1),
        "tbr": round(100 * sum(v < RANGOS["hipo"] for v in arr) / n, 1),
        "tar": round(100 * sum(v > RANGOS["hiper"] for v in arr) / n, 1),
        "glucosa_media": round(float(np.mean(arr)), 1),
    }


def _decision_clinica(g: float) -> str:
    if g is None:
        return "Sin datos predictivos disponibles."
    if g > RANGOS["hiper_severa"]:
        return f"🔴 Hiperglicemia severa proyectada (>{round(g)} mg/dL). Corrección con bolo urgente."
    if g > RANGOS["hiper"]:
        return "🟡 Hiperglicemia leve-moderada. Ajustar ratio I:CHO en la próxima comida."
    if g >= RANGOS["hipo"]:
        return "🟢 Glucosa en rango objetivo. Mantener régimen actual. Revisar en 2 h."
    if g >= RANGOS["hipo_severa"]:
        return "🟠 Hipoglicemia leve. Ingerir 15 g de glucosa rápida. Reevaluar en 15 min."
    return "🔴 HIPOGLICEMIA SEVERA. Acción inmediata requerida."


def simular(
    patient_name: str,
    cho_g: float,
    bolus_u: float,
    horizonte_min: int = 360,
    usar_rl: bool = True,
    seed: int = 1,
    modelo_rl=None,
) -> dict:
    """
    Ejecuta la simulación y devuelve la trayectoria glucémica + métricas.

    El controlador activo (RL o PID) modula la insulina basal a lo largo del
    horizonte; el bolo del usuario y la comida se aplican en t=0.
    """
    perfil = obtener_perfil(patient_name)
    if perfil is None:
        raise ValueError(f"Paciente desconocido: {patient_name}")

    # Modelo fisiológico real que ejecuta simglucose. Para pacientes virtuales es
    # el propio simglucose_name; para pacientes reales de OhioT1DM es el modelo
    # UVA/Padova mapeado (sustituto fisiológico), mientras que el CR del perfil es
    # el ratio I:CHO REAL del paciente.
    modelo_sim = perfil.get("modelo_fisiologico") or perfil["simglucose_name"]

    # --- Seguridad: recorte de bolo fuera de umbral (fallback al PID) ---
    umbral = perfil["umbral_hipoglicemia_critica"]
    fallback = bolus_u > umbral
    bolus_efectivo = min(bolus_u, umbral)
    controlador = "PID" if (fallback or not usar_rl or modelo_rl is None) else "RL"

    patient = T1DPatient.withName(modelo_sim)
    sensor = CGMSensor.withName("Dexcom", seed=seed)
    pump = InsulinPump.withName("Insulet")
    start = datetime(2026, 1, 1, 8, 0, 0)
    escenario = CustomScenario(start_time=start, scenario=[(0, cho_g)])  # comida en t=0
    env = T1DSimEnv(patient, sensor, pump, escenario)
    env.reset()

    basal = basal_estacionario(modelo_sim)
    CR = perfil["parametros"]["CR"]
    max_rate = basal * MAX_FACTOR_BASAL
    sample_time = int(sensor.sample_time)
    n = max(1, int(horizonte_min / sample_time))
    pid = ControladorPID(basal=basal, objetivo=OBJETIVO)

    g0 = float(perfil["parametros"]["glucosaBasal"])
    bolo_inicial = 0.0 if controlador == "RL" else bolus_efectivo
    puntos = [{"t_min": 0, "glucosa": round(g0, 1), "insulina_u": round(bolo_inicial, 2), "cho_g": cho_g}]

    g = g0
    g_prev = g0
    tasa_basal_prev = basal
    for k in range(n):
        tendencia = (g - g_prev) / sample_time
        if controlador == "RL":
            # Closed-loop híbrido: bolo de comida automático (calculadora CR) +
            # modulación de la basal por el agente RL.
            comida_g = cho_g if k == 0 else 0.0
            bolo_comida = (comida_g / CR) if comida_g > 0 else 0.0
            obs_vec = construir_obs(g, tendencia, tasa_basal_prev, max_rate, comida_g)
            accion, _ = modelo_rl.predict(obs_vec, deterministic=True)
            tasa = float(np.clip(accion[0], 0.0, 1.0)) * max_rate
            accion_pump = Action(basal=tasa, bolus=bolo_comida / sample_time)
            insulina_punto = tasa * sample_time + bolo_comida
            tasa_basal_prev = tasa
        else:
            # Línea base: bolo manual del usuario en t=0 + corrección PID del basal
            tasa = pid.step(g, sample_time)
            bolus_rate = (bolus_efectivo / sample_time) if k == 0 else 0.0
            accion_pump = Action(basal=tasa, bolus=bolus_rate)
            insulina_punto = tasa * sample_time + (bolus_efectivo if k == 0 else 0.0)

        obs, _, done, info = env.step(accion_pump)
        g_prev = g
        g = float(obs.CGM)

        t = (k + 1) * sample_time
        puntos.append(
            {
                "t_min": t,
                "glucosa": round(g, 1),
                "insulina_u": round(insulina_punto, 2),
                "cho_g": cho_g if k == 0 else 0.0,
            }
        )
        if done:
            break

    valores = [p["glucosa"] for p in puntos]
    met = _metricas(valores)
    g_final = valores[-1]

    return {
        "patient_name": patient_name,
        "controlador": controlador,
        "puntos": puntos,
        "tir": met["tir"],
        "tbr": met["tbr"],
        "tar": met["tar"],
        "glucosa_media": met["glucosa_media"],
        "glucosa_final": round(g_final, 1),
        "decision_clinica": _decision_clinica(g_final),
        "fallback_activado": fallback,
        "bolus_solicitado": bolus_u,
        "bolus_efectivo": bolus_efectivo,
        "umbral": umbral,
    }
