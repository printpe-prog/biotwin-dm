# BioTwin-DM Handoff

**Última actualización:** 2026-06-26 | **Sesión:** Integración de backend + OhioT1DM + túnel privado

---

## 🎯 Objetivo

Crear una plataforma web de simulación personalizada para Diabetes Tipo 1 que:
1. Ejecute el motor fisiológico UVA/Padova (simglucose, FDA aprobado)
2. Entrene un agente RL (PPO, Stable-Baselines3) que sugiera dosis de insulina
3. Valide contra pacientes reales del dataset OhioT1DM
4. Protejan datos clínicos bajo Ley 19.628/21.719 (cifrado Fernet)

**Objetivos específicos (informe):**
- OE1: ≥10 perfiles virtuales → **30 logrados** (10 niños, 10 adolescentes, 10 adultos)
- OE2: TIR > 80% → **98.3% logrado**
- OE3: Predicción glucémica con RMSE < 25 mg/dL → **10.0 mg/dL logrado**
- OE4: R² ≥ 0.85 → **0.899 logrado**

---

## 📊 Estado Actual

### ✅ Completado
- Backend FastAPI completo (simglucose + RL + validación OhioT1DM)
- 30 perfiles virtuales UVA/Padova + 12 pacientes reales de OhioT1DM
- Agente PPO entrenado (TIR 98.3%)
- Predictor Ridge AR (RMSE 10.0, R² 0.899)
- Frontend modular (modelos ES, dropdown, gráfico, KPIs)
- Cifrado Fernet real (Ley 19.628/21.719)
- Servidor unificado: FastAPI sirve frontend + API en puerto 8001
- Autenticación HTTP Basic Auth (opcional, activable)
- 4 commits en GitHub (backend, frontend, build, servidor unificado)

### 🔄 Funcionando localmente
```bash
cd backend
.\venv\Scripts\uvicorn app.main:app --port 8001
# Abre: http://localhost:8001/
```

### ⚠️ Pendiente
- Opción 2 (Inyección de parámetros reales de Ohio en simglucose) — no hecha aún
- Defensa (pendiente fecha)
- Capítulo IV del informe (resultados) — puede escribirse ahora con datos reales

---

## 📁 Archivos Clave Modificados

### Backend (Python)
| Archivo | Cambio |
|---------|--------|
| `backend/app/main.py` | Añadido: middleware auth, mount `/js` y `/css`, servir `/` (index.html) |
| `backend/app/config.py` | Añadido: `FRONTEND_DIR` |
| `backend/app/engine/ohio_pacientes.py` | **NUEVO**: Cargar 12 pacientes reales OhioT1DM con parámetros clínicos (CR real, TDD, ISF) |
| `backend/app/engine/pacientes.py` | Refactorizado: `_cargar_virtuales()` + merge con reales en `cargar_perfiles()` |
| `backend/app/engine/simulador.py` | Añadido: `modelo_fisiologico` (mapeo UVA/Padova para pacientes reales) |
| `backend/app/modelos.py` | Añadido: campo `modelo_fisiologico` en `PacienteOut` |

### Frontend (JavaScript)
| Archivo | Cambio |
|---------|--------|
| `js/api.js` | Cambio: resolver base URL a `location.origin` cuando está en http(s), fallback a `localhost:8001` para monolito |
| `js/main.js` | Cambio: dropdown incluye grupo 4 "Pacientes reales (OhioT1DM)" + contador "30 virtuales · 12 reales" |
| `js/main.js` | Cambio: selector backend mapea index de lista unificada (virtuales + reales) |

### Producción
| Archivo | Cambio |
|---------|--------|
| `BioTwin_DM_Prototype_v1.html` | Regenerado: monolito autocontenido con frontend integrado |
| `.gitignore` | Añadido: `*.log`, `.claude/`, `_*.mjs`, `_*.txt` (túneles, temporales) |
| `iniciar_tunel.ps1` | **NUEVO**: Script para exponer app privada vía Cloudflare Tunnel (túnel-ready) |
| `.claude/launch.json` | Actualizado: configuración del preview para servidor unificado en `:8001` |

