/**
 * ui/grafico.js — Capa de visualización (Chart.js).
 *
 * Es el único módulo que posee la instancia del gráfico (`chart`). El resto de
 * la aplicación interactúa mediante las funciones de render exportadas, nunca
 * accediendo directamente al objeto Chart.
 *
 * Todas las funciones de render terminan en `pintar()`, que concentra los pasos
 * comunes (fijar la serie, actualizar la curva activa para las métricas y el
 * badge de modo). Las líneas de referencia 70/180 se configuran una sola vez en
 * `initChart` y persisten entre renders.
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
    backgroundColor: 'rgba(6,11,22,0.88)', font: { size: 9.5, family: 'monospace' },
    padding: { x: 5, y: 3 }, borderRadius: 4,
  });
  const linea = (valor, color) => ({
    type: 'line', yMin: valor, yMax: valor,
    borderColor: color, borderWidth: 1.5, borderDash: [6, 6],
    label: estiloEtiqueta(valor + ' mg/dL', color),
  });
  return {
    hipo: linea(CONFIG.rangos.hipo, COLORES.hipo),
    hiper: linea(CONFIG.rangos.hiper, COLORES.hiper),
  };
}

/* =========================================================================
 * CONSTRUCTORES DE DATASET
 * ========================================================================= */

/** Dataset de línea con los estilos base del proyecto; `opciones` los sobreescribe. */
function serie(label, data, opciones = {}) {
  return {
    label, data,
    borderWidth: 2, pointRadius: 0, tension: 0.35, spanGaps: false, order: 1,
    ...opciones,
  };
}

/** Dataset de línea de un solo color (borde y relleno del mismo tono). */
function lineaColor(label, data, color, opciones = {}) {
  return serie(label, data, { borderColor: color, backgroundColor: color, ...opciones });
}

