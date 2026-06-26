"""
main.py — API FastAPI de BioTwin-DM.

Capa de Aplicación y Servicios (Backend API) descrita en el informe (sección
3.2). Expone endpoints asíncronos que orquestan el motor de simulación
(simglucose / UVA/Padova), el agente RL, la validación contra dataset y el
módulo de seguridad (cifrado Fernet real).

Ejecutar:
    venv\\Scripts\\uvicorn app.main:app --reload --port 8001
"""

from __future__ import annotations

import warnings

warnings.filterwarnings("ignore")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import CORS_ORIGINS, METAS
from .engine.pacientes import listar_perfiles, obtener_perfil
from .engine.simulador import simular
from .modelos import (
    PacienteOut,
    SimulacionRequest,
    SimulacionResponse,
    ValidacionRequest,
    ValidacionResponse,
)
from .rl.politica import cargar_politica, politica_disponible
from .seguridad.cifrado import motor
from .validacion.ohio import validar_ohio

app = FastAPI(
    title="BioTwin-DM API",
    description="Gemelo digital del metabolismo glucémico (UVA/Padova + RL).",
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/salud")
def salud() -> dict:
    """Estado del servicio y de los componentes (RL, metas)."""
    return {
        "status": "ok",
        "version": __version__,
        "motor": "simglucose UVA/Padova (FDA)",
        "rl_disponible": politica_disponible(),
        "metas": METAS,
        "ops_cifradas": motor.ops_cifradas,
    }


@app.get("/pacientes", response_model=list[PacienteOut])
def pacientes() -> list[dict]:
    """Lista los ≥10 perfiles virtuales (OE1): 10 niños, 10 adolescentes, 10 adultos."""
    return listar_perfiles()


@app.post("/simular", response_model=SimulacionResponse)
def simular_endpoint(req: SimulacionRequest) -> dict:
    """Ejecuta una simulación predictiva (motor UVA/Padova) bajo control RL o PID."""
    if obtener_perfil(req.patient_name) is None:
        raise HTTPException(status_code=404, detail=f"Paciente desconocido: {req.patient_name}")

    modelo = cargar_politica() if req.usar_rl else None
    res = simular(
        patient_name=req.patient_name,
        cho_g=req.cho_g,
        bolus_u=req.bolus_u,
        horizonte_min=req.horizonte_min,
        usar_rl=req.usar_rl,
        seed=req.seed,
        modelo_rl=modelo,
    )

    # --- Flujo de seguridad REAL (cifrado Fernet + anonimización SHA-256) ---
    evento = "simulation_request_fallback" if res["fallback_activado"] else "simulation_request"
    flujo = motor.registrar_flujo_seguridad(
        evento,
        {
            "patient_id": req.patient_name,
            "cho_g": req.cho_g,
            "insulin_u": res["bolus_efectivo"],
            "controller": res["controlador"],
        },
        patient_id=req.patient_name,
    )
    res["flujo_seguridad"] = flujo
    return res


@app.post("/validar", response_model=ValidacionResponse)
def validar_endpoint(req: ValidacionRequest) -> dict:
    """Valida el gemelo digital contra el dataset (OE4): RMSE y R² reales."""
    return validar_ohio(req.patient_id, req.horizonte_pred_min)
