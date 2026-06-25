/**
 * config.js — Configuración central del dominio y del motor.
 *
 * Centraliza los "números mágicos" (horizontes temporales, parámetros de
 * insulina, rangos glucémicos, metas institucionales) y la paleta semántica.
 * Todo lo demás importa desde aquí, de modo que ajustar un umbral se hace en
 * un único lugar.
 */

export const CONFIG = Object.freeze({
  sim: {
    historicoMin: 240,     // 4 h de histórico previo al evento
    prediccionMin: 360,    // 6 h de horizonte predictivo
    pasoMin: 5,            // resolución temporal (min por punto)
    horaInicioSesion: 8,   // t=0 corresponde a las 08:00
    insulina: { onsetMin: 15, picoMin: 75, duracionMin: 240 },
  },
  // Modelo fisiológico compartimental (tipo UVA/Padova reducido), resuelto por
  // integración numérica RK4. Las ganancias kM/kI se auto-calibran por paciente
  // a partir de sus parámetros clínicos (CR, ISF), no se fijan aquí.
  modelo: {
    dtMin: 1,              // paso interno de integración (min)
    p1: 0.025,            // efectividad de la glucosa: auto-regulación hacia el basal (1/min)
    p2: 0.030,            // recambio de la acción insulínica remota (1/min)
    tauInsulinaMin: 50,   // constante de tiempo de absorción/acción de insulina SC (min)
    choRef: 50,           // ingesta de referencia (g) para calibrar la ganancia de comida
    insulinaRef: 5,       // bolo de referencia (U) para calibrar la ganancia de insulina
  },
  rangos: { hipoSevera: 54, hipo: 70, hiper: 180, hiperSevera: 250 },
  metas: { tirVerde: 80, tirAmbar: 60, tbrMax: 4 },
  ohio: { seed: 559, horaInicio: 6, duracionMin: 475 },
  glucemia: { min: 30, max: 400 },
});

// Paleta semántica glucémica del proyecto.
export const COLORES = Object.freeze({
  euglucemia: '#34d399', // rango 70–180
  hiper: '#fbbf24',      // > 180
  hipo: '#f43f5e',       // < 70
  neutral: '#38bdf8',    // histórico / UI
  bandaFill: 'rgba(125,211,252,0.10)',
  interp: '#a78bfa',     // interpolación lineal
});

// Índice del instante del evento (t=0) dentro de la línea temporal maestra.
export const PUNTOS_HISTORICO = CONFIG.sim.historicoMin / CONFIG.sim.pasoMin; // 48
