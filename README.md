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
- Un **predictor glucémico** autorregresivo a 30 minutos. *Nota:* hoy se valida sobre una
  serie **sintética** generada con `simglucose` y ruido de sensor, no sobre pacientes
  reales: el dataset OhioT1DM requiere un Data Use Agreement con Ohio University y no
  está incluido en este repositorio. El código ya lo soporta si se dispone de él.
- Un **mecanismo de seguridad por diseño**: si una dosis supera el umbral clínico del paciente, el sistema anula la IA automáticamente y conmuta a un controlador clásico.

La idea central: **anticipar para proteger** — mostrar el efecto de una decisión antes de tomarla.

## Resultados actuales

Medidos en el mismo banco de pruebas: 24 h simuladas, paciente virtual `adult#001`,
cinco semillas. Reproducibles con `python backend/medir_controladores.py`.

| Métrica | Meta | Resultado |
|---|---|---|
| Tiempo en rango — controlador PID | > 80 % | **93,3 %** (95,2 % promedio) ✅ |
| Tiempo en rango — agente PPO | > 80 % | 42,9 % (40,8 % promedio) ❌ |
| Tiempo en hipoglicemia (TBR) | < 4 % | **0,0 %** ✅ |
| Error de predicción (RMSE) | < 25 mg/dL | **16,3 mg/dL** ✅ |
| Ajuste del modelo (R²) | ≥ 0,85 | 0,739 ❌ |
| Perfiles virtuales | ≥ 10 | **30** (niños, adolescentes, adultos) ✅ |

**Sobre el predictor:** la evaluación predice la señal **cruda** del sensor. Medirla contra la
serie suavizada eleva el R² a 0,899, pero eso resuelve un problema más fácil que el real: se
estaría prediciendo una versión alisada de la glucosa, no la que el sensor entrega. Con la
medición honesta el error cumple la meta y el ajuste no.

**Hallazgo principal:** el controlador PID clínico cumple la meta terapéutica, pero el
agente PPO no la alcanza y tampoco supera a la línea base (una infusión basal constante
ya obtiene 92,0 % en el mismo banco). Multiplicar por siete las iteraciones de
entrenamiento *empeoró* su desempeño, lo que apunta a una limitación de la función de
recompensa y no del volumen de entrenamiento. Es un resultado negativo que se reporta
tal cual.

## Dos formas de ejecutarlo

| Modo | Motor | Uso |
|------|-------|-----|
| **Completo** | Backend Python real: `simglucose` + agente RL + validación OhioT1DM + cifrado Fernet | Requiere levantar el backend (ver [`backend/README.md`](backend/README.md)) |
| **Offline / portable** | Motor JavaScript local (modelo compartimental RK4) | Solo el frontend — abre `BioTwin_DM_Prototype_v1.html` o sirve `index.html` |

La vista incluye **30 gemelos digitales preconfigurados** (10 adultos, 10 adolescentes
y 10 infantiles) y el botón **Nuevo paciente** para crear un perfil de prueba.
Los perfiles personalizados se guardan y simulan en el navegador; el modo conectado
usa simglucose para los gemelos del catálogo. La versión portable usa el modelo local
para ambos recorridos. La gráfica identifica el motor y proyecta **6 horas**.

El catálogo portable contiene solo perfiles virtuales. Para actualizarlo después de
cambiar la versión de simglucose, ejecuta `python backend/exportar_catalogo.py` en el
entorno del backend y luego `python build.py`.

### Arranque rápido (modo completo)

Un solo proceso: FastAPI sirve la API **y** el frontend en el mismo puerto, así que no
hace falta una segunda terminal ni configurar CORS.

```powershell
cd backend
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt
venv\Scripts\uvicorn app.main:app --port 8001
# Abre http://localhost:8001
```

> El proyecto usa **solo Python**: no requiere Node ni npm. Tras cualquier cambio en
> `js/`, `css/` o `index.html`, regenera el archivo portable con `python build.py`.

### Solo quiero verlo, sin instalar nada

Abre **`BioTwin_DM_Prototype_v1.html`** con doble clic. El modo portable funciona sin
servidor Python y usa Internet para cargar las bibliotecas de la interfaz.

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
