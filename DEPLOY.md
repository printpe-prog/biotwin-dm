# BioTwin-DM — Deployment Guide

## Entornos

| Entorno | URL / Acceso | Descripción |
|---------|-------------|-------------|
| **Desarrollo** | `http://localhost:8000` | `node dev-server.mjs` — versión modular ES |
| **Producción** | `http://hostlan.cl/biotwin/` | Monolito `index.html` via FTP |

---

## Flujo de trabajo (Dev → Prod)

```
1. Editar módulos en  js/  css/  index.html
2. Probar localmente:   node dev-server.mjs  →  http://localhost:8000
3. Generar monolito:    node build.mjs
4. Commit en git:       git add . && git commit -m "descripción del cambio"
5. Push a GitHub:       git push origin main
6. Deploy a FTP:        node deploy.mjs          (script de deploy automatizado)
```

---

## Servidor FTP (Producción)

- **Servidor:** `ftp.hostlan.cl`
- **Puerto:** `21` (FTPS explícito)
- **Usuario:** `biotwin@hostlan.cl`
- **Contraseña:** *(no guardar aquí — usar variable de entorno `FTP_PASS`)*

Para deploy manual:
```bash
FTP_PASS=<tu_contraseña> node deploy.mjs
```

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
├── build.mjs               # Genera el monolito desde los módulos ES
├── deploy.mjs              # Sube a FTP via FTPS
├── dev-server.mjs          # Servidor local de desarrollo
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
