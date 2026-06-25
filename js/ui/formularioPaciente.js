/**
 * ui/formularioPaciente.js — Modal para crear y editar pacientes desde la UI.
 *
 * El mismo modal opera en dos modos según `_editandoId`:
 *   - crear  (null): registra un PacienteVirtual nuevo vía `agregarPaciente`.
 *   - editar (id):   actualiza uno existente vía `editarPaciente`.
 * Tras validar, persiste mediante la capa de datos y notifica al orquestador
 * con `alAgregar(indice)` o `alEditar(indice)`.
 */

import { DOM } from './dom.js';
import { agregarPaciente, editarPaciente } from '../data/pacientes.js';
import { log } from './consola.js';

let _alAgregar = null;
let _alEditar = null;
let _editandoId = null;   // null = modo crear; id = modo editar

/** Cablea el botón "Nuevo paciente", el modal y el envío del formulario. */
export function cablearFormularioPaciente({ alAgregar, alEditar }) {
  _alAgregar = alAgregar;
  _alEditar = alEditar;
  DOM.btnNuevoPaciente.addEventListener('click', abrirFormulario);
  DOM.formPaciente.addEventListener('submit', manejarSubmit);

  // Cierre: botones marcados con data-cerrar, clic en el fondo y tecla Escape
  DOM.modalPaciente.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarFormulario));
  DOM.modalPaciente.addEventListener('click', (e) => { if (e.target === DOM.modalPaciente) cerrarFormulario(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !DOM.modalPaciente.classList.contains('hidden')) cerrarFormulario();
  });
}

/** Abre el modal en modo CREAR (formulario en blanco con valores por defecto). */
function abrirFormulario() {
  _editandoId = null;
  DOM.formPaciente.reset();
  DOM.modalPacienteTitulo.textContent = 'Nuevo Paciente Virtual';
  DOM.btnGuardarPaciente.textContent = 'Guardar paciente';
  DOM.formPacienteError.textContent = '';
  _mostrarModal();
}

/** Abre el modal en modo EDITAR, precargando los datos del paciente dado. */
export function abrirEdicionPaciente(perfil) {
  _editandoId = perfil.id;
  const f = DOM.formPaciente.elements;
  const p = perfil.parametros;
  f.alias.value = perfil.alias;
  f.tipo.value = perfil.tipo;
  f.glucosaBasal.value = p.glucosaBasal;
  f.cr.value = p.CR;
  f.isf.value = p.ISF;
  f.tdd.value = p.TDD;
  f.pico.value = p.pico_absorcion_cho;
  f.variabilidad.value = p.variabilidad;
  f.umbral.value = perfil.umbral_hipoglicemia_critica;
  f.perfil.value = perfil.perfil_clinico || '';
  DOM.modalPacienteTitulo.textContent = 'Editar Paciente Virtual';
  DOM.btnGuardarPaciente.textContent = 'Guardar cambios';
  DOM.formPacienteError.textContent = '';
  _mostrarModal();
}

function _mostrarModal() {
  const card = DOM.modalPaciente.querySelector('.modal-card');
  DOM.modalPaciente.classList.remove('hidden');
  requestAnimationFrame(() => {
    DOM.modalPaciente.classList.remove('opacity-0');
    card.classList.remove('scale-95', 'opacity-0');
    DOM.formPaciente.elements.alias.focus();
  });
}

function cerrarFormulario() {
  const card = DOM.modalPaciente.querySelector('.modal-card');
  DOM.modalPaciente.classList.add('opacity-0');
  card.classList.add('scale-95', 'opacity-0');
  setTimeout(() => DOM.modalPaciente.classList.add('hidden'), 250);
}

const num = (el) => parseFloat(el.value);

/** Lee y valida el formulario; según el modo, crea o actualiza el paciente. */
function manejarSubmit(e) {
  e.preventDefault();
  const f = DOM.formPaciente.elements;
  const datos = {
    alias: f.alias.value.trim(),
    tipo: f.tipo.value,
    CR: num(f.cr), ISF: num(f.isf), TDD: num(f.tdd),
    glucosaBasal: num(f.glucosaBasal), pico_absorcion_cho: num(f.pico),
    variabilidad: num(f.variabilidad),
    umbral_hipoglicemia_critica: num(f.umbral),
    perfil_clinico: f.perfil.value.trim(),
  };

  const error = validar(datos);
  if (error) { DOM.formPacienteError.textContent = error; return; }

  if (_editandoId) {
    const idx = editarPaciente(_editandoId, datos);
    log('PATIENT', `Paciente actualizado: ${datos.alias}`, 'text-sky-400');
    _editandoId = null;
    cerrarFormulario();
    if (idx !== -1 && _alEditar) _alEditar(idx);
  } else {
    const idx = agregarPaciente(datos);
    log('PATIENT', `Nuevo paciente personalizado registrado: ${datos.alias}`, 'text-sky-400');
    DOM.formPaciente.reset();
    cerrarFormulario();
    if (_alAgregar) _alAgregar(idx);
  }
}

/** Reglas clínicas mínimas. Devuelve un mensaje de error o null si es válido. */
function validar(d) {
  if (!d.alias) return 'El alias es obligatorio.';
  const positivos = {
    'CR': d.CR, 'ISF': d.ISF, 'TDD': d.TDD,
    'pico de absorción': d.pico_absorcion_cho, 'umbral de seguridad': d.umbral_hipoglicemia_critica,
  };
  for (const [k, v] of Object.entries(positivos)) {
    if (!Number.isFinite(v) || v <= 0) return `El campo "${k}" debe ser un número mayor que 0.`;
  }
  if (!Number.isFinite(d.glucosaBasal) || d.glucosaBasal < 60 || d.glucosaBasal > 300)
    return 'La glucosa basal debe estar entre 60 y 300 mg/dL.';
  if (!Number.isFinite(d.variabilidad) || d.variabilidad < 0.01 || d.variabilidad > 0.5)
    return 'La variabilidad debe estar entre 0.01 y 0.5.';
  return null;
}
