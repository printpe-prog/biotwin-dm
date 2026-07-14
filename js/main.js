/**
 * main.js — Punto de entrada y capa de orquestación.
 *
 * Conecta el modelo de datos, el motor de simulación, el pipeline y la UI.
 * Es el único módulo cargado por index.html (`<script type="module">`); el
 * resto se resuelve por imports.
 */

import { CONFIG } from './config.js';
import { DOM, cacheDOM } from './ui/dom.js';
import { estado } from './state.js';
import { PACIENTES, sesionActiva, cargarPacientesGuardados, eliminarPaciente } from './data/pacientes.js';
import { etiquetaTiempo } from './core/tiempo.js';
import { generarOhioRaw, preprocesarOhio } from './pipeline/ohio.js';
import {
  initChart, renderBasal, renderSimulacion, renderOhioRaw, renderOhioProcesado, setResolucionEje,
  renderTrayectoria, renderValidacion,
} from './ui/grafico.js';
import { updateAllMetrics, setBadgeModo, renderRMSECard, setMetricasBackend, setRMSEBackend } from './ui/kpis.js';
import { log, registrarFlujoSeguridad, logFlujoBackend, limpiarLogs } from './ui/consola.js';
import { setRL, abrirModal, cerrarModal, modalVisible } from './ui/modal.js';
import { cablearFormularioPaciente, abrirEdicionPaciente } from './ui/formularioPaciente.js';
import { api, probarBackend, listarPacientes, apiSimular, apiValidar } from './api.js';

// Pacientes provenientes del backend (motor real). Vacío en modo offline.
let pacientesBackend = [];

/* =========================================================================
 * GUARDA DE DEPENDENCIAS (CDN)
 * ========================================================================= */
function dependenciasDisponibles() {
  return typeof window.Chart !== 'undefined';
}

/** Refleja en el encabezado qué motor está activo (real vs. offline). */
function setEstadoConexion(texto, tono) {
  const colores = {
    emerald: { txt: 'text-emerald-400', dot: '#34d399' },
    amber: { txt: 'text-amber-400', dot: '#fbbf24' },
    slate: { txt: 'text-slate-300', dot: '#94a3b8' },
  };
  const c = colores[tono] || colores.slate;
  if (DOM.estadoConexion) {
    DOM.estadoConexion.textContent = texto;
    DOM.estadoConexion.className = c.txt + ' font-medium';
  }
  if (DOM.estadoDot) {
    DOM.estadoDot.style.background = c.dot;
    DOM.estadoDot.style.boxShadow = `0 0 8px ${c.dot}`;
  }
}

function mostrarErrorDependencias() {
  const aviso = document.createElement('div');
  aviso.className = 'fixed inset-x-0 top-0 z-50 bg-rose-900 text-rose-100 text-sm ' +
    'font-mono px-4 py-3 text-center border-b border-rose-500';
  aviso.textContent = '⚠ No se pudieron cargar las librerías externas (Chart.js). ' +
    'Verifique la conexión a internet y recargue la página.';
  document.body.prepend(aviso);
}

/* =========================================================================
 * SELECTOR DE PACIENTES Y FICHA CLÍNICA
 * ========================================================================= */
