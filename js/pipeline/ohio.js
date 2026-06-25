/**
 * pipeline/ohio.js — Módulo 4: pipeline OhioT1DM.
 *
 * Genera una serie temporal cruda con ruido de sensores (gaps de señal y
 * spikes de calibración) y la preprocesa con interpolación lineal y media
 * móvil. La generación es determinista (semilla del paciente 559).
 */

import { CONFIG } from '../config.js';
import { resetSeed, gaussianNoise } from '../core/random.js';

/** Tendencia base de ~8 h con dos comidas (desayuno y almuerzo). */
export function ohioTrend(t) {
  const desayuno = 75 * Math.exp(-Math.pow((t - 110) / 55, 2));
  const almuerzo = 65 * Math.exp(-Math.pow((t - 330) / 65, 2));
  return 118 + desayuno + almuerzo + 8 * Math.sin(t / 40);
}

/** Serie cruda con 3 gaps de señal (null) y spikes de calibración (±60 mg/dL). */
export function generarOhioRaw() {
  resetSeed(CONFIG.ohio.seed);
  const { pasoMin } = CONFIG.sim;
  const raw = [];
  for (let t = 0; t <= CONFIG.ohio.duracionMin; t += pasoMin) {
    raw.push(Math.round(ohioTrend(t) + gaussianNoise(4)));
  }
  // Gaps de señal (15–25 min cada uno → cortes visibles en el gráfico)
  [[150, 175], [255, 285], [400, 420]].forEach(([a, b]) => {
    for (let t = a; t <= b; t += pasoMin) raw[t / pasoMin] = null;
  });
  // Spikes de calibración (anomalías respecto de la tendencia real)
  [[75, +62], [215, -58], [365, +60]].forEach(([t, delta]) => {
    raw[t / pasoMin] = Math.round(ohioTrend(t) + delta);
  });
  return raw;
}

/**
 * Preprocesa la serie cruda: interpolación lineal de los gaps + media móvil
 * centrada de ventana 5 (suaviza los spikes).
 * Devuelve { interpolado, suavizado }.
 */
export function preprocesarOhio(raw) {
  const interpolado = raw.slice();

  // 1) Interpolación lineal de huecos
  let i = 0;
  while (i < interpolado.length) {
    if (interpolado[i] === null) {
      let j = i;
      while (j < interpolado.length && interpolado[j] === null) j++;
      const antes = interpolado[i - 1];
      const despues = interpolado[j];
      const vAntes = (antes !== undefined && antes !== null) ? antes : (despues != null ? despues : 120);
      const vDespues = (despues !== undefined && despues !== null) ? despues : vAntes;
      const pasos = j - i + 1;
      for (let k = i; k < j; k++) {
        interpolado[k] = Math.round(vAntes + (vDespues - vAntes) * ((k - i + 1) / pasos));
      }
      i = j;
    } else { i++; }
  }

  // 2) Media móvil centrada de ventana 5
  const suavizado = interpolado.map((_, idx) => {
    let suma = 0, cnt = 0;
    for (let k = idx - 2; k <= idx + 2; k++) {
      if (k >= 0 && k < interpolado.length && interpolado[k] !== null) { suma += interpolado[k]; cnt++; }
    }
    return Math.round(suma / cnt);
  });

  return { interpolado, suavizado };
}
