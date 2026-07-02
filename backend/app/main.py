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

import base64
import os
import secrets
import warnings

warnings.filterwarnings("ignore")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import CORS_ORIGINS, FRONTEND_DIR, METAS
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

# --- Acceso privado opcional (HTTP Basic Auth) ---
# Se activa SOLO si BIOTWIN_PASS está definida en el entorno. Sirve para exponer
# la app por un túnel (Cloudflare/ngrok) sin que sea pública. En local, sin esa
# variable, no pide contraseña.
_AUTH_USER = os.getenv("BIOTWIN_USER", "biotwin")
_AUTH_PASS = os.getenv("BIOTWIN_PASS")


@app.middleware("http")
async def _basic_auth(request: Request, call_next):
    if _AUTH_PASS and request.method != "OPTIONS":
        cabecera = request.headers.get("Authorization", "")
        autorizado = False
        if cabecera.startswith("Basic "):
            try:
                usuario, _, clave = base64.b64decode(cabecera[6:]).decode("utf-8").partition(":")
                autorizado = secrets.compare_digest(usuario, _AUTH_USER) and secrets.compare_digest(clave, _AUTH_PASS)
            except Exception:
                autorizado = False
        if not autorizado:
            return Response(
                status_code=401,
                headers={"WWW-Authenticate": 'Basic realm="BioTwin-DM"'},
                content="Acceso restringido.",
            )
    return await call_next(request)


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


# ======================== Frontend (modo unificado) ========================
# FastAPI sirve también la SPA en el MISMO origen, de modo que un único puerto
# (8001) entrega tanto la API como la interfaz. Esto permite exponer toda la app
# por un solo túnel y evita problemas de CORS. Solo se publican js/ y css/ — el
# resto del repo (backend/, datos/ohio con licencia DUA, .git) NO se expone.
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")


@app.get("/", include_in_schema=False)
def _index() -> FileResponse:
    return FileResponse(str(FRONTEND_DIR / "index.html"))
