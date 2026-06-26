/**
 * ui/grafico.js — Capa de visualización (Chart.js).
 *
 * Es el único módulo que posee la instancia del gráfico (`chart`). El resto de
 * la aplicación interactúa mediante las funciones de render exportadas, nunca
 * accediendo directamente al objeto Chart.
 *
 * `Chart` es el global expuesto por el script CDN de Chart.js.
 */

import { CONFIG, COLORES, PUNTOS_HISTORICO } from '../config.js';
import { etiquetaTiempo } from '../core/tiempo.js';
import { estado } from '../state.js';
import { DOM } from './dom.js';
import { generarHistorico, generarPrediccion, colorPorGlucosa } from '../engine/simulador.js';
import { tasaBasal } from '../data/pacientes.js';
import { updateAllMetrics, setBadgeModo } from './kpis.js';

let chart;
let modoEje = 'detalle';   // resolución del eje X: 'detalle' (cada 5 min) | 'hora' (cada 60 min)
let seriesCompletas = null; // snapshot a resolución completa de labels + data de cada dataset

// ¿Se muestra la marca/rejilla para esta etiqueta de reloj, según el modo activo?
function mostrarMarca(lbl) {
  if (typeof lbl !== 'string') return false;
  return modoEje === 'hora' ? lbl.endsWith(':00') : (lbl.endsWith(':00') || lbl.endsWith(':30'));
}

/** Líneas de referencia horizontales 70 (hipo) y 180 (hiper). */
function lineasReferencia() {
  const estiloEtiqueta = (txt, color) => ({
    display: true, content: txt, position: 'start', color,
    backgroundColor: 'rgba(2,6,23,0.7)', font: { size: 9, family: 'monospace' },
  });
  return {
    hipo: {
      type: 'line', yMin: CONFIG.rangos.hipo, yMax: CONFIG.rangos.hipo,
      borderColor: COLORES.hipo, borderWidth: 1.5, borderDash: [6, 6],
      label: estiloEtiqueta(CONFIG.rangos.hipo + ' mg/dL', COLORES.hipo),
    },
    hiper: {
      type: 'line', yMin: CONFIG.rangos.hiper, yMax: CONFIG.rangos.hiper,
      borderColor: COLORES.hiper, borderWidth: 1.5, borderDash: [6, 6],
      label: estiloEtiqueta(CONFIG.rangos.hiper + ' mg/dL', COLORES.hiper),
    },
  };
}

/** Inicializa el gráfico Chart.js con la configuración profesional base. */
export function initChart() {
  const ctx = DOM.graficoPrincipal.getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 650, easing: 'easeOutQuart' },
      layout: { padding: { top: 8, right: 8 } },
      scales: {
        x: {
          grid: {
            color: (ctx) => {
              const lbl = (typeof ctx.index === 'number') ? chart.data.labels[ctx.index] : null;
              return mostrarMarca(lbl) ? 'rgba(30,41,59,0.7)' : 'transparent';
            },
          },
          ticks: {
            color: '#64748b', autoSkip: false, maxRotation: 0,
            font: { family: 'monospace', size: 10 },
            callback(value) {
              const lbl = this.getLabelForValue(value);
              return mostrarMarca(lbl) ? lbl : '';
            },
          },
        },
        y: {
          suggestedMin: 40,
          suggestedMax: 300,
          grid: { color: 'rgba(30,41,59,0.7)' },
          ticks: {
            color: '#64748b', font: { family: 'monospace', size: 10 },
            callback: (v) => v + ' mg/dL',
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: '#cbd5e1', font: { size: 11 }, usePointStyle: true, boxWidth: 8,
            // Oculta datasets auxiliares internos (prefijo '_')
            filter: (item) => !String(item.text).startsWith('_'),
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          titleFont: { family: 'monospace' },
          bodyFont: { family: 'monospace' },
          callbacks: {
            label: (c) => {
              if (String(c.dataset.label).startsWith('_')) return null;
              if (c.parsed.y === null) return null;
              return `${c.dataset.label}: ${c.parsed.y} mg/dL`;
            },
          },
        },
        annotation: { annotations: lineasReferencia() },
      },
    },
  });
}

/**
 * Guarda la serie a resolución completa (5 min) tal como la dejó la última
 * función de render, y la re-pinta según el modo activo. Toda función de render
 * debe terminar llamando aquí en lugar de chart.update().
 */
function fijarSeriesYActualizar() {
  seriesCompletas = {
    labels: chart.data.labels.slice(),
    datas: chart.data.datasets.map((ds) => ds.data.slice()),
  };
  aplicarResolucion();
}

/**
 * Re-muestrea la serie almacenada según `modoEje` y actualiza el gráfico:
 *   - 'detalle': todos los puntos (5 min).
 *   - 'hora':    un punto por hora (solo las muestras en HH:00).
 * Solo afecta la VISUALIZACIÓN; las métricas (TIR/TBR) siguen usando la serie
 * completa desde estado.curvaActual.
 */
