/**
 * core/random.js — Utilidades deterministas (sin aleatoriedad descontrolada).
 *
 * Toda la variabilidad fisiológica y los bloques cifrados de la consola usan
 * esta PRNG con semilla fija, de modo que las demos son reproducibles.
 */

let _seed = 0x9e3779b9;

/** Reinicia la semilla de la PRNG (entero de 32 bits). */
export function resetSeed(s) { _seed = (s >>> 0) || 1; }

/** Mulberry32: PRNG rápida y determinista en [0,1). */
export function seededRandom() {
  _seed |= 0;
  _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Ruido gaussiano (Box–Muller) escalado por una desviación estándar dada. */
export function gaussianNoise(sd) {
  const u1 = Math.max(seededRandom(), 1e-9);
  const u2 = seededRandom();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd;
}

/** Cadena base64 verosímil (para los bloques cifrados de la consola). */
export function generarBase64(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(seededRandom() * chars.length)];
  return s;
}

/** Hash hexadecimal corto simulado (SHA-256 truncado para el log de anonimización). */
export function hashCorto() {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 8; i++) s += hex[Math.floor(seededRandom() * 16)];
  return s;
}
