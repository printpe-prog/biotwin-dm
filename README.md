# BioTwin-DM

> **Plataforma de simulación predictiva basada en gemelos digitales para la optimización de la terapia de insulina en pacientes con Diabetes Tipo 1.**

<p align="left">
  <img src="https://img.shields.io/badge/status-en%20construcci%C3%B3n-orange" alt="status: en construcción">
  <img src="https://img.shields.io/badge/proyecto-tesis%20de%20t%C3%ADtulo-1F4E79" alt="proyecto de título">
  <img src="https://img.shields.io/badge/universidad-UNAB-2E75B6" alt="UNAB">
</p>

---

> ### 🚧 Proyecto en construcción
> Este es un **proyecto de título en desarrollo activo** (Ingeniería en Computación e Informática, Universidad Andrés Bello). El código, la documentación y los resultados pueden cambiar sin previo aviso mientras avanza la investigación. Se comparte públicamente con fines de **portafolio y transparencia académica** — no está pensado para uso clínico ni en producción.

---

## ¿Qué hace?

BioTwin-DM simula, **antes de que ocurra**, cómo va a responder la glucosa de un paciente con Diabetes Tipo 1 ante una dosis de insulina. Combina:

- Un **motor fisiológico** basado en el modelo UVA/Padova (`simglucose`), el mismo estándar in-silico aprobado por la FDA para probar dispositivos de insulina.
- Un **agente de aprendizaje por refuerzo** (PPO, Stable-Baselines3) que sugiere ajustes de insulina basal manteniendo al paciente en rango seguro.
- Un **predictor glucémico** validado contra pacientes reales del dataset OhioT1DM.
- Un **mecanismo de seguridad por diseño**: si una dosis supera el umbral clínico del paciente, el sistema anula la IA automáticamente y conmuta a un controlador clásico.

La idea central: **anticipar para proteger** — mostrar el efecto de una decisión antes de tomarla.

## Resultados actuales

| Métrica | Meta | Resultado |
|---|---|---|
| Tiempo en rango (TIR) | > 80 % | **98.3 %** |
| Error de predicción (RMSE) | < 25 mg/dL | **10.0 mg/dL** |
| Ajuste del modelo (R²) | ≥ 0.85 | **0.899** |
| Perfiles virtuales | ≥ 10 | **30** (niños, adolescentes, adultos) |

## Dos formas de ejecutarlo

| Modo | Motor | Uso |
|------|-------|-----|
| **Completo** | Backend Python real: `simglucose` + agente RL + validación OhioT1DM + cifrado Fernet | Requiere levantar el backend (ver [`backend/README.md`](backend/README.md)) |
| **Offline / portable** | Motor JavaScript local (modelo compartimental RK4) | Solo el frontend — abre `BioTwin_DM_Prototype_v1.html` o sirve `index.html` |

El frontend detecta el backend automáticamente: si responde en `localhost:8001` usa el motor real; si no, cae al motor local.

### Arranque rápido (modo completo)

```powershell
# Terminal 1 — backend
cd backend
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt
venv\Scripts\uvicorn app.main:app --port 8001

# Terminal 2 — frontend
node dev-server.mjs        # http://localhost:8000
```

### Solo quiero verlo, sin instalar nada

Abre **`BioTwin_DM_Prototype_v1.html`** — es el prototipo empaquetado en un único archivo autocontenido, con doble clic funciona.

## Stack técnico

| Capa | Tecnología |
|---|---|
| Motor fisiológico | Python · `simglucose` (UVA/Padova, FDA) |
| Agente de IA | Stable-Baselines3 (PPO) |
| Backend | FastAPI |
| Frontend | JavaScript ES2022 (módulos nativos) · Chart.js 4.x |
| Estilos | Tailwind CSS |
| Seguridad | Cifrado Fernet (AES-128-CBC + HMAC) — Ley 19.628 / 21.719 |

## Estructura del proyecto

```
biotwin/
├── backend/                   # Motor fisiológico, agente RL, API
├── index.html                 # Punto de entrada del frontend
├── js/                        # Módulos ES (config, engine, ui, pipeline)
├── css/                       # Estilos propios
├── dev-server.mjs             # Servidor estático de desarrollo
└── BioTwin_DM_Prototype_v1.html   # Build portable de un solo archivo
```

## Alcance y limitaciones

- Funciona en **simulación**, no con pacientes reales.
- Usa 30 perfiles virtuales del simulador UVA/Padova, más parámetros clínicos derivados de 12 pacientes del dataset OhioT1DM (los datos originales del dataset **no se incluyen** en este repositorio por su Acuerdo de Uso de Datos).
- **No reemplaza el criterio médico** — es una herramienta de apoyo a la decisión terapéutica.

## Marco de referencia

- Dataset de validación: **OhioT1DM** (Marling & Bunescu, 2020)
- Marco legal de protección de datos: **Ley N.º 19.628** y **Ley N.º 21.719** (Chile)
- Proyecto de título — Universidad Andrés Bello · Ingeniería en Computación e Informática
