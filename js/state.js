/**
 * state.js — Estado mutable de la aplicación, centralizado.
 *
 * Patrón idiomático para compartir estado entre módulos ES: se exporta un
 * único objeto y los módulos mutan sus propiedades (no se puede reasignar un
 * binding importado, pero sí mutar el objeto al que apunta). Así se evitan
 * dependencias circulares entre la orquestación y las capas de UI.
 */

export const estado = {
  perfilActual: null,       // PacienteVirtual cargado
  rlActivo: true,           // política de control activa (RL vs PID)
  opsCifradas: 0,           // contador total de operaciones cifradas en la sesión
  simPendiente: null,       // parámetros en espera tras una alerta de fallback
  registroGlucemico: [],    // último vector RegistroGlucemico generado
  curvaActual: { valores: [], ultimo: null }, // serie glucémica visible (para las métricas)
};