// Reconstruye la lista de pacientes (re-ejecutable: limpia antes de poblar).
function construirSelector() {
  DOM.selectorPacientes.replaceChildren();
  PACIENTES.forEach((p, idx) => {
    const fila = document.createElement('div');
    fila.className = 'relative';

    const btn = document.createElement('button');
    btn.dataset.idx = idx;
    btn.className = 'patient-btn w-full text-left p-3 rounded-lg border border-slate-700 bg-slate-900/50 ' +
      'hover:border-sky-500/50 hover:bg-slate-900 transition-all duration-300';

    // Se construye con nodos + textContent (no innerHTML): el alias es texto libre
    // del usuario persistido en localStorage, así que interpolarlo como HTML sería
    // un vector de XSS almacenado. textContent lo neutraliza por completo.
    const linea1 = document.createElement('p');
    linea1.className = 'text-xs font-medium text-slate-200 pr-12';
    linea1.textContent = p.alias;
    if (p.custom) {
      const badge = document.createElement('span');
      badge.className = 'ml-1 align-middle text-[9px] px-1 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30';
      badge.textContent = 'custom';
      linea1.appendChild(badge);
    }
    const linea2 = document.createElement('p');
    linea2.className = 'text-[10px] font-mono text-slate-500 mt-0.5';
    linea2.textContent = `${p.id} · ${p.tipo}`;
    btn.append(linea1, linea2);
    btn.addEventListener('click', () => cargarPerfil(idx));
    fila.appendChild(btn);

    // Los pacientes personalizados pueden editarse y eliminarse
    if (p.custom) {
      const editar = document.createElement('button');
      editar.className = 'absolute top-2 right-8 text-slate-500 hover:text-sky-400 transition-colors';
      editar.title = 'Editar paciente';
      editar.setAttribute('aria-label', `Editar ${p.alias}`);
      editar.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
      editar.addEventListener('click', (e) => { e.stopPropagation(); abrirEdicionPaciente(p); });
      fila.appendChild(editar);

      const del = document.createElement('button');
      del.className = 'absolute top-2 right-2 text-slate-500 hover:text-rose-400 transition-colors';
      del.title = 'Eliminar paciente';
      del.setAttribute('aria-label', `Eliminar ${p.alias}`);
      del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
      del.addEventListener('click', (e) => manejarEliminar(e, p.id));
      fila.appendChild(del);
    }

    DOM.selectorPacientes.appendChild(fila);
  });
}

function marcarSeleccionado(idx) {
  DOM.selectorPacientes.querySelectorAll('.patient-btn').forEach((b) => {
    const sel = Number(b.dataset.idx) === idx;
    b.classList.toggle('border-sky-500', sel);
    b.classList.toggle('bg-slate-900', sel);
    b.classList.toggle('ring-1', sel);
    b.classList.toggle('ring-sky-500/40', sel);
  });
}

// Elimina un paciente personalizado y vuelve al primer perfil.
function manejarEliminar(e, id) {
  e.stopPropagation();
  if (!eliminarPaciente(id)) return;
  log('PATIENT', `Paciente personalizado eliminado: ${id}`, 'text-rose-400');
  construirSelector();
  cargarPerfil(0);
}

function chipParam(label, valor, alerta) {
  const color = alerta ? 'text-rose-400' : 'text-sky-300';
  return `<div class="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1.5">` +
    `<span class="text-slate-500">${label}</span>` +
    `<span class="block ${color} font-semibold tnum">${valor}</span></div>`;
}

/** Carga un perfil: ficha clínica, estado basal y log. */
function cargarPerfil(idx) {
  estado.perfilActual = PACIENTES[idx];
  const perfil = estado.perfilActual;
  marcarSeleccionado(idx);

  DOM.perfilClinico.textContent = perfil.perfil_clinico;
  const par = perfil.parametros;
  DOM.perfilParametros.innerHTML =
    chipParam('Ratio comida', par.CR + ' g/U') +
    chipParam('Sensibilidad', par.ISF + ' mg/dL') +
    chipParam('Dosis diaria', par.TDD + ' U/día') +
    chipParam('Glucosa base', par.glucosaBasal + ' mg/dL') +
    chipParam('Absorción', par.pico_absorcion_cho + ' min') +
    chipParam('Variabilidad', (par.variabilidad * 100).toFixed(0) + '%') +
    chipParam('Límite bolo', perfil.umbral_hipoglicemia_critica + ' U', true);

  renderBasal(perfil);

  registrarFlujoSeguridad('patient_profile_load',
    { patient_id: perfil.id, profile_type: perfil.tipo, basal: par.glucosaBasal, origin: 'historico' },
    { detalleEvento: `EVENT: patient_profile_load | patient=${perfil.id} | type=${perfil.tipo}` });
}

/* =========================================================================
 * SIMULACIÓN (con verificación de seguridad previa)
 * ========================================================================= */
