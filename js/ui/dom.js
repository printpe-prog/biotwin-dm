/**
 * ui/dom.js — Cache de referencias DOM.
 *
 * Resuelve los elementos una sola vez en el arranque, en lugar de repetir
 * document.getElementById por toda la aplicación.
 */

export const DOM = {};

export function cacheDOM() {
  const ids = [
    'estadoDot', 'estadoConexion',
    'selectorPacientes', 'btnNuevoPaciente', 'perfilClinico', 'perfilParametros', 'valCHO', 'valInsulina',
    'inputCHO', 'inputInsulina', 'btnSimular', 'badgeRL', 'toggleRL', 'btnOhio',
    'pipelineStatus', 'graficoPrincipal', 'badgeModo', 'btnEjeDetalle', 'btnEjeHora',
    'tirValor', 'tirBarra', 'tirBadge',
    'tbrValor', 'tbrBarra', 'rmseValor', 'rmseBadge', 'rmseSubtext', 'decisionTexto',
    'opsCounter', 'btnLimpiarLogs', 'terminal',
    'modalFallback', 'modalDosis', 'modalUmbral', 'btnCerrarModal',
    'modalPaciente', 'formPaciente', 'formPacienteError', 'modalPacienteTitulo', 'btnGuardarPaciente',
  ];
  ids.forEach((id) => { DOM[id] = document.getElementById(id); });
  DOM.modalCard = DOM.modalFallback.querySelector('.modal-card');
}
