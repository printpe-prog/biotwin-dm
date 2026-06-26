/**
 * ui/formularioPaciente.js — Módulo de formulario para crear y editar pacientes.
 *
 * Gestiona el modal #modalPaciente en sus dos modos: alta (nuevo paciente) y
 * edición (paciente custom existente). Delega la persistencia a data/pacientes.js
 * y notifica al orquestador (main.js) mediante callbacks.
 */

import { DOM } from './dom.js';
import { agregarPaciente, editarPaciente } from '../data/pacientes.js';
import { log } from './consola.js';

let _callbacks = { alAgregar: () => {}, alEditar: () => {} };

// id del paciente que se está editando, o null si es alta nueva.
let _idEdicion = null;

/* =========================================================================
 * HELPERS
 * ========================================================================= */

function abrirModal() {
  DOM.modalPaciente.classList.remove('hidden');
  requestAnimationFrame(() => {
    DOM.modalPaciente.classList.remove('opacity-0');
    DOM.modalPaciente.querySelector('.modal-card').classList.remove('scale-95', 'opacity-0');
    DOM.formPaciente.querySelector('[name="alias"]').focus();
  });
}

function cerrarModal() {
  DOM.modalPaciente.classList.add('opacity-0');
  DOM.modalPaciente.querySelector('.modal-card').classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    DOM.modalPaciente.classList.add('hidden');
    DOM.formPaciente.reset();
    DOM.formPacienteError.textContent = '';
    _idEdicion = null;
    DOM.modalPacienteTitulo.textContent = 'Nuevo Paciente Virtual';
    DOM.btnGuardarPaciente.textContent = 'Guardar paciente';
  }, 250);
}

/** Lee y normaliza los valores del formulario. */
function leerFormulario() {
  const fd = new FormData(DOM.formPaciente);
  return {
    alias: fd.get('alias').trim(),
    tipo: fd.get('tipo'),
    glucosaBasal: Number(fd.get('glucosaBasal')),
    CR: Number(fd.get('cr')),
    ISF: Number(fd.get('isf')),
    TDD: Number(fd.get('tdd')),
    pico_absorcion_cho: Number(fd.get('pico')),
    variabilidad: Number(fd.get('variabilidad')),
    umbral_hipoglicemia_critica: Number(fd.get('umbral')),
    perfil_clinico: fd.get('perfil').trim(),
  };
}

function validar(datos) {
  if (!datos.alias) return 'El alias es obligatorio.';
  if (datos.glucosaBasal < 50 || datos.glucosaBasal > 350) return 'Glucosa basal fuera de rango (50–350 mg/dL).';
  if (datos.CR <= 0) return 'El ratio I:CHO (CR) debe ser mayor que 0.';
  if (datos.ISF <= 0) return 'El ISF debe ser mayor que 0.';
  if (datos.TDD <= 0) return 'La dosis diaria (TDD) debe ser mayor que 0.';
  if (datos.variabilidad < 0.01 || datos.variabilidad > 0.5) return 'Variabilidad fuera de rango (0.01–0.5).';
  if (datos.umbral_hipoglicemia_critica <= 0) return 'El umbral de seguridad debe ser mayor que 0.';
  return null;
}

/* =========================================================================
 * LLENADO DEL FORMULARIO PARA EDICIÓN
 * ========================================================================= */

function llenarFormulario(p) {
  const f = DOM.formPaciente;
  f.querySelector('[name="alias"]').value = p.alias;
  f.querySelector('[name="tipo"]').value = p.tipo;
  f.querySelector('[name="glucosaBasal"]').value = p.parametros.glucosaBasal;
  f.querySelector('[name="cr"]').value = p.parametros.CR;
  f.querySelector('[name="isf"]').value = p.parametros.ISF;
  f.querySelector('[name="tdd"]').value = p.parametros.TDD;
  f.querySelector('[name="pico"]').value = p.parametros.pico_absorcion_cho;
  f.querySelector('[name="variabilidad"]').value = p.parametros.variabilidad;
  f.querySelector('[name="umbral"]').value = p.umbral_hipoglicemia_critica;
  f.querySelector('[name="perfil"]').value = p.perfil_clinico || '';
}

/* =========================================================================
 * API PÚBLICA
 * ========================================================================= */

/**
 * Abre el modal en modo edición para un paciente custom existente.
 * Llamado desde main.js al pulsar el botón de lápiz en la lista.
 */
export function abrirEdicionPaciente(p) {
  _idEdicion = p.id;
  DOM.modalPacienteTitulo.textContent = 'Editar Paciente Virtual';
  DOM.btnGuardarPaciente.textContent = 'Guardar cambios';
  llenarFormulario(p);
  DOM.formPacienteError.textContent = '';
  abrirModal();
}

/**
 * Conecta todos los eventos del formulario y del botón "Nuevo paciente".
 * Debe llamarse una sola vez desde main.js durante el arranque.
 * @param {{ alAgregar: (idx: number) => void, alEditar: (idx: number) => void }} callbacks
 */
export function cablearFormularioPaciente(callbacks) {
  _callbacks = callbacks;

  // Botón "Nuevo paciente" — abre modal en modo alta
  DOM.btnNuevoPaciente.addEventListener('click', () => {
    _idEdicion = null;
    DOM.modalPacienteTitulo.textContent = 'Nuevo Paciente Virtual';
    DOM.btnGuardarPaciente.textContent = 'Guardar paciente';
    DOM.formPaciente.reset();
    DOM.formPacienteError.textContent = '';
    abrirModal();
  });

  // Botones data-cerrar del modal
  DOM.modalPaciente.querySelectorAll('[data-cerrar]').forEach((btn) => {
    btn.addEventListener('click', cerrarModal);
  });

  // Cerrar con Escape (solo cuando el modal de fallback no está abierto)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !DOM.modalPaciente.classList.contains('hidden')) cerrarModal();
  });

  // Cerrar al pulsar el fondo del overlay
  DOM.modalPaciente.addEventListener('click', (e) => {
    if (e.target === DOM.modalPaciente) cerrarModal();
  });

  // Submit del formulario
  DOM.formPaciente.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = leerFormulario();
    const error = validar(datos);
    if (error) { DOM.formPacienteError.textContent = error; return; }
    DOM.formPacienteError.textContent = '';

    if (_idEdicion) {
      const idx = editarPaciente(_idEdicion, datos);
      if (idx === -1) { DOM.formPacienteError.textContent = 'Error al guardar los cambios.'; return; }
      log('PATIENT', `Paciente personalizado editado: ${_idEdicion}`, 'text-sky-400');
      cerrarModal();
      _callbacks.alEditar(idx);
    } else {
      const idx = agregarPaciente(datos);
      log('PATIENT', `Nuevo paciente creado: ${datos.alias}`, 'text-emerald-400');
      cerrarModal();
      _callbacks.alAgregar(idx);
    }
  });
}