function ejecutarSimulacion() {
  const perfil = estado.perfilActual;
  if (!perfil) return;
  const gCHO = parseFloat(DOM.inputCHO.value);
  const uInsulina = parseFloat(DOM.inputInsulina.value);
  const umbral = perfil.umbral_hipoglicemia_critica;

  // Verificación de dosis peligrosa ANTES de simular
  if (uInsulina > umbral) {
    estado.simPendiente = { gCHO, uInsulinaOriginal: uInsulina, umbral };
    setRL(false, true);          // anulación preventiva del RL (con animación)
    abrirModal(uInsulina, umbral);
    return;
  }

  // Camino normal
  sesionActiva.fk_paciente = perfil.id;
  sesionActiva.estado = 'activa';
  renderSimulacion(perfil, gCHO, uInsulina, false);

  const glucosaActual = estado.registroGlucemico.length
    ? estado.registroGlucemico[0].glucosa_mg_dl : perfil.parametros.glucosaBasal;
  registrarFlujoSeguridad('simulation_request', {
    patient_id: perfil.id, glucose: glucosaActual,
    cho_g: gCHO, insulin_u: uInsulina, timestamp: '2026-06-12T08:34:11Z',
  });
}

/** Continuación tras confirmar la alerta de fallback (dosis recortada al umbral). */
function continuarConFallback() {
  cerrarModal();
  DOM.btnSimular.focus(); // accesibilidad: devuelve el foco al disparador
  if (!estado.simPendiente) return;

  const perfil = estado.perfilActual;
  const { gCHO, uInsulinaOriginal, umbral } = estado.simPendiente;
  const uSegura = umbral; // dosis recortada al umbral seguro

  sesionActiva.fk_paciente = perfil.id;
  sesionActiva.estado = 'activa';
  renderSimulacion(perfil, gCHO, uSegura, true);

  log('FALLBACK_PID',
    `Dosis ${uInsulinaOriginal.toFixed(1)}U > umbral ${umbral.toFixed(1)}U → RL anulado · bolo recortado a ${uSegura.toFixed(1)}U`,
    'text-rose-400');
  registrarFlujoSeguridad('simulation_request_fallback', {
    patient_id: perfil.id, cho_g: gCHO, insulin_u: uSegura,
    insulin_requested: uInsulinaOriginal, controller: 'PID_heuristic',
    timestamp: '2026-06-12T08:34:11Z',
  });
  estado.simPendiente = null;
}

/* =========================================================================
 * MODO BACKEND (motor real: simglucose UVA/Padova + RL + cifrado Fernet)
 * ========================================================================= */
async function iniciarModoBackend() {
  const s = api.salud || {};
  setEstadoConexion('Motor real · backend conectado', 'emerald');
  log('SYSTEM', `Backend conectado · ${s.motor || 'simglucose'} · RL ${s.rl_disponible ? 'entrenado (PPO)' : 'no disponible → PID'}`, 'text-emerald-400');
  log('SYSTEM', 'Cifrado Fernet/AES real en servidor · cumplimiento Ley N° 19.628 y N° 21.719', 'text-slate-400');

  pacientesBackend = await listarPacientes();
  construirSelectorBackend();
  await cargarPerfilBackend(0);

  // Validación inicial (OE3/OE4): RMSE y R² reales para la tarjeta.
  try {
    const v = await apiValidar({ patient_id: '559', horizonte_pred_min: 30 });
    setRMSEBackend({ rmse: v.rmse, r2: v.r2, fuente: v.fuente, cumple: v.cumple_rmse && v.cumple_r2 });
  } catch { renderRMSECard(); }
}

