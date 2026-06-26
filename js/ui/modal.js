/**
 * ui/modal.js — Módulo 3: control RL/PID y modal de alerta crítica.
 *
 * Gestiona el toggle del Agente RL y el modal de fallback por dosis peligrosa,
 * incluyendo accesibilidad (foco y cierre con Escape se cablean en main.js).
 */

import { DOM } from './dom.js';
import { estado } from '../state.js';
import { registrarFlujoSeguridad } from './consola.js';

/**
 * Cambia la política de control activa.
 * @param {boolean} activo     true = Agente RL; false = Controlador PID
 * @param {boolean} silencioso si true, no registra el cambio en la consola
 */
export function setRL(activo, silencioso) {
  estado.rlActivo = activo;
  DOM.toggleRL.classList.toggle('on', activo);
  DOM.toggleRL.setAttribute('aria-checked', String(activo));
  if (activo) {
    DOM.badgeRL.textContent = 'IA Activa';
    DOM.badgeRL.className = 'text-[10px] font-mono px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
  } else {
    DOM.badgeRL.textContent = 'Control manual';
    DOM.badgeRL.className = 'text-[10px] font-mono px-2 py-1 rounded-md bg-slate-600/30 text-slate-400 border border-slate-600';
  }
  if (!silencioso) {
    const politica = activo ? 'RL_StableBaselines3' : 'PID_heuristic';
    registrarFlujoSeguridad('control_policy_switch',
      { patient_id: estado.perfilActual ? estado.perfilActual.id : 'anon-unknown', policy: politica },
      { detalleEvento: `EVENT: control_policy_switch | policy=${politica}` });
  }
}

export function modalVisible() {
  return !DOM.modalFallback.classList.contains('hidden');
}

/** Abre el modal de alerta crítica y lleva el foco al botón de acción. */
export function abrirModal(dosis, umbral) {
  DOM.modalDosis.textContent = dosis.toFixed(1);
  DOM.modalUmbral.textContent = umbral.toFixed(1);
  DOM.modalFallback.classList.remove('hidden');
  requestAnimationFrame(() => {
    DOM.modalFallback.classList.remove('opacity-0');
    DOM.modalCard.classList.remove('scale-95', 'opacity-0');
    DOM.btnCerrarModal.focus();
  });
}

export function cerrarModal() {
  DOM.modalFallback.classList.add('opacity-0');
  DOM.modalCard.classList.add('scale-95', 'opacity-0');
  setTimeout(() => DOM.modalFallback.classList.add('hidden'), 250);
}
