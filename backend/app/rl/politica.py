"""
rl/politica.py — Carga y cacheo de la política RL entrenada.

Carga el modelo PPO entrenado (Stable-Baselines3) desde disco una sola vez. Si
no existe todavía un modelo entrenado, el backend opera con el controlador PID
(degradación elegante, coherente con la matriz de riesgos del informe).
"""

from __future__ import annotations

import warnings
from functools import lru_cache

warnings.filterwarnings("ignore")

from ..config import MODELOS_DIR

_DEFAULT = MODELOS_DIR / "ppo_glucosa_default.zip"


@lru_cache(maxsize=1)
def cargar_politica():
    """Devuelve el modelo PPO entrenado o None si aún no existe."""
    if not _DEFAULT.exists():
        return None
    from stable_baselines3 import PPO
    return PPO.load(str(_DEFAULT), device="cpu")


def politica_disponible() -> bool:
    return _DEFAULT.exists()