function construirSelectorBackend() {
  DOM.selectorPacientes.replaceChildren();

  const sel = document.createElement('select');
  sel.id = 'dropdownPacientes';
  sel.className = 'selector-paciente';
  sel.setAttribute('aria-label', 'Seleccionar paciente virtual');

  const grupos = { adulto: 'Adultos', adolescente: 'Adolescentes', pediatrico: 'Niños', real: 'Pacientes reales (OhioT1DM)' };
  for (const tipo of Object.keys(grupos)) {
    const items = pacientesBackend
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.tipo === tipo);
    if (!items.length) continue;
    const og = document.createElement('optgroup');
    og.label = grupos[tipo];
    for (const { p, idx } of items) {
      const o = document.createElement('option');
      o.value = String(idx);
      o.textContent = p.alias;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.addEventListener('change', () => cargarPerfilBackend(Number(sel.value)));
  DOM.selectorPacientes.appendChild(sel);

  const nReales = pacientesBackend.filter((p) => p.tipo === 'real').length;
  const nVirtuales = pacientesBackend.length - nReales;
  const info = document.createElement('p');
  info.className = 'text-[10px] text-slate-500 mt-2 font-mono flex items-center gap-1';
  info.innerHTML = `<span class="text-emerald-400">${nVirtuales}</span> virtuales UVA/Padova (FDA)` +
    (nReales ? ` · <span class="text-sky-400">${nReales}</span> reales OhioT1DM` : '');
  DOM.selectorPacientes.appendChild(info);

  // El botón "Nuevo paciente" no aplica en modo backend (perfiles validados FDA).
  DOM.btnNuevoPaciente.classList.add('hidden');
}

async function cargarPerfilBackend(idx) {
  const p = pacientesBackend[idx];
  estado.perfilActual = p;
  const dd = document.getElementById('dropdownPacientes');
  if (dd) dd.value = String(idx);

  DOM.perfilClinico.textContent = p.perfil_clinico;
  const par = p.parametros;
  DOM.perfilParametros.innerHTML =
    chipParam('Ratio comida', par.CR + ' g/U') +
    chipParam('Sensibilidad', par.ISF + ' mg/dL') +
    chipParam('Dosis diaria', par.TDD + ' U/día') +
    chipParam('Glucosa base', par.glucosaBasal + ' mg/dL') +
    chipParam('Peso', par.peso_kg + ' kg') +
    chipParam('Edad', (par.edad ?? '—') + ' años') +
    chipParam('Límite bolo', p.umbral_hipoglicemia_critica + ' U', true);

  setBadgeModo('Estado basal (motor real)', 'sky');
  // Trayectoria basal real (sin comida ni bolo) desde el motor UVA/Padova.
  try {
    const res = await apiSimular({
      patient_name: p.simglucose_name, cho_g: 0, bolus_u: 0,
      horizonte_min: 360, usar_rl: false, seed: 1,
    });
    renderTrayectoria(res.puntos, 'Estado basal (motor real)', 'sky');
    setMetricasBackend({ tir: res.tir, tbr: res.tbr, decision: res.decision_clinica });
  } catch (e) {
    log('ERROR', 'No se pudo cargar el estado basal: ' + e.message, 'text-rose-400');
  }
}

function ejecutarSimulacionBackend() {
  const p = estado.perfilActual;
  if (!p) return;
  const gCHO = parseFloat(DOM.inputCHO.value);
  const uIns = parseFloat(DOM.inputInsulina.value);
  const umbral = p.umbral_hipoglicemia_critica;

  if (uIns > umbral) {
    estado.simPendiente = { gCHO, uInsulinaOriginal: uIns, umbral };
    setRL(false, true);
    abrirModal(uIns, umbral);
    return;
  }
  correrBackend(p, gCHO, uIns, estado.rlActivo, false);
}

function continuarConFallbackBackend() {
  cerrarModal();
  DOM.btnSimular.focus();
  if (!estado.simPendiente) return;
  const p = estado.perfilActual;
  const { gCHO, uInsulinaOriginal } = estado.simPendiente;
  // El backend recorta el bolo al umbral y conmuta a PID.
  correrBackend(p, gCHO, uInsulinaOriginal, false, true);
  estado.simPendiente = null;
}

async function correrBackend(p, gCHO, uIns, usarRL, esFallback) {
  DOM.btnSimular.disabled = true;
  try {
    const res = await apiSimular({
      patient_name: p.simglucose_name, cho_g: gCHO, bolus_u: uIns,
      horizonte_min: 360, usar_rl: usarRL, seed: 1,
    });
    const tono = res.fallback_activado ? 'rose' : (res.controlador === 'RL' ? 'emerald' : 'sky');
    const modo = res.fallback_activado ? 'Predicción · PID (Fallback)' : `Predicción · ${res.controlador}`;
    renderTrayectoria(res.puntos, modo, tono);
    setMetricasBackend({ tir: res.tir, tbr: res.tbr, decision: res.decision_clinica });
    if (res.fallback_activado) {
      log('FALLBACK_PID', `Bolo ${res.bolus_solicitado}U > umbral ${res.umbral}U → RL anulado · recortado a ${res.bolus_efectivo}U`, 'text-rose-400');
    }
    logFlujoBackend(res.flujo_seguridad);
  } catch (e) {
    log('ERROR', 'Fallo en la simulación: ' + e.message, 'text-rose-400');
  } finally {
    DOM.btnSimular.disabled = false;
  }
}

async function cargarValidacionBackend() {
  DOM.pipelineStatus.classList.remove('hidden');
  DOM.pipelineStatus.classList.add('flex');
  try {
    const v = await apiValidar({ patient_id: '559', horizonte_pred_min: 30 });
    renderValidacion(v.labels, v.serie_real, v.serie_predicha);
    const ok = v.cumple_rmse && v.cumple_r2;
    setBadgeModo(`Validación · RMSE ${v.rmse} · R² ${v.r2}`, ok ? 'emerald' : 'amber');
    setRMSEBackend({ rmse: v.rmse, r2: v.r2, fuente: v.fuente, cumple: ok });
    log('VALIDACION', `Fuente: ${v.fuente} · n=${v.n_muestras} muestras`, 'text-sky-400');
    log('VALIDACION', `RMSE=${v.rmse} mg/dL (meta <25) · R²=${v.r2} (meta ≥0.85) · MAE=${v.mae}`, ok ? 'text-emerald-400' : 'text-amber-400');
  } catch (e) {
    log('ERROR', 'Fallo en la validación: ' + e.message, 'text-rose-400');
  } finally {
    DOM.pipelineStatus.classList.add('hidden');
    DOM.pipelineStatus.classList.remove('flex');
  }
}

/* =========================================================================
 * PIPELINE OhioT1DM (orquestación: pipeline + render + logs)
 * ========================================================================= */
function cargarOhio() {
  const raw = generarOhioRaw();
  const labels = raw.map((_, idx) => etiquetaTiempo(idx * CONFIG.sim.pasoMin, CONFIG.ohio.horaInicio));

  // --- Paso 1: serie cruda (con gaps y spikes) ---
  estado.curvaActual = { valores: raw, ultimo: raw.filter((v) => v !== null).pop() };
  setBadgeModo('OhioT1DM · [RAW — Sin procesar]', 'amber');
  renderOhioRaw(raw, labels);
  updateAllMetrics();

  registrarFlujoSeguridad('ohiot1dm_load_raw',
    { patient_id: 'ohio-559', source: 'OhioT1DM_2020', samples: raw.length, origin: 'ohiot1dm' },
    { detalleEvento: 'EVENT: ohiot1dm_load_raw | dataset=OhioT1DM | patient=559 | gaps=3 | spikes=3' });
  log('PIPELINE', 'detect_gaps: 3 brechas de señal detectadas (valores null)', 'text-amber-400');
  log('PIPELINE', 'detect_outliers: 3 spikes de calibración (±60 mg/dL) marcados', 'text-amber-400');

  // --- Paso 2: preprocesamiento animado (1.5 s de delay visual) ---
  DOM.pipelineStatus.classList.remove('hidden');
  DOM.pipelineStatus.classList.add('flex');

  setTimeout(() => {
    const { interpolado, suavizado } = preprocesarOhio(raw);
    renderOhioProcesado(raw, interpolado, suavizado);

    DOM.pipelineStatus.classList.add('hidden');
    DOM.pipelineStatus.classList.remove('flex');
    estado.curvaActual = { valores: suavizado, ultimo: suavizado[suavizado.length - 1] };
    setBadgeModo('OhioT1DM · [PROCESADO — Listo para inferencia]', 'emerald');
    updateAllMetrics();

    log('PIPELINE', 'linear_interpolation: 3 gaps rellenados', 'text-sky-400');
    log('PIPELINE', 'moving_average(window=5): spikes suavizados', 'text-sky-400');
    registrarFlujoSeguridad('ohiot1dm_preprocess_done',
      { patient_id: 'ohio-559', steps: ['interpolation', 'moving_avg_w5'], status: 'ready_for_inference', origin: 'ohiot1dm' },
      { detalleEvento: 'EVENT: ohiot1dm_preprocess_done | interpolation=linear | smoothing=MM5 | status=ready' });
  }, 1500);
}

/* =========================================================================
 * RESOLUCIÓN DEL EJE TEMPORAL (pestaña 5 min / 1 hora)
 * ========================================================================= */
function setResolucion(modo) {
  setResolucionEje(modo);
  const base = 'px-2 py-1 text-[10px] font-mono rounded-md border transition-all ';
  const activo = 'border-sky-500/30 bg-sky-500/15 text-sky-400';
  const inactivo = 'border-slate-700 text-slate-400 hover:text-slate-200';
  DOM.btnEjeDetalle.className = base + (modo === 'detalle' ? activo : inactivo);
  DOM.btnEjeHora.className = base + (modo === 'hora' ? activo : inactivo);
}

/* =========================================================================
 * MANEJADORES DE EVENTOS
 * ========================================================================= */
// Routers: en modo backend usan el motor real; si no, el motor JS local.
function simularRouter() { return api.online ? ejecutarSimulacionBackend() : ejecutarSimulacion(); }
function ohioRouter() { return api.online ? cargarValidacionBackend() : cargarOhio(); }
function fallbackRouter() { return api.online ? continuarConFallbackBackend() : continuarConFallback(); }
function alternarRL() {
  setRL(!estado.rlActivo, api.online); // silencioso online (sin cripto simulada local)
  if (api.online) {
    log('CONTROL', `Política activa: ${estado.rlActivo ? 'Agente RL (PPO entrenado)' : 'Controlador PID clásico'}`, 'text-sky-400');
  }
}

function bindEventos() {
  DOM.inputCHO.addEventListener('input', () => { DOM.valCHO.textContent = DOM.inputCHO.value; });
  DOM.inputInsulina.addEventListener('input', () => {
    DOM.valInsulina.textContent = parseFloat(DOM.inputInsulina.value).toFixed(1);
  });
  DOM.btnSimular.addEventListener('click', simularRouter);

  DOM.toggleRL.addEventListener('click', alternarRL);
  DOM.toggleRL.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarRL(); }
  });

  DOM.btnOhio.addEventListener('click', ohioRouter);
  DOM.btnEjeDetalle.addEventListener('click', () => setResolucion('detalle'));
  DOM.btnEjeHora.addEventListener('click', () => setResolucion('hora'));
  DOM.btnCerrarModal.addEventListener('click', fallbackRouter);

  // Accesibilidad: cerrar el modal de fallback con Escape (procede con PID)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalVisible()) fallbackRouter();
  });

  DOM.btnLimpiarLogs.addEventListener('click', limpiarLogs);
}