// Colorea cada tramo de la curva según su rango glucémico.
const segmentoPorRango = {
  borderColor: (c) => colorPorGlucosa((c.p0.parsed.y + c.p1.parsed.y) / 2),
};

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
          border: { color: '#1e2d45' },
          grid: {
            color: (ctx) => {
              const lbl = (typeof ctx.index === 'number') ? chart.data.labels[ctx.index] : null;
              return mostrarMarca(lbl) ? 'rgba(30,45,69,0.55)' : 'transparent';
            },
          },
          ticks: {
            color: '#6b7d99', autoSkip: false, maxRotation: 0, padding: 6,
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
          border: { display: false },
          grid: { color: 'rgba(30,45,69,0.55)' },
          ticks: {
            color: '#6b7d99', font: { family: 'monospace', size: 10 }, padding: 8,
            callback: (v) => v + ' mg/dL',
          },
        },
      },
      plugins: {
        legend: {
          align: 'end',
          labels: {
            color: '#9fb0c9', font: { size: 11.5 }, usePointStyle: true,
            boxWidth: 8, boxHeight: 8, padding: 16,
            // Oculta datasets auxiliares internos (prefijo '_')
            filter: (item) => !String(item.text).startsWith('_'),
          },
        },
        tooltip: {
          backgroundColor: 'rgba(14,23,39,0.96)',
          borderColor: '#2b3f5e',
          borderWidth: 1,
          titleColor: '#e8eef7',
          bodyColor: '#9fb0c9',
          padding: 10,
          cornerRadius: 8,
          usePointStyle: true,
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
        // Constantes: se fijan una vez y persisten en todos los renders.
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
 * Cola común de todas las funciones de render.
 *
 * @param {object}   cfg
 * @param {string[]} [cfg.labels]   etiquetas del eje X (si se omiten, se conservan)
 * @param {object[]}  cfg.datasets  datasets de Chart.js
 * @param {object}   [cfg.curva]    serie activa para las métricas: { valores, ultimo }
 * @param {object}   [cfg.badge]    badge de modo: { texto, tono }
 * @param {boolean}  [cfg.metricas] recalcular TIR/TBR desde la curva local
 */
function pintar({ labels, datasets, curva, badge, metricas = false }) {
  if (labels) chart.data.labels = labels;
  chart.data.datasets = datasets;
  fijarSeriesYActualizar();
  if (curva) estado.curvaActual = curva;
  if (badge) setBadgeModo(badge.texto, badge.tono);
  if (metricas) updateAllMetrics();
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

  pintar({
    labels: hist.map((p) => etiquetaTiempo(p.t)),
    datasets: [lineaColor('Glucemia histórica (CGM)', histVals, COLORES.neutral)],
    curva: { valores: histVals, ultimo: histVals[histVals.length - 1] },
    badge: { texto: 'Estado basal', tono: 'sky' },
    metricas: true,
  });
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

  const etiquetaModo = esFallback ? 'Predicción · PID (Fallback)'
    : (estado.rlActivo ? 'Predicción · RL' : 'Predicción · PID');

  pintar({
    labels,
    datasets: [
      // Banda de incertidumbre (±1σ): datasets auxiliares rellenos entre sí
      serie('_bandaInf', bandL, { borderWidth: 0, fill: false, order: 5 }),
      serie('Incertidumbre ±1σ', bandU, {
        borderWidth: 0, backgroundColor: COLORES.bandaFill, fill: '-1', order: 5,
      }),
      lineaColor('Glucemia histórica (CGM)', histVals, COLORES.neutral),
      // Predicción con color dinámico por rango glucémico (segment styling)
      serie('Predicción gemelo digital', predVals, {
        borderColor: COLORES.euglucemia, borderWidth: 2.5, segment: segmentoPorRango,
      }),
    ],
    curva: { valores: todosGlucosa, ultimo: predVals[predVals.length - 1] },
    badge: { texto: etiquetaModo, tono: esFallback ? 'rose' : 'emerald' },
    metricas: true,
  });
}

/**
 * Dibuja una trayectoria devuelta por el BACKEND (motor real UVA/Padova).
 * `puntos` = [{ t_min, glucosa, ... }]. Colorea por rango glucémico.
 * Las métricas las fija el backend (`setMetricasBackend`), no se recalculan.
 */
export function renderTrayectoria(puntos, etiquetaModo, tono) {
  const vals = puntos.map((p) => p.glucosa);
  pintar({
    labels: puntos.map((p) => etiquetaTiempo(p.t_min)),
    datasets: [
      lineaColor('Predicción gemelo digital (UVA/Padova)', vals, COLORES.euglucemia, {
        borderWidth: 2.5, segment: segmentoPorRango,
      }),
    ],
    curva: { valores: vals, ultimo: vals[vals.length - 1] },
    badge: { texto: etiquetaModo, tono },
  });
}

/** Dibuja la validación (OE4): serie real vs predicha del backend. */
export function renderValidacion(labels, serieReal, seriePred) {
  pintar({
    labels,
    datasets: [
      lineaColor('Serie de referencia (CGM)', serieReal, COLORES.neutral, { tension: 0.3 }),
      lineaColor('Predicción gemelo digital', seriePred, COLORES.interp, {
        tension: 0.3, borderDash: [5, 4], order: 0,
      }),
    ],
  });
}

/** Dibuja la serie cruda de OhioT1DM (con gaps y spikes). */
export function renderOhioRaw(raw, labels) {
  pintar({
    labels,
    datasets: [lineaColor('OhioT1DM raw (CGM crudo)', raw, COLORES.neutral, { tension: 0.25 })],
  });
}

/** Dibuja la serie procesada: interpolación lineal resaltada + suavizado MM-5. */
export function renderOhioProcesado(raw, interpolado, suavizado) {
  // Resalta solo los segmentos interpolados (punteado violeta)
  const interpFill = interpolado.map((v, idx) => {
    const eraNull = raw[idx] === null;
    const vecinoNull = (raw[idx - 1] === null) || (raw[idx + 1] === null);
    return (eraNull || vecinoNull) ? v : null;
  });

  pintar({
    // Restaura las etiquetas a resolución completa (renderOhioRaw pudo haberlas
    // re-muestreado a horaria), de modo que el snapshot quede alineado con los datos.
    labels: seriesCompletas ? seriesCompletas.labels.slice() : undefined,
    datasets: [
      lineaColor('Serie suavizada (MM-5)', suavizado, COLORES.euglucemia, { borderWidth: 2.5 }),
      lineaColor('Interpolación lineal', interpFill, COLORES.interp, {
        borderDash: [4, 4], tension: 0, order: 0,
      }),
    ],
  });
}
