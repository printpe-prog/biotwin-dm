"""
config.py — Configuración central del backend.

Centraliza rutas, parámetros clínicos y constantes del dominio, reflejando los
mismos umbrales que el informe del proyecto (TIR>80%, TBR<4%, RMSE<25 mg/dL).
"""

from pathlib import Path

# --- Rutas del proyecto ---
BACKEND_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BACKEND_DIR.parent  # raíz del repo: index.html, js/, css/
MODELOS_DIR = BACKEND_DIR / "modelos_entrenados"
DATOS_DIR = BACKEND_DIR / "datos"
OHIO_DIR = DATOS_DIR / "ohio"
MODELOS_DIR.mkdir(exist_ok=True)
DATOS_DIR.mkdir(exist_ok=True)
OHIO_DIR.mkdir(exist_ok=True)

# --- Rangos glucémicos (mg/dL) ---
RANGOS = {
    "hipo_severa": 54,
    "hipo": 70,
    "hiper": 180,
    "hiper_severa": 250,
}

# --- Metas clínicas (informe, OE2/OE3) ---
METAS = {
    "tir_objetivo": 80.0,    # Time In Range > 80 %
    "tbr_max": 4.0,          # Time Below Range < 4 %
    "rmse_max": 25.0,        # RMSE de predicción < 25 mg/dL
    "r2_min": 0.85,          # R² de validación >= 0.85
}

# --- Simulación ---
SIM = {
    "paso_min": 5,           # resolución de muestreo de salida (min)
    "horizonte_pred_min": 360,  # 6 h de predicción
    "horizonte_rl_horas": 24,   # episodios RL de 24 h virtuales (OE2)
    "objetivo_glucosa": 140,    # objetivo central del controlador (mg/dL)
}

# --- CORS: orígenes permitidos para el frontend ---
CORS_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5173",
]
