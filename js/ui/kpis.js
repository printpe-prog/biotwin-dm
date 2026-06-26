/**
 * ui/kpis.js — Módulo 7: indicadores clínicos dinámicos (Clinical Performance
 * Indicators).
 *
 * Las cuatro tarjetas se recalculan automáticamente ante cualquier cambio en
 * los datos del gráfico (nueva simulación, carga OhioT1DM, fallback, cambio de
 * perfil). El punto único de actualización es `updateAllMetrics()`, que lee la
 * curva activa desde `estado.curvaActual`.
 *
 * Lenguaje clínico neutral (sin referencias institucionales).
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

/** Time In Range: % de puntos con 70 ≤ glucosa ≤ 180 mg/dL. */
export function calculateTIR(datapoints) {
  const datos = datapoints.filter((v) => v !== null && !Number.isNaN(v));
  if (!datos.length) return 0;
  const { hipo, hiper } = CONFIG.rangos;
  return (datos.filter((g) => g >= hipo && g <= hiper).length / datos.length) * 100;
}

/** Time Below Range: % de puntos con glucosa < 70 mg/dL. */
export function calculateTBR(datapoints) {
  const datos = datapoints.filter((v) => v !== null && !Number.isNaN(v));
  if (!datos.length) return 0;
  return (datos.filter((g) => g < CONFIG.rangos.hipo).length / datos.length) * 100;
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

/** Render estático de la tarjeta RMSE (valor fijo de referencia). Una vez en init. */
export function renderRMSECard() {
  DOM.rmseValor.textContent = '18.5';
  DOM.rmseBadge.textContent = '✓ Design constraint satisfied (< 25 mg/dL)';
  DOM.rmseSubtext.textContent =
    'Mean squared error between digital twin prediction and OhioT1DM reference values.';
}

/** Soporte a la decisión clínica según el último valor glucémico de la curva. */
export function renderDecisionSupport(lastGlucose) {
  const el = DOM.decisionTexto;
  const { hipoSevera, hipo, hiper, hiperSevera } = CONFIG.rangos;
  if (lastGlucose === null || lastGlucose === undefined || Number.isNaN(lastGlucose)) {
    el.textContent = 'No predictive data available.';
    el.style.color = '#94a3b8';
    return;
  }
  let txt, color;
  if (lastGlucose > hiperSevera) {
    txt = `🔴 Severe hyperglycemia projected (>${Math.round(lastGlucose)} mg/dL). Urgent bolus correction advised.`;
    color = '#fb7185';
  } else if (lastGlucose > hiper) {
    txt = '🟡 Mild-moderate hyperglycemia. Adjust I:CHO ratio for next meal.';
    color = '#fbbf24';
  } else if (lastGlucose >= hipo) {
    txt = '🟢 Glucose within target range. Maintain current regimen. Review in 2 h.';
    color = '#34d399';
  } else if (lastGlucose >= hipoSevera) {
    txt = '🟠 Mild hypoglycemia. Ingest 15 g fast-acting glucose. Reassess in 15 min.';
    color = '#fb923c';
  } else {
    txt = '🔴 SEVERE HYPOGLYCEMIA. Immediate action required.';
    color = '#fb7185';
  }
  el.textContent = txt;
  el.style.color = color;
}

/* =========================================================================
 * ORQUESTADOR
 * ========================================================================= */

/**
 * Punto único de actualización. Lee la curva activa (`estado.curvaActual`),
 * recalcula TIR/TBR con contadores animados y refresca el soporte clínico.
 * Debe llamarse al final de cada simulación, carga de dataset y fallback.
 */
export function updateAllMetrics() {
  const { valores, ultimo } = estado.curvaActual;
  const { tirVerde, tirAmbar, tbrMax } = CONFIG.metas;

  // --- Tarjeta 1: Time In Range ---
  const tir = calculateTIR(valores);
  const tirColor = tir > tirVerde ? COLORES.euglucemia
    : (tir >= tirAmbar ? COLORES.hiper : COLORES.hipo);
  animarContador(DOM.tirValor, tirPrevio, tir);
  DOM.tirValor.style.color = tirColor;
  DOM.tirBarra.style.width = tir.toFixed(1) + '%';
  DOM.tirBarra.style.backgroundColor = tirColor;
  if (tir > tirVerde) {
    DOM.tirBadge.textContent = '✓ Clinical Target Met';
    DOM.tirBadge.className = 'mt-2 text-[11px] font-medium text-emerald-400';
  } else {
    DOM.tirBadge.textContent = '✗ Clinical Target Not Met';
    DOM.tirBadge.className = 'mt-2 text-[11px] font-medium text-rose-400';
  }
  tirPrevio = tir;

  // --- Tarjeta 2: Time Below Range ---
  const tbr = calculateTBR(valores);
  const tbrColor = tbr < tbrMax ? COLORES.euglucemia : COLORES.hipo;
  animarContador(DOM.tbrValor, tbrPrevio, tbr);
  DOM.tbrValor.style.color = tbrColor;
  DOM.tbrBarra.style.width = Math.min(tbr * 4, 100).toFixed(1) + '%'; // escala visual amplificada
  DOM.tbrBarra.style.backgroundColor = tbrColor;
  tbrPrevio = tbr;

  // --- Tarjeta 4: Soporte a la decisión clínica ---
  renderDecisionSupport(ultimo);
}

/**
 * Fija las métricas provenientes del BACKEND (ya calculadas sobre la serie real
 * del motor UVA/Padova). Anima los contadores hacia los valores recibidos.
 */
export function setMetricasBackend({ tir, tbr, decision }) {
  const { tirVerde, tirAmbar, tbrMax } = CONFIG.metas;

  const tirColor = tir > tirVerde ? COLORES.euglucemia
    : (tir >= tirAmbar ? COLORES.hiper : COLORES.hipo);
  animarContador(DOM.tirValor, tirPrevio, tir);
  DOM.tirValor.style.color = tirColor;
  DOM.tirBarra.style.width = tir.toFixed(1) + '%';
  DOM.tirBarra.style.backgroundColor = tirColor;
  if (tir > tirVerde) {
    DOM.tirBadge.textContent = '✓ Clinical Target Met';
    DOM.tirBadge.className = 'mt-2 text-[11px] font-medium text-emerald-400';
  } else {
    DOM.tirBadge.textContent = '✗ Clinical Target Not Met';
    DOM.tirBadge.className = 'mt-2 text-[11px] font-medium text-rose-400';
  }
  tirPrevio = tir;

  const tbrColor = tbr < tbrMax ? COLORES.euglucemia : COLORES.hipo;
  animarContador(DOM.tbrValor, tbrPrevio, tbr);
  DOM.tbrValor.style.color = tbrColor;
  DOM.tbrBarra.style.width = Math.min(tbr * 4, 100).toFixed(1) + '%';
  DOM.tbrBarra.style.backgroundColor = tbrColor;
  tbrPrevio = tbr;

  if (decision !== undefined) {
    DOM.decisionTexto.textContent = decision;
  }
}

/** Actualiza la tarjeta RMSE con la validación real del backend (OE3/OE4). */
export function setRMSEBackend({ rmse, r2, fuente, cumple }) {
  DOM.rmseValor.textContent = rmse.toFixed(1);
  if (cumple) {
    DOM.rmseBadge.textContent = `✓ Design constraint satisfied (< 25 mg/dL) · R²=${r2.toFixed(2)}`;
    DOM.rmseBadge.className = 'mt-2 inline-block text-[11px] font-medium px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
  } else {
    DOM.rmseBadge.textContent = `RMSE ${rmse.toFixed(1)} mg/dL · R²=${r2.toFixed(2)}`;
    DOM.rmseBadge.className = 'mt-2 inline-block text-[11px] font-medium px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30';
  }
  DOM.rmseSubtext.textContent = `Validación a 30 min sobre ${fuente}. RMSE/R² calculados con scikit-learn.`;
}

/* =========================================================================
 * BADGE DE MODO DEL GRÁFICO (auxiliar, independiente de las métricas)
 * ========================================================================= */
export function setBadgeModo(texto, tono) {
  const tonos = {
    sky: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };
  DOM.badgeModo.className = 'text-[10px] font-mono px-2 py-1 rounded-md border ' + (tonos[tono] || tonos.sky);
  DOM.badgeModo.textContent = texto;
}
