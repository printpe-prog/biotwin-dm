/**
 * ui/kpis.js — Módulo 7: indicadores clínicos dinámicos (Clinical Performance
 * Indicators).
 *
 * Las tarjetas se recalculan ante cualquier cambio en los datos del gráfico
 * (nueva simulación, carga OhioT1DM, fallback, cambio de perfil).
 *
 * Hay dos orígenes de métricas y ambos pintan las MISMAS tarjetas:
 *   - `updateAllMetrics()`    calcula TIR/TBR desde la curva local visible.
 *   - `setMetricasBackend()`  usa las métricas ya calculadas por el motor real.
 * Por eso el pintado vive en `pintarTIR` / `pintarTBR` y no se duplica.
 *
 * Lenguaje clínico neutral y en español, igual que el backend, para que el
 * mensaje no cambie según el modo (offline / motor real).
 */

import { CONFIG, COLORES } from '../config.js';
import { estado } from '../state.js';
import { DOM } from './dom.js';

// Valores previos: permiten animar los contadores desde el último estado.
let tirPrevio = 0;
let tbrPrevio = 0;

/* =========================================================================
 * CÁLCULOS (funciones puras)
 * ========================================================================= */

/** Descarta huecos (null) y valores no numéricos de una serie glucémica. */
function _validos(datapoints) {
  return datapoints.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
}

/** % de puntos válidos que cumplen `predicado` (0 si no hay datos). */
function _porcentaje(datapoints, predicado) {
  const datos = _validos(datapoints);
  if (!datos.length) return 0;
  return (datos.filter(predicado).length / datos.length) * 100;
}

/** Time In Range: % de puntos con 70 ≤ glucosa ≤ 180 mg/dL. */
export function calculateTIR(datapoints) {
  const { hipo, hiper } = CONFIG.rangos;
  return _porcentaje(datapoints, (g) => g >= hipo && g <= hiper);
}

/** Time Below Range: % de puntos con glucosa < 70 mg/dL. */
export function calculateTBR(datapoints) {
  return _porcentaje(datapoints, (g) => g < CONFIG.rangos.hipo);
}

/* =========================================================================
 * RENDER
 * ========================================================================= */

/** Anima un contador numérico desde → hasta con easing (≈400 ms, rAF). */
function animarContador(el, desde, hasta, ms = 400) {
  const t0 = performance.now();
  function frame(t) {
    const p = Math.min((t - t0) / ms, 1);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = (desde + (hasta - desde) * eased).toFixed(1);
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = hasta.toFixed(1);
  }
  requestAnimationFrame(frame);
  // Fallback: si rAF está throttled (pestaña en segundo plano), garantiza el
  // valor final de todos modos.
  setTimeout(() => { el.textContent = hasta.toFixed(1); }, ms + 80);
}

/** Tarjeta 1 — Time In Range: contador, barra y veredicto frente a la meta. */
function pintarTIR(tir) {
  const { tirVerde, tirAmbar } = CONFIG.metas;
  const color = tir > tirVerde ? COLORES.euglucemia
    : (tir >= tirAmbar ? COLORES.hiper : COLORES.hipo);

  animarContador(DOM.tirValor, tirPrevio, tir);
  DOM.tirValor.style.color = color;
  DOM.tirBarra.style.width = tir.toFixed(1) + '%';
  DOM.tirBarra.style.backgroundColor = color;

  const cumple = tir > tirVerde;
  DOM.tirBadge.textContent = cumple ? '✓ Meta clínica alcanzada' : '✗ Meta clínica no alcanzada';
  DOM.tirBadge.className = 'kpi-note mt-3 font-medium';
  DOM.tirBadge.style.color = cumple ? COLORES.euglucemia : COLORES.hipo;
  tirPrevio = tir;
}

/** Tarjeta 2 — Time Below Range (escala visual amplificada ×4). */
function pintarTBR(tbr) {
  const color = tbr < CONFIG.metas.tbrMax ? COLORES.euglucemia : COLORES.hipo;
  animarContador(DOM.tbrValor, tbrPrevio, tbr);
  DOM.tbrValor.style.color = color;
  DOM.tbrBarra.style.width = Math.min(tbr * 4, 100).toFixed(1) + '%';
  DOM.tbrBarra.style.backgroundColor = color;
  tbrPrevio = tbr;
}

/**
 * Render de la tarjeta RMSE en modo offline. El valor es una referencia de
 * diseño, NO una medición: la validación real (RMSE y R² calculados con
 * scikit-learn) la entrega el backend vía `setRMSEBackend`.
 */