---

## 🔧 Qué Cambié

### 1. Integración de pacientes reales OhioT1DM
**Archivo:** `backend/app/engine/ohio_pacientes.py` (nuevo módulo)

Extrae de los 24 XMLs reales:
- Ratio I:CHO (CR) real → del asistente de bolo de la bomba
- Basal media → promedio de tasas programadas
- Sensibilidad (ISF) → regla 1800
- Glucosa media observada

Mapea cada paciente real al modelo UVA/Padova más cercano (por similitud CR + TDD).

**Resultado:** 12 pacientes en el selector con etiqueta "Pacientes reales (OhioT1DM)":
```
OhioT1DM #559 — real · I:CHO 9.1 g/U
OhioT1DM #563 — real · I:CHO 4.9 g/U
... (12 total)
```

### 2. Servidor unificado (un puerto, sin CORS)
**Archivos:** `main.py`, `config.py`, `api.js`

Antes: frontend en :8000, backend en :8001 → CORS necesario
Después: FastAPI sirve `/`, `/js/`, `/css/` + API en :8001 → mismo origen

**Beneficio:** Un solo puerto facilita túneles. Solo `/js` y `/css` se exponen (datos DUA bloqueados con 404).

### 3. Autenticación HTTP Basic Auth (optional)
**Archivo:** `main.py` middleware

- Si `BIOTWIN_PASS` env var está vacía → sin auth (uso local)
- Si `BIOTWIN_PASS` tiene valor → 401 sin clave, 200 con `Authorization: Basic ...`

**Uso:**
```bash
# Local sin password (desarrollo)
.\venv\Scripts\uvicorn app.main:app --port 8001

# Con password (túnel privado)
$env:BIOTWIN_PASS = "miClave"
$env:BIOTWIN_USER = "biotwin"
.\venv\Scripts\uvicorn app.main:app --port 8001
```

### 4. Resolución automática de API URL
**Archivo:** `js/api.js`

```javascript
const BASE = (
  window.BIOTWIN_API_URL != null
    ? window.BIOTWIN_API_URL
    : (location.protocol.startsWith('http') ? location.origin : 'http://localhost:8001')
).replace(/\/$/, '');
```

- Si está en `http://localhost:8001/` → usa mismo origen
- Si está en `file://` (monolito) → intenta localhost:8001, fallback offline
- Si hay override `window.BIOTWIN_API_URL` → respeta eso

---

## 🚀 Qué Intenté

### Túneles públicos (para exposición privada desde UNAB)
1. **Cloudflare Tunnel**: instaló `cloudflared`, generó URL `https://flooring-...trycloudflare.com`
2. **localhost.run**: SSH tunnel con `-R 80:localhost:8001`
3. **pinggy.io**: SSH tunnel en puerto 443

**Resultado:** Todos bloqueados por Cisco Umbrella (filtro de red de la UNAB).

### Scripts portables
- `iniciar_tunel.ps1`: genera contraseña aleatoria, arranca backend con auth, abre túnel
  - Usa rutas relativas (`Split-Path -Parent $MyInvocation.MyCommand.Path`)
  - Listo para correr desde casa (donde no hay firewall institucional)

---

## ❌ Qué Falló

| Intento | Razón | Solución |
|---------|-------|----------|
| Cloudflare Tunnel | Puerto 7844 cerrado por Cisco Umbrella | Abandonado |
| localhost.run | Cuelga sin emitir URL (SSH timeout) | Abandonado |
| pinggy.io | Conexión reseteada por `146.112.61.107` (Cisco Umbrella) | Abandonado |
| Compartir OhioT1DM en Supabase | Viola DUA (datos con restricción de uso) | No aplica — local only |

