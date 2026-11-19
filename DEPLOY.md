# BioTwin-DM — Deployment Guide

## Entornos

| Entorno | URL / Acceso | Descripción |
|---------|-------------|-------------|
| **Dev (recomendado)** | `http://localhost:8001` | `uvicorn app.main:app` — un solo puerto sirve la API **y** el frontend modular |
| **Dev sin backend** | `http://localhost:8000` | `python -m http.server 8000` — solo el frontend (modo offline) |
| **Producción (frontend)** | `http://hostlan.cl/biotwin/` | Monolito `index.html` via FTP (modo offline) |

> **Herramientas:** el proyecto usa **solo Python** (el mismo intérprete del
> backend). No requiere Node ni npm.

> **Módulos ES y `file://`:** la versión modular necesita servirse por HTTP; no
> se abre con doble clic. Para eso existe el monolito
> `BioTwin_DM_Prototype_v1.html`, que sí funciona desde el sistema de archivos.

> **Backend (motor real):** `hostlan.cl` es hosting estático FTP y **no ejecuta
> Python**. El backend FastAPI corre **local** para la defensa (decisión actual:
> "local primero"). Para una URL pública en vivo se requiere un host con Python
> (Render, Railway, Fly.io o un VPS); en ese caso, definir `window.BIOTWIN_API_URL`
> en el frontend apuntando a esa URL. El frontend desplegado en FTP seguirá
> funcionando en **modo offline** si el backend no está disponible.

---

## Flujo de trabajo (Dev → Prod)

```
1. Editar módulos en  js/  css/  index.html
2. Probar localmente:   backend/venv/Scripts/python.exe -m uvicorn app.main:app \
                            --port 8001 --app-dir backend   ->  http://localhost:8001
3. Generar monolito:    python build.py
4. Commit en git:       git add . && git commit -m "descripción del cambio"
5. Push a GitHub:       git push origin main
6. Deploy a FTP:        python deploy.py
```

> El paso 3 es **obligatorio** tras cualquier cambio en `js/`, `css/` o
> `index.html`: el monolito es un archivo generado y no debe editarse a mano.

---

## Servidor FTP (Producción)

- **Servidor:** `ftp.hostlan.cl`
- **Puerto:** `21` (FTPS explícito)
- **Usuario:** `biotwin@hostlan.cl`
- **Contraseña:** *(no guardar aquí — usar variable de entorno `FTP_PASS`)*

Para deploy manual (PowerShell):
```powershell
$env:FTP_PASS = "<tu_contraseña>"; python deploy.py
```

`deploy.py` entrega la contraseña directamente a la conexión FTPS, de modo que
no viaja como argumento en la línea de comandos ni queda en el historial.

---

## Repositorio GitHub

- **Repo:** `https://github.com/felipevera2002-coder/biotwin-dm`
- **Usuario:** `felipevera2002-coder`
- **Branch principal:** `main`
- **Auth:** Personal Access Token (PAT) — nunca usuario/contraseña

---

## Historial de versiones

| Versión | Fecha | Descripción |
|---------|-------|-------------|
| v1.0.0 | 2026-06-25 | Prototipo inicial — motor UVA/Padova RK4, 4 pacientes, KPIs, OhioT1DM |

---

## Estructura del proyecto

```
biotwin/
├── index.html              # Punto de entrada (versión modular, dev)
├── BioTwin_DM_Prototype_v1.html  # Build portable (producción, autogenerado)
├── build.py                # Genera el monolito desde los módulos ES
├── deploy.py               # Sube a FTP via FTPS
├── css/styles.css          # Estilos propios (tema oscuro clínico)
└── js/
    ├── config.js           # Configuración central
    ├── state.js            # Estado mutable compartido
    ├── core/               # Utilidades (random, tiempo)
    ├── data/               # Entidades y persistencia de pacientes
    ├── engine/             # Motor fisiológico (UVA/Padova RK4)
    ├── pipeline/           # Pipeline OhioT1DM
    └── ui/                 # Módulos de interfaz (gráfico, KPIs, formularios)
```
