"""
medir_controladores.py — Reproduce las cifras de control que reporta el proyecto.

Evalúa los TRES controladores implementados en el MISMO banco de pruebas
(24 h simuladas, paciente virtual adult#001, cinco semillas) y valida el
predictor glicémico. Todas las cifras del cartel y del resumen de una página
salen de aquí: ninguna se escribe a mano.

Uso (desde backend/):
    venv\Scripts\python.exe medir_controladores.py medicion.json

Salida esperada (noviembre 2026):
    PID    TIR seed7 93.3 | prom 95.2 ± 2.5 | TBR 0.0
    PPO    TIR seed7 42.9 | prom 40.8 ± 5.1 | TBR 0.0
    basal  TIR seed7 87.3 | prom 92.0 ± 3.2 | TBR 0.0
    predictor RMSE 10.0 | R² 0.899 | 339 muestras (serie sintética)
"""

from __future__ import annotations

import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.rl.entorno import EntornoGlucosa, OBJETIVO
from app.rl.politica import cargar_politica
from app.rl.controlador_pid import ControladorPID
from app.validacion.ohio import validar_ohio

SEEDS = [7, 11, 23, 42, 101]


def metricas(bgs: list[float]) -> dict:
    a = np.array(bgs)
    pct = lambda mascara: round(100 * float(np.mean(mascara)), 1)
    return {
        "tir": pct((a >= 70) & (a <= 180)),
        "tbr": pct(a < 70),
        "tar": pct(a > 180),
        "tar250": pct(a > 250),
        "media": round(float(a.mean()), 1),
        "min": round(float(a.min()), 1),
        "max": round(float(a.max()), 1),
        "n": len(a),
    }


def correr(modo: str, seed: int, modelo) -> dict:
    """Un episodio de 24 h. modo: 'pid' | 'rl' | 'basal' (basal nominal constante)."""
    env = EntornoGlucosa(patient_name="adult#001", seed=seed)
    obs, _ = env.reset()
    pid = ControladorPID(basal=env.basal, objetivo=OBJETIVO)
    bgs: list[float] = []
    done = trunc = False
    while not (done or trunc):
        if modo == "rl":
            accion, _ = modelo.predict(obs, deterministic=True)
        elif modo == "pid":
            tasa = pid.step(float(obs[0]) * 400.0, env.sample_time)
            accion = np.array([min(tasa / env.max_rate, 1.0)], dtype=np.float32)
        else:
            accion = np.array([0.5], dtype=np.float32)  # 0.5 = basal nominal exacta
        obs, _, done, trunc, info = env.step(accion)
        bgs.append(float(info["bg"]))
    return metricas(bgs)


def main() -> None:
    destino = sys.argv[1] if len(sys.argv) > 1 else "medicion.json"
    modelo = cargar_politica()
    print("modelo RL:", "OK" if modelo is not None else "AUSENTE", flush=True)

    salida: dict = {}
    for modo in ("pid", "rl", "basal"):
        por_seed = {s: correr(modo, s, modelo) for s in SEEDS}
        tirs = [m["tir"] for m in por_seed.values()]
        salida[modo] = {
            "seed7": por_seed[SEEDS[0]],
            "tir_prom": round(float(np.mean(tirs)), 1),
            "tir_sd": round(float(np.std(tirs)), 1),
            "tir_por_seed": tirs,
            "tbr_max": max(m["tbr"] for m in por_seed.values()),
            "tar250_prom": round(float(np.mean([m["tar250"] for m in por_seed.values()])), 1),
        }
        print(f"{modo:6} TIR seed{SEEDS[0]} {salida[modo]['seed7']['tir']} | "
              f"prom {salida[modo]['tir_prom']} +- {salida[modo]['tir_sd']} | "
              f"TBR max {salida[modo]['tbr_max']}", flush=True)

    v = validar_ohio("559", 30)
    salida["predictor"] = {k: v[k] for k in
                           ("fuente", "n_muestras", "rmse", "mae", "r2", "cumple_rmse", "cumple_r2")}
    print("predictor:", salida["predictor"], flush=True)

    with open(destino, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=1)
    print("->", destino)


if __name__ == "__main__":
    main()