function aplicarResolucion() {
  if (!seriesCompletas) { chart.update(); return; }
  const { labels, datas } = seriesCompletas;
  const indices = [];
  for (let i = 0; i < labels.length; i++) {
    if (modoEje !== 'hora' || (typeof labels[i] === 'string' && labels[i].endsWith(':00'))) indices.push(i);
  }
  chart.data.labels = indices.map((i) => labels[i]);
  chart.data.datasets.forEach((ds, k) => { ds.data = indices.map((i) => datas[k][i]); });
  chart.update();
}

/**
 * Cambia la resolución temporal de la TRAYECTORIA: 'detalle' (5 min) o 'hora'
 * (un punto por hora). Re-muestrea la serie ya calculada, sin volver a simular.
 */
export function setResolucionEje(modo) {
  modoEje = modo;
  aplicarResolucion();
}

/** Estado basal: solo la zona histórica. Devuelve la serie para los KPIs. */
export function renderBasal(perfil) {
  const hist = generarHistorico(perfil);
  const histVals = hist.map((p) => p.glucosa);

  estado.registroGlucemico = hist.map((p) => ({
    t_min: p.t, glucosa_mg_dl: p.glucosa, insulina_basal_u_h: tasaBasal(perfil),
    bolo_u: 0, cho_g: 0, origen: 'historico',
  }));

  chart.data.labels = hist.map((p) => etiquetaTiempo(p.t));
  chart.data.datasets = [
    {
      label: 'Glucemia histórica (CGM)', data: histVals,
      borderColor: COLORES.neutral, backgroundColor: COLORES.neutral,
      borderWidth: 2, pointRadius: 0, tension: 0.35, spanGaps: false, order: 1,
    },
  ];
  chart.options.plugins.annotation.annotations = lineasReferencia();
  fijarSeriesYActualizar();

  estado.curvaActual = { valores: histVals, ultimo: histVals[histVals.length - 1] };
  setBadgeModo('Estado basal', 'sky');
  updateAllMetrics();
}

/** Simulación predictiva completa (histórico + predicción + banda de incertidumbre). */
export function renderSimulacion(perfil, gCHO, uInsulina, esFallback) {
  const hist = generarHistorico(perfil);
  const glucosaInicial = hist[hist.length - 1].glucosa;
  const pred = generarPrediccion(perfil, gCHO, uInsulina, glucosaInicial);

  const { historicoMin, prediccionMin, pasoMin } = CONFIG.sim;
  const labels = [], histVals = [], predVals = [], bandU = [], bandL = [];
  const todosGlucosa = [];

  for (let t = -historicoMin; t <= prediccionMin; t += pasoMin) {
    labels.push(etiquetaTiempo(t));
    if (t <= 0) {
      const g = hist[(t + historicoMin) / pasoMin].glucosa;
      histVals.push(g);
      todosGlucosa.push(g);
    } else {
      histVals.push(null);
    }
    if (t >= 0) {
      const p = pred[t / pasoMin];
      predVals.push(p.glucosa);
      bandU.push(Math.round(p.glucosa + p.sd));
      bandL.push(Math.round(p.glucosa - p.sd));
      if (t > 0) todosGlucosa.push(p.glucosa);
    } else {
      predVals.push(null); bandU.push(null); bandL.push(null);
    }
  }
  // Conecta histórico y predicción en el instante del evento (t=0)
  predVals[PUNTOS_HISTORICO] = glucosaInicial;
  bandU[PUNTOS_HISTORICO] = glucosaInicial;
  bandL[PUNTOS_HISTORICO] = glucosaInicial;

  estado.registroGlucemico = pred.map((p) => ({
    t_min: p.t, glucosa_mg_dl: p.glucosa, insulina_basal_u_h: tasaBasal(perfil),
    bolo_u: p.t === 0 ? uInsulina : 0, cho_g: p.t === 0 ? gCHO : 0, origen: 'simulado',
  }));

  chart.data.labels = labels;
  chart.data.datasets = [
    // Banda de incertidumbre (±1σ): datasets auxiliares rellenos entre sí
    { label: '_bandaInf', data: bandL, borderWidth: 0, pointRadius: 0, fill: false, tension: 0.35, order: 5 },
    { label: 'Incertidumbre ±1σ', data: bandU, borderWidth: 0, pointRadius: 0,
      backgroundColor: COLORES.bandaFill, fill: '-1', tension: 0.35, order: 5 },
    // Histórico (sky-400)
    { label: 'Glucemia histórica (CGM)', data: histVals, borderColor: COLORES.neutral,
      backgroundColor: COLORES.neutral, borderWidth: 2, pointRadius: 0, tension: 0.35,
      spanGaps: false, order: 1 },
    // Predicción con color dinámico por rango glucémico (segment styling)
    { label: 'Predicción gemelo digital', data: predVals, borderColor: COLORES.euglucemia,
      borderWidth: 2.5, pointRadius: 0, tension: 0.35, spanGaps: false, order: 1,
      segment: { borderColor: (c) => colorPorGlucosa((c.p0.parsed.y + c.p1.parsed.y) / 2) } },
  ];
  chart.options.plugins.annotation.annotations = lineasReferencia();
  fijarSeriesYActualizar();

  const etiquetaModo = esFallback ? 'Predicción · PID (Fallback)'
    : (estado.rlActivo ? 'Predicción · RL' : 'Predicción · PID');
  estado.curvaActual = { valores: todosGlucosa, ultimo: predVals[predVals.length - 1] };
  setBadgeModo(etiquetaModo, esFallback ? 'rose' : 'emerald');

  updateAllMetrics();
}

