/**
 * core/tiempo.js — Utilidades de tiempo para etiquetas y logs.
 */

import { CONFIG } from '../config.js';

/**
 * Convierte un desplazamiento en minutos (relativo al inicio de sesión) a una
 * etiqueta de reloj HH:MM. Por defecto la base es la hora de inicio de sesión.
 */
export function etiquetaTiempo(tMin, baseHora = CONFIG.sim.horaInicioSesion) {
  let total = baseHora * 60 + tMin;
  total = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** Marca temporal actual en formato "YYYY-MM-DD HH:MM:SS" para la consola. */
export function timestamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
