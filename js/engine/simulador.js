/**
 * engine/simulador.js — Módulo 2: motor de simulación fisiológica.
 *
 * Modelo compartimental tipo UVA/Padova reducido (la familia de modelos que
 * implementa SimGlucose), portado a JavaScript puro y resuelto por integración
 * numérica Runge–Kutta de 4.º orden (RK4). En lugar de sumar curvas algebraicas,
 * se integra un sistema de ecuaciones diferenciales con compartimentos
 * fisiológicos:
 *
 *   Estado y = [G, X, Q1, Q2, S1, S2]
 *     G       glucosa plasmática (mg/dL)
 *     X       acción insulínica remota, como tasa de disposición (mg/dL/min)
 *     Q1, Q2  absorción intestinal de CHO en dos compartimentos (g)   ← estilo Hovorka
 *     S1, S2  absorción de insulina subcutánea en dos compartimentos (U)
 *
 *   dG  = -p1·(G - Gb) + Ra - X         (modelo mínimo de Bergman, linealizado)
 *   dX  =  p2·(Ia - X)                  (la acción relaja hacia el aporte de insulina)
 *   dQ1 = -Q1/tauM ;  dQ2 = (Q1 - Q2)/tauM ;  Ra = kM·Q2/tauM
 *   dS1 = -S1/tauI ;  dS2 = (S1 - S2)/tauI ;  Ia = kI·S2/tauI
 *
 * Las ganancias kM (comida) y kI (insulina) se AUTO-CALIBRAN por paciente para
 * reproducir su clínica: una ingesta de D g sube el pico ≈ (D/CR)·ISF mg/dL y un
 * bolo de u U baja el nadir ≈ u·ISF mg/dL. Así el modelo queda anclado a los
 * mismos parámetros (CR, ISF, basal, pico de absorción) que controla la UI.
 */

import { CONFIG, COLORES } from '../config.js';
import { resetSeed, gaussianNoise } from '../core/random.js';

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/** Devuelve el color según el rango glucémico de un valor puntual. */
export function colorPorGlucosa(g) {
  if (g < CONFIG.rangos.hipo) return COLORES.hipo;
  if (g > CONFIG.rangos.hiper) return COLORES.hiper;
  return COLORES.euglucemia;
}

/** Genera la zona histórica estable (4 h) alrededor del basal del perfil. */
export function generarHistorico(perfil) {
  resetSeed(perfil.seed);
  const puntos = [];
  const basal = perfil.parametros.glucosaBasal;
  const sdRuido = basal * perfil.parametros.variabilidad;
  const { historicoMin, pasoMin } = CONFIG.sim;
  for (let t = -historicoMin; t <= 0; t += pasoMin) {
    const deriva = Math.sin(t / 55) * sdRuido * 0.6;        // deriva fisiológica lenta
    const g = basal + deriva + gaussianNoise(sdRuido);      // + micro-perturbación
    puntos.push({ t, glucosa: Math.round(clamp(g, 40, 360)) });
  }
  return puntos;
}

/* =========================================================================
 * NÚCLEO ODE: derivadas + integrador RK4
 * ========================================================================= */

// Índices del vector de estado y = [G, X, Q1, Q2, S1, S2].
const G = 0, X = 1, Q1 = 2, Q2 = 3, S1 = 4, S2 = 5;

/** Campo vectorial dy/dt del modelo compartimental para un estado y parámetros dados. */
function derivadas(y, par) {
  const Ra = par.kM * y[Q2] / par.tauM;   // aparición de glucosa por la comida (mg/dL/min)
  const Ia = par.kI * y[S2] / par.tauI;   // aporte de acción insulínica (mg/dL/min)
  const dy = new Array(6);
  dy[G]  = -par.p1 * (y[G] - par.Gb) + Ra - y[X];
  dy[X]  =  par.p2 * (Ia - y[X]);
  dy[Q1] = -y[Q1] / par.tauM;
  dy[Q2] = (y[Q1] - y[Q2]) / par.tauM;
  dy[S1] = -y[S1] / par.tauI;
  dy[S2] = (y[S1] - y[S2]) / par.tauI;
  return dy;
}

