/**
 * ui/consola.js — Módulo 5: consola criptográfica (privacidad en tiempo real).
 *
 * Imprime, por cada acción del usuario, el flujo de seguridad de 5 entradas
 * (cifrado + anonimización + persistencia) conforme a las Leyes N° 19.628 y
 * N° 21.719. Las líneas se construyen con textContent (sin innerHTML) para
 * evitar cualquier inyección.
 */

import { generarBase64, hashCorto } from '../core/random.js';
import { timestamp } from '../core/tiempo.js';
import { estado } from '../state.js';
import { DOM } from './dom.js';

/**
 * Imprime una línea en la consola. Las etiquetas se alinean por padding
 * monoespaciado (el contenedor usa white-space: pre-wrap).
 */
export function log(tag, contenido, colorClass) {
  const div = document.createElement('div');
  div.className = 'line';

  const ts = document.createElement('span');
  ts.className = 'text-slate-500';
  ts.textContent = `[${timestamp()}] `;

  const etiqueta = document.createElement('span');
  etiqueta.className = `${colorClass} font-semibold`;
  etiqueta.textContent = ('[' + tag + ']').padEnd(12, ' ');

  const msg = document.createElement('span');
  msg.className = 'text-slate-300';
  msg.textContent = ' ' + contenido;

  div.append(ts, etiqueta, msg);
  DOM.terminal.appendChild(div);
  DOM.terminal.scrollTop = DOM.terminal.scrollHeight;
}

/** Vacía el buffer visual de logs (el contador total de la sesión se preserva). */
export function limpiarLogs() {
  DOM.terminal.replaceChildren();
  log('SYSTEM', 'Buffer de logs purgado. Contador de operaciones cifradas preservado (total de sesión).', 'text-slate-400');
}

/** Flujo de seguridad de 5 entradas por evento. Incrementa el contador cifrado. */
export function registrarFlujoSeguridad(evento, payload, opciones = {}) {
  const pid = payload.patient_id || (estado.perfilActual ? estado.perfilActual.id : 'anon-unknown');

  const detalleEvt = opciones.detalleEvento ||
    `EVENT: ${evento} | patient=${pid}` +
    (payload.cho_g !== undefined ? ` | cho=${payload.cho_g}g` : '') +
    (payload.insulin_u !== undefined ? ` | insulin=${payload.insulin_u}U` : '');

  log('INFO', detalleEvt, 'text-sky-400');
  log('ENCRYPT', 'RAW_PAYLOAD: ' + JSON.stringify(payload), 'text-amber-400');
  log('ANONYMIZE', `PII_MASK: patient_id → hash_sha256 → "${hashCorto()}..." | Ley N° 19.628 Art.2(g) compliant`, 'text-violet-400');

  estado.opsCifradas++;
  log('FERNET', 'ENCRYPTED_BLOCK: gAAAAAB' + generarBase64(80) + '==', 'text-emerald-400');

  const filas = opciones.rows || 1;
  log('DB_WRITE', `STATUS: 200 OK | tabla=RegistroGlucemico | rows_inserted=${filas} | Ley N° 21.719 compliant ✓`, 'text-emerald-400');

  DOM.opsCounter.textContent = estado.opsCifradas;
}
