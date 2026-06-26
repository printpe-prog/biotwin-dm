"""
rl/entrenar.py — Entrenamiento del agente de Aprendizaje por Refuerzo.

Entrena una política PPO (Stable-Baselines3) sobre el entorno EntornoGlucosa
(simglucose / UVA/Padova) con recompensa orientada a Time In Range. Cumple el
OE2 del informe: mantener la glucosa en 70–180 mg/dL > 80 % del tiempo en
episodios de 24 h virtuales.

Uso:
    venv\\Scripts\\python -m app.rl.entrenar --patient adult#001 --timesteps 60000
"""

from __future__ import annotations

import argparse
import warnings

warnings.filterwarnings("ignore")

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv

from app.config import MODELOS_DIR
from app.rl.entorno import EntornoGlucosa


def _make_env(patient: str, seed: int):
    def _f():
        return EntornoGlucosa(patient_name=patient, seed=seed)
    return _f


def evaluar(model, patient: str, seed: int = 7) -> dict:
    """Corre un episodio de 24 h con la política y reporta métricas clínicas."""
    env = EntornoGlucosa(patient_name=patient, seed=seed)
    obs, _ = env.reset()
    bgs: list[float] = []
    done = trunc = False
    while not (done or trunc):
        accion, _ = model.predict(obs, deterministic=True)
        obs, _, done, trunc, info = env.step(accion)
        bgs.append(info["bg"])
    arr = np.array(bgs)
    return {
        "tir": round(100 * np.mean((arr >= 70) & (arr <= 180)), 1),
        "tbr": round(100 * np.mean(arr < 70), 1),
        "tar": round(100 * np.mean(arr > 180), 1),
        "media": round(float(arr.mean()), 1),
        "n": len(bgs),
    }


def entrenar(patient: str = "adult#001", timesteps: int = 60000, seed: int = 1) -> str:
    print(f"[RL] Entrenando PPO sobre {patient} · {timesteps} timesteps ...")
    env = DummyVecEnv([_make_env(patient, seed)])
    model = PPO(
        "MlpPolicy",
        env,
        verbose=1,
        n_steps=1024,
        batch_size=128,
        gamma=0.99,
        gae_lambda=0.95,
        ent_coef=0.01,
        learning_rate=3e-4,
        seed=seed,
    )
    model.learn(total_timesteps=timesteps, progress_bar=False)

    nombre = "ppo_glucosa_" + patient.replace("#", "")
    ruta = MODELOS_DIR / f"{nombre}.zip"
    model.save(ruta)
    model.save(MODELOS_DIR / "ppo_glucosa_default.zip")  # política por defecto del backend

    metr = evaluar(model, patient)
    print(f"[RL] Listo. Modelo: {ruta.name}")
    print(f"[RL] Evaluación 24h: TIR={metr['tir']}% TBR={metr['tbr']}% TAR={metr['tar']}% media={metr['media']} mg/dL")
    cumple = "✓ OE2 cumplido" if metr["tir"] > 80 else "✗ TIR<80% (entrenar más timesteps)"
    print(f"[RL] {cumple}")
    return str(ruta)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--patient", default="adult#001")
    ap.add_argument("--timesteps", type=int, default=60000)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()
    entrenar(args.patient, args.timesteps, args.seed)