/**
 * Dibuja una trayectoria devuelta por el BACKEND (motor real UVA/Padova).
 * `puntos` = [{ t_min, glucosa, ... }]. Colorea por rango glucémico.
 */
export function renderTrayectoria(puntos, etiquetaModo, tono) {
  const labels = puntos.map((p) => etiquetaTiempo(p.t_min));
  const vals = puntos.map((p) => p.glucosa);
  chart.data.labels = labels;
  chart.data.datasets = [
    {
      label: 'Predicción gemelo digital (UVA/Padova)', data: vals,
      borderColor: COLORES.euglucemia, backgroundColor: COLORES.euglucemia,
      borderWidth: 2.5, pointRadius: 0, tension: 0.35, spanGaps: false, order: 1,
      segment: { borderColor: (c) => colorPorGlucosa((c.p0.parsed.y + c.p1.parsed.y) / 2) },
    },
  ];
  chart.options.plugins.annotation.annotations = lineasReferencia();
  fijarSeriesYActualizar();
  estado.curvaActual = { valores: vals, ultimo: vals[vals.length - 1] };
  setBadgeModo(etiquetaModo, tono);
}

/** Dibuja la validación (OE4): serie real vs predicha del backend. */
export function renderValidacion(labels, serieReal, seriePred) {
  chart.data.labels = labels;
  chart.data.datasets = [
    {
      label: 'Serie de referencia (CGM)', data: serieReal,
      borderColor: COLORES.neutral, backgroundColor: COLORES.neutral,
      borderWidth: 2, pointRadius: 0, tension: 0.3, spanGaps: false, order: 1,
    },
    {
      label: 'Predicción gemelo digital', data: seriePred,
      borderColor: COLORES.interp, backgroundColor: COLORES.interp,
      borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.3, spanGaps: false, order: 0,
    },
  ];
  chart.options.plugins.annotation.annotations = lineasReferencia();
  fijarSeriesYActualizar();
}

/** Dibuja la serie cruda de OhioT1DM (con gaps y spikes). */
export function renderOhioRaw(raw, labels) {
  chart.data.labels = labels;
  chart.data.datasets = [
    { label: 'OhioT1DM raw (CGM crudo)', data: raw, borderColor: COLORES.neutral,
      backgroundColor: COLORES.neutral, borderWidth: 2, pointRadius: 0, tension: 0.25,
      spanGaps: false, order: 1 },
  ];
  chart.options.plugins.annotation.annotations = lineasReferencia();
  fijarSeriesYActualizar();
}

/** Dibuja la serie procesada: interpolación lineal resaltada + suavizado MM-5. */
export function renderOhioProcesado(raw, interpolado, suavizado) {
  // Resalta solo los segmentos interpolados (punteado violeta)
  const interpFill = interpolado.map((v, idx) => {
    const eraNull = raw[idx] === null;
    const vecinoNull = (raw[idx - 1] === null) || (raw[idx + 1] === null);
    return (eraNull || vecinoNull) ? v : null;
  });

  // Restaura las etiquetas a resolución completa (renderOhioRaw pudo haberlas
  // re-muestreado a horaria), de modo que el snapshot quede alineado con los datos.
  if (seriesCompletas) chart.data.labels = seriesCompletas.labels.slice();

  chart.data.datasets = [
    { label: 'Serie suavizada (MM-5)', data: suavizado, borderColor: COLORES.euglucemia,
      backgroundColor: COLORES.euglucemia, borderWidth: 2.5, pointRadius: 0, tension: 0.35, order: 1 },
    { label: 'Interpolación lineal', data: interpFill, borderColor: COLORES.interp,
      backgroundColor: COLORES.interp, borderWidth: 2, borderDash: [4, 4], pointRadius: 0,
      tension: 0, spanGaps: false, order: 0 },
  ];
  fijarSeriesYActualizar();
}