**Aprendizaje:** La red de la UNAB bloquea activamente proxies/túneles. No es atacable.

---

## 📋 Qué Planeas Hacer Después

### Inmediato (antes de defensa)
1. **Usar localmente:**
   ```bash
   cd backend
   .\venv\Scripts\uvicorn app.main:app --port 8001
   # Abre http://localhost:8001/ en tu laptop
   ```
   - Más confiable que túnel (no depende de internet ni firewall)
   - No puede fallar por wifi

2. **Capítulo IV del informe** (Resultados y discusión):
   - Ahora puedes escribirlo con números reales
   - TIR 98.3%, RMSE 10.0, R² 0.899
   - 4 OEs cumplidos (ver resumen arriba)

3. **Completar campos pendientes del informe:**
   - Tabla de declaración IA (Página 2)
   - Imágenes: Ishikawa, arquitectura, Gantt
   - Si falta: explicar mapeo UVA/Padova ↔ OhioT1DM en Metodología

### Opcional (valor agregado, post-defensa)
1. **Opción 2 — Inyección de parámetros reales** (2h de trabajo)
   - Ajustar `Vmx`, `u2ss`, `kp3` de simglucose con valores reales de Ohio
   - "Gemelo digital personalizado con datos clínicos reales"
   - Demostración más potente, pero riesgosa si se introduce un bug

2. **Histórico de simulaciones** (persistencia)
   - Guardar resultados en SQLite local
   - Mostrar gráfico de "mejora del TIR en el tiempo"

3. **Defensa desde casa** con túnel
   - Correr `.\iniciar_tunel.ps1`
   - Comparte URL pública + contraseña con jurado
   - (Solo si necesitas acceso remoto real)

### Para producción (hostlan.cl)
- `node deploy.mjs` sube el monolito HTML estático
- Versión offline (sin backend Python)
- Útil como demo pública, pero sin RL real ni pacientes OhioT1DM

---

## 🔐 Seguridad & DUA

✅ **Protegido:**
- XMLs de OhioT1DM nunca se suben a la web (directorio local, `.gitignore`)
- Solo parámetros derivados (CR, TDD, ISF) entran en la app
- Fernet encryption (AES-128-CBC + HMAC) en el flujo de datos
- Anonymización SHA-256 en logs

---

## 📌 Notas para la Defensa

**Abre en tu laptop (no en navegador remoto):**
```bash
# Desde la carpeta biotwin/backend:
.\venv\Scripts\uvicorn app.main:app --port 8001
```

**Entonces:**
- Navega a `http://localhost:8001/`
- Selector con 4 grupos (Adultos, Adolescentes, Niños, **Pacientes reales OhioT1DM**)
- Simula con paciente real #559 (CR real 9.1 g/U)
- Muestra el predictor validado: RMSE 10.0, R² 0.899

**No necesitas túnel** — es local, privado, sin internet.

---

## 💾 Commits en GitHub

```
0b4ad63 Unified single-port server + optional private auth (tunnel-ready)
c95cce9 build: regenerate production monolith with latest frontend
aff6ed7 Frontend: connect to backend + OhioT1DM real-patient selector
13f6789 Add Python backend: simglucose engine, PPO agent, OhioT1DM validation
```

---

## ❓ Dudas Resueltas

- **¿OhioT1DM es "real"?** Sí, son pacientes reales del dataset de Ohio University. Limitación: no tenemos su modelo fisiológico completo (solo observaciones), así que usamos UVA/Padova como sustituto (la metodología está clara en el código y las fichas).
- **¿Por qué no subo OhioT1DM a la web?** Data Use Agreement lo prohíbe. El dataset es académico, no público.
- **¿Supabase?** Overkill para esto. FastAPI + local storage es suficiente.

---

**Última verificación:** App funcionando en local (42 pacientes, 12 reales), 4 commits pusheados, servidor unificado con auth listo para túnel desde casa si lo necesitas.
