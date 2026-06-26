/**
 * api.js — Cliente del backend FastAPI (motor real UVA/Padova + RL).
 *
 * Encapsula las llamadas HTTP al backend Python. Si el backend no está
 * disponible, `probarBackend()` devuelve false y la app cae con elegancia al
 * motor JavaScript local (modo offline / build portable).
 */

const BASE = (window.BIOTWIN_API_URL || 'http://localhost:8001').replace(/\/$/, '');

export const api = {
  base: BASE,
  online: false,
};

async function _json(ruta, opciones) {
  const r = await fetch(BASE + ruta, opciones);
  if (!r.ok) {
    const detalle = await r.json().catch(() => ({}));
    throw new Error(detalle.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

/** Sondea /salud con timeout corto. Marca api.online. */
export async function probarBackend(timeoutMs = 1500) {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    const salud = await fetch(BASE + '/salud', { signal: ctrl.signal });
    clearTimeout(id);
    if (!salud.ok) return false;
    const data = await salud.json();
    api.online = true;
    api.salud = data;
    return true;
  } catch {
    api.online = false;
    return false;
  }
}

export function listarPacientes() {
  return _json('/pacientes');
}

export function apiSimular(params) {
  return _json('/simular', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function apiValidar(params) {
  return _json('/validar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || { patient_id: '559', horizonte_pred_min: 30 }),
  });
}