/** Un paso de Runge–Kutta de 4.º orden. */
function pasoRK4(y, par, h) {
  const k1 = derivadas(y, par);
  const k2 = derivadas(y.map((v, i) => v + 0.5 * h * k1[i]), par);
  const k3 = derivadas(y.map((v, i) => v + 0.5 * h * k2[i]), par);
  const k4 = derivadas(y.map((v, i) => v + h * k3[i]), par);
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** Integra desde un estado inicial y devuelve la excursión de G (pico/nadir, para calibrar). */
function excursionDeG(y0, par, minutos) {
  let y = y0;
  let maxG = y[G], minG = y[G];
  for (let t = 0; t < minutos; t += par.dt) {
    y = pasoRK4(y, par, par.dt);
    if (y[G] > maxG) maxG = y[G];
    if (y[G] < minG) minG = y[G];
  }
  return { subida: maxG - par.Gb, bajada: par.Gb - minG };
}

/* =========================================================================
 * CALIBRACIÓN POR PACIENTE (ancla el modelo a CR / ISF / basal / pico)
 * ========================================================================= */

const _cacheModelo = new Map();

function calibrar(perfil) {
  const M = CONFIG.modelo;
  const { CR, ISF, glucosaBasal, pico_absorcion_cho } = perfil.parametros;
  const par = {
    Gb: glucosaBasal, p1: M.p1, p2: M.p2,
    tauM: pico_absorcion_cho, tauI: M.tauInsulinaMin,
    dt: M.dtMin, kM: 1, kI: 1,
  };
  const horizonte = CONFIG.sim.prediccionMin;

  // Ganancia de comida kM: ajusta el pico de subida a (choRef/CR)·ISF mg/dL.
  const y0Comida = [par.Gb, 0, M.choRef, 0, 0, 0];
  const subidaUnit = excursionDeG(y0Comida, par, horizonte).subida || 1;
  par.kM = ((M.choRef / CR) * ISF) / subidaUnit;

  // Ganancia de insulina kI: ajusta el nadir de bajada a insulinaRef·ISF mg/dL.
  const y0Insulina = [par.Gb, 0, 0, 0, M.insulinaRef, 0];
  const bajadaUnit = excursionDeG(y0Insulina, par, horizonte).bajada || 1;
  par.kI = (M.insulinaRef * ISF) / bajadaUnit;

  return par;
}

/** Devuelve el modelo calibrado de un paciente (memoizado por id + parámetros). */
function modeloDe(perfil) {
  const firma = perfil.id + '|' + JSON.stringify(perfil.parametros);
  let par = _cacheModelo.get(firma);
  if (!par) { par = calibrar(perfil); _cacheModelo.set(firma, par); }
  return par;
}

/* =========================================================================
 * PREDICCIÓN: integra el modelo ante una ingesta (gCHO) y un bolo (uInsulina)
 * ========================================================================= */

/**
 * Genera la trayectoria predictiva (6 h) integrando el modelo compartimental.
 * La ingesta y el bolo entran como impulsos en el primer compartimento de cada
 * cadena de absorción. Cada punto incluye la desviación estándar de la banda de
 * incertidumbre, que crece con el horizonte de predicción.
 */
export function generarPrediccion(perfil, gCHO, uInsulina, glucosaInicial) {
  const par = modeloDe(perfil);
  resetSeed(perfil.seed + 7);
  const { prediccionMin, pasoMin } = CONFIG.sim;
  const { min, max } = CONFIG.glucemia;
  const sdRuido = perfil.parametros.glucosaBasal * perfil.parametros.variabilidad;

  // Estado inicial: glucosa observada + impulsos de comida e insulina.
  let y = [glucosaInicial, 0, Math.max(gCHO, 0), 0, Math.max(uInsulina, 0), 0];
  let t = 0;
  const puntos = [];

  const registrar = (tt) => {
    const g = clamp(y[G] + gaussianNoise(sdRuido), min, max);
    const sdBanda = sdRuido * 1.2 + (tt / 60) * 3.0;
    puntos.push({ t: tt, glucosa: Math.round(g), sd: sdBanda });
  };

  registrar(0);
  while (t < prediccionMin) {
    const objetivo = Math.min(t + pasoMin, prediccionMin);
    while (t < objetivo - 1e-9) {
      const h = Math.min(par.dt, objetivo - t);
      y = pasoRK4(y, par, h);
      t += h;
    }
    registrar(Math.round(t));
  }
  return puntos;
}
