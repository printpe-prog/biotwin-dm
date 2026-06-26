# BioTwin-DM — Backend (motor real)

Backend Python que materializa lo descrito en el informe (Capítulo III):
**simglucose (UVA/Padova, FDA)** + **agente RL (Stable-Baselines3)** +
**validación OhioT1DM (RMSE/R²)** + **cifrado Fernet real (Ley N° 19.628/21.719)**,
expuesto como API **FastAPI**.

## Arquitectura (capas del informe, sección 3.2)

```
app/
├── main.py              # Capa de Aplicación/Servicios (FastAPI, endpoints)
├── config.py            # Constantes clínicas y metas (TIR/TBR/RMSE/R²)
├── modelos.py           # Esquemas Pydantic (contrato cliente-servidor)
├── engine/              # Capa del Motor Core — Módulo Fisiológico
│   ├── pacientes.py     #   30 perfiles reales (Quest.csv + vpatient_params.csv)
│   └── simulador.py     #   simulación UVA/Padova (simglucose)
├── rl/                  # Capa del Motor Core — Módulo de Control (RL)
│   ├── entorno.py       #   entorno Gymnasium (recompensa orientada a TIR)
│   ├── entrenar.py      #   entrenamiento PPO (OE2)
│   ├── controlador_pid.py  # línea base PID (matriz de riesgos)
│   └── politica.py      #   carga de la política entrenada
├── validacion/
│   └── ohio.py          # Validación predictiva OE4 (RMSE/R² con scikit-learn)
└── seguridad/
    └── cifrado.py       # Capa de Datos y Seguridad — Fernet real + SHA-256
```

## Puesta en marcha

```powershell
# 1) Crear el entorno e instalar dependencias (una sola vez)
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt

# 2) Entrenar el agente RL (genera modelos_entrenados/ppo_glucosa_default.zip)
venv\Scripts\python -m app.rl.entrenar --patient adult#001 --timesteps 200000

# 3) Levantar la API
venv\Scripts\uvicorn app.main:app --port 8001 --reload
```

La API queda en `http://localhost:8001` · documentación interactiva en
`http://localhost:8001/docs`.

## Frontend + backend

```powershell
# Terminal 1 — backend
cd backend ; venv\Scripts\uvicorn app.main:app --port 8001

# Terminal 2 — frontend (raíz del proyecto)
node dev-server.mjs        # http://localhost:8000
```

El frontend detecta el backend automáticamente (`/salud`). Si no responde, cae
al **motor JavaScript local** (modo offline / build portable).

## Endpoints

| Método | Ruta         | Descripción |
|--------|--------------|-------------|
| GET    | `/salud`     | Estado del servicio, disponibilidad del RL, metas |
| GET    | `/pacientes` | ≥10 perfiles virtuales (OE1): 10 niños, 10 adolescentes, 10 adultos |
| POST   | `/simular`   | Simulación predictiva UVA/Padova (control RL o PID) + flujo de seguridad |
| POST   | `/validar`   | Validación OE4: RMSE y R² reales contra serie de referencia |

## Validación contra OhioT1DM real

El dataset OhioT1DM requiere un **Data Use Agreement (DUA)** con Ohio University
(no es de descarga libre). Para usarlo:

1. Solicitar acceso en <http://smarthealth.cs.ohio.edu/OhioT1DM-dataset.html>
   (formulario de DUA; firma el responsable institucional).
2. Copiar los `*-ws-testing.xml` a `backend/datos/ohio/` (ej. `559-ws-testing.xml`).
3. El pipeline los detecta automáticamente y reporta RMSE/R² sobre datos reales.

Mientras tanto, el endpoint usa una **serie in-silico** generada por simglucose
con ruido de sensor Dexcom (claramente etiquetada como tal en la respuesta).