export function renderRMSECard() {
  DOM.rmseValor.textContent = '18.5';
  DOM.rmseBadge.textContent = 'Valor de referencia (meta < 25 mg/dL)';
  DOM.rmseSubtext.textContent =
    'Referencia de diseño en modo offline. Inicie el backend para obtener el RMSE y el R² reales.';
}

/**
 * Soporte a la decisión clínica según el último valor glucémico de la curva.
 * Los textos replican los del backend (`engine/simulador.py::_decision_clinica`)
 * para que el mensaje sea idéntico en ambos modos.
 */
export function renderDecisionSupport(ultimaGlucosa) {
  const el = DOM.decisionTexto;
  const { hipoSevera, hipo, hiper, hiperSevera } = CONFIG.rangos;

  if (ultimaGlucosa === null || ultimaGlucosa === undefined || Number.isNaN(ultimaGlucosa)) {
    el.textContent = 'Sin datos predictivos disponibles.';
    el.style.color = '#94a3b8';
    return;
  }

  let texto, color;
  if (ultimaGlucosa > hiperSevera) {
    texto = `🔴 Hiperglicemia severa proyectada (>${Math.round(ultimaGlucosa)} mg/dL). Corrección con bolo urgente.`;
    color = COLORES.hipo;
  } else if (ultimaGlucosa > hiper) {
    texto = '🟡 Hiperglicemia leve-moderada. Ajustar ratio I:CHO en la próxima comida.';
    color = COLORES.hiper;
  } else if (ultimaGlucosa >= hipo) {
    texto = '🟢 Glucosa en rango objetivo. Mantener régimen actual. Revisar en 2 h.';
    color = COLORES.euglucemia;
  } else if (ultimaGlucosa >= hipoSevera) {
    texto = '🟠 Hipoglicemia leve. Ingerir 15 g de glucosa rápida. Reevaluar en 15 min.';
    color = '#fb923c';
  } else {
    texto = '🔴 HIPOGLICEMIA SEVERA. Acción inmediata requerida.';
    color = COLORES.hipo;
  }
  el.textContent = texto;
  el.style.color = color;
}

/* =========================================================================
 * ORQUESTADOR
 * ========================================================================= */

/**
 * Punto único de actualización en modo offline. Lee la curva activa
 * (`estado.curvaActual`), recalcula TIR/TBR y refresca el soporte clínico.
 * Debe llamarse al final de cada simulación, carga de dataset y fallback.
 */
export function updateAllMetrics() {
  const { valores, ultimo } = estado.curvaActual;
  pintarTIR(calculateTIR(valores));
  pintarTBR(calculateTBR(valores));
  renderDecisionSupport(ultimo);
}

/**
 * Fija las métricas provenientes del BACKEND (ya calculadas sobre la serie real
 * del motor UVA/Padova). Anima los contadores hacia los valores recibidos.
 */
export function setMetricasBackend({ tir, tbr, decision }) {
  pintarTIR(tir);
  pintarTBR(tbr);
  if (decision !== undefined) DOM.decisionTexto.textContent = decision;
}

/** Actualiza la tarjeta RMSE con la validación real del backend (OE3/OE4). */
export function setRMSEBackend({ rmse, r2, fuente, cumple }) {
  DOM.rmseValor.textContent = rmse.toFixed(1);
  DOM.rmseBadge.textContent = cumple
    ? `✓ Cumple la meta (< 25 mg/dL) · R²=${r2.toFixed(2)}`
    : `RMSE ${rmse.toFixed(1)} mg/dL · R²=${r2.toFixed(2)}`;
  DOM.rmseBadge.className = 'badge ' + (cumple ? 'badge-ok' : 'badge-warn');
  DOM.rmseSubtext.textContent = `Validación a 30 min sobre ${fuente}. RMSE/R² calculados con scikit-learn.`;
}

/* =========================================================================
 * BADGE DE MODO DEL GRÁFICO (auxiliar, independiente de las métricas)
 * ========================================================================= */
// Traduce el tono semántico que piden los módulos de render al modificador
// correspondiente del sistema de diseño (css/styles.css).
const BADGE_POR_TONO = { sky: 'badge-info', emerald: 'badge-ok', rose: 'badge-risk', amber: 'badge-warn' };

export function setBadgeModo(texto, tono) {
  DOM.badgeModo.className = 'badge ' + (BADGE_POR_TONO[tono] || BADGE_POR_TONO.sky);
  DOM.badgeModo.textContent = texto;
}
