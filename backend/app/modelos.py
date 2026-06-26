"""
modelos.py — Esquemas Pydantic (request/response) de la API.

Definen el contrato cliente-servidor entre el frontend JavaScript y el backend
FastAPI. Reflejan las entidades del informe: PacienteVirtual, SesionSimulacion
y RegistroGlucemico.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ============================ Pacientes ============================
class ParametrosPaciente(BaseModel):
    CR: float = Field(..., description="Ratio insulina:carbohidrato (g/U)")
    ISF: float = Field(..., description="Factor de sensibilidad a la insulina (mg/dL por U)")
    TDD: float = Field(..., description="Dosis diaria total estimada (U/día)")
    glucosaBasal: float = Field(..., description="Glucosa basal (mg/dL)")
    peso_kg: float = Field(..., description="Peso corporal (kg)")
    edad: float | None = Field(None, description="Edad (años)")


class PacienteOut(BaseModel):
    id: str
    alias: str
    tipo: str  # 'adulto' | 'adolescente' | 'pediatrico' | 'real'
    simglucose_name: str
    parametros: ParametrosPaciente
    perfil_clinico: str
    umbral_hipoglicemia_critica: float
    modelo_fisiologico: str | None = None  # modelo UVA/Padova mapeado (pacientes reales)


# ============================ Simulación ============================
class SimulacionRequest(BaseModel):
    patient_name: str = Field(..., description="Nombre simglucose, ej. 'adult#001'")
    cho_g: float = Field(0, ge=0, le=200, description="Carbohidratos ingeridos (g)")
    bolus_u: float = Field(0, ge=0, le=50, description="Bolo de insulina (U)")
    horizonte_min: int = Field(360, ge=60, le=1440)
    usar_rl: bool = Field(True, description="Usar agente RL (True) o controlador PID (False)")
    seed: int = Field(1, description="Semilla del sensor CGM para reproducibilidad")


class PuntoGlucosa(BaseModel):
    t_min: int
    glucosa: float
    insulina_u: float = 0.0
    cho_g: float = 0.0


class SimulacionResponse(BaseModel):
    patient_name: str
    controlador: str  # 'RL' | 'PID'
    puntos: list[PuntoGlucosa]
    tir: float
    tbr: float
    tar: float  # time above range
    glucosa_media: float
    glucosa_final: float
    decision_clinica: str
    fallback_activado: bool = False
    bolus_solicitado: float = 0.0
    bolus_efectivo: float = 0.0
    umbral: float = 0.0
    flujo_seguridad: dict


# ============================ Validación OhioT1DM ============================
class ValidacionRequest(BaseModel):
    patient_id: str = Field("559", description="ID de paciente OhioT1DM")
    horizonte_pred_min: int = Field(30, description="Horizonte de predicción a evaluar")


class ValidacionResponse(BaseModel):
    patient_id: str
    fuente: str
    n_muestras: int
    rmse: float
    mae: float
    r2: float
    cumple_rmse: bool
    cumple_r2: bool
    serie_real: list[float | None]
    serie_predicha: list[float | None]
    labels: list[str]
