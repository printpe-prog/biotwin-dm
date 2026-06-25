# BioTwin-DM · Prototipo de Producción

**Plataforma de Simulación Predictiva basada en Gemelos Digitales para la
Optimización de la Terapia de Insulina en Pacientes con Diabetes Tipo 1.**

Proyecto de título — Universidad Andrés Bello · Portafolio de Proyectos (INSW410).

---

## Cómo ejecutar

Esta versión usa **módulos ES** (`import`/`export`), por lo que **no se abre con
doble clic** (el navegador bloquea los módulos cargados desde `file://`).
Necesitas servirlo desde un servidor local. Cualquiera de estas opciones sirve:

### Opción A — Servidor incluido (Node, sin dependencias) — recomendada
```bash
# Desde la carpeta del proyecto:
node dev-server.mjs
# Luego abre en el navegador:
#   http://localhost:8000
```

### Opción B — VSCode Live Server
1. Instala la extensión **Live Server**.
2. Clic derecho sobre `index.html` → **"Open with Live Server"**.
3. Se abre en `http://127.0.0.1:5500/index.html`.

### Opción C — Python (solo si lo tienes instalado)
```bash
python -m http.server 8000   # → http://localhost:8000
```

> **Requiere conexión a internet:** Tailwind, Chart.js y el plugin de
> anotaciones se cargan por CDN. Si no cargan, la app muestra un aviso visible.

### ¿Necesitas abrir con doble clic, sin servidor?
Usa el archivo **`BioTwin_DM_Prototype_v1.html`**, que es el mismo prototipo
empaquetado como **un único archivo autocontenido** (build portable). Ideal
para enviar por correo o abrir en un equipo sin herramientas.

---

## Estructura del proyecto

```
biotwin/
├── index.html                 # Punto de entrada (estructura + CDN)
├── css/
│   └── styles.css             # Estilos propios (complementan Tailwind)
├── js/
│   ├── config.js              # Constantes del dominio, paleta, metas clínicas
│   ├── state.js               # Estado mutable centralizado de la app
│   ├── core/
│   │   ├── random.js          # PRNG determinista, ruido gaussiano, base64
│   │   └── tiempo.js          # Etiquetas de tiempo y timestamps
│   ├── data/
│   │   └── pacientes.js       # Modelo de datos (Módulo 1): perfiles y sesión
│   ├── engine/
│   │   └── simulador.js       # Motor fisiológico (Módulo 2): CHO + insulina
│   ├── pipeline/
│   │   └── ohio.js            # Pipeline OhioT1DM (Módulo 4): gaps y suavizado
│   └── ui/
│       ├── dom.js             # Cache de referencias DOM
│       ├── grafico.js         # Capa Chart.js (posee la instancia del gráfico)
│       ├── kpis.js            # Métricas clínicas (Módulo 6): TIR, TBR, decisión
│       ├── consola.js         # Consola criptográfica (Módulo 5)
│       └── modal.js           # Control RL/PID y fallback (Módulo 3)
│   └── main.js                # Orquestación: eventos, arranque, flujo
├── dev-server.mjs             # Servidor estático de desarrollo (Node, sin deps)
├── BioTwin_DM_Prototype_v1.html   # Build portable de un solo archivo
└── README.md
```

### Capas y dependencias

El flujo de dependencias es unidireccional (sin ciclos):

```
config / state / core / data      (módulos hoja, sin dependencias de la app)
        ↓
engine · pipeline · ui/dom · ui/kpis · ui/consola
        ↓
ui/grafico · ui/modal
        ↓
main.js  (orquesta todo; nadie lo importa)
```

El estado mutable vive en `state.js`; la instancia de Chart.js está encapsulada
en `ui/grafico.js` y solo se expone mediante funciones de render.

---

## Stack técnico

| Capa     | Tecnología                                   |
|----------|----------------------------------------------|
| Estilos  | Tailwind CSS (Play CDN) + `css/styles.css`   |
| Gráficos | Chart.js 4.x + `chartjs-plugin-annotation`   |
| Lógica   | JavaScript ES2022 (módulos nativos)          |

---

## Validación de las métricas (criterios clínicos de diseño)

- **TIR** > 80 %  ·  **TBR** < 4 %  ·  **RMSE** < 25 mg/dL
- Dataset de referencia: **OhioT1DM** (Marling & Bunescu, 2020)
- Marco legal: **Ley N° 19.628** y **Ley N° 21.719**