/* =========================================================================
 * ARRANQUE
 * ========================================================================= */
async function init() {
  cacheDOM();

  if (!dependenciasDisponibles()) { mostrarErrorDependencias(); return; }

  // Registro del plugin de anotaciones (líneas de referencia 70/180 mg/dL)
  if (window['chartjs-plugin-annotation']) {
    window.Chart.register(window['chartjs-plugin-annotation']);
  }

  initChart();
  bindEventos();

  // ¿Hay backend real (FastAPI + simglucose + RL)? Si sí, se usa; si no, motor local.
  const online = await probarBackend();

  if (online) {
    await iniciarModoBackend();
    return;
  }

  // --- Modo offline: motor JavaScript local (build portable) ---
  cargarPacientesGuardados();   // anexa los pacientes personalizados del navegador
  construirSelector();
  cablearFormularioPaciente({
    alAgregar: (idx) => { construirSelector(); cargarPerfil(idx); },
    alEditar: (idx) => { construirSelector(); cargarPerfil(idx); },
  });

  setEstadoConexion('Motor local · modo offline', 'amber');
  log('SYSTEM', 'BioTwin-DM (modo offline) · modelo compartimental tipo UVA/Padova · integración RK4', 'text-emerald-400');
  log('SYSTEM', 'Backend no detectado · cifrado simulado · inicie el servidor para el motor real', 'text-amber-400');

  renderRMSECard();  // render estático de la tarjeta RMSE (valor fijo de referencia)
  cargarPerfil(0);   // carga el primer perfil por defecto
}

// Los módulos ES se ejecutan diferidos (tras el parseo del DOM), pero
// añadimos la guarda de readyState por robustez.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
