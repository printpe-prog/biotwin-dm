/**
 * data/pacientes.js — Capa de persistencia (Módulo 1): modelo de datos.
 *
 * Define las entidades del modelo relacional como objetos estructurados:
 * PacienteVirtual (4 perfiles contrastantes) y SesionSimulacion. La entidad
 * RegistroGlucemico se construye dinámicamente durante la simulación y se
 * guarda en `estado.registroGlucemico`.
 */

/** Entidad PacienteVirtual: 4 perfiles contrastantes y realistas. */
export const PACIENTES = [
  {
    id: 'anon-p04-unab',
    alias: 'Paciente #04 — Adulto / Alta Sensibilidad',
    tipo: 'adulto',
    seed: 4041,
    parametros: { CR: 12, ISF: 55, TDD: 38, glucosaBasal: 112, pico_absorcion_cho: 45, variabilidad: 0.08 },
    perfil_clinico: 'Adulto de 34 años, 72 kg. Alta sensibilidad insulínica. Absorción de CHO moderada. Riesgo hipoglicémico elevado con dosis > 8U.',
    umbral_hipoglicemia_critica: 8,
  },
  {
    id: 'anon-p07-unab',
    alias: 'Paciente #07 — Adulto / Resistencia Insulínica',
    tipo: 'adulto',
    seed: 7072,
    parametros: { CR: 6, ISF: 25, TDD: 72, glucosaBasal: 148, pico_absorcion_cho: 60, variabilidad: 0.06 },
    perfil_clinico: 'Adulto de 51 años, 94 kg. Baja sensibilidad insulínica (resistencia). Requiere dosis elevadas. Absorción de CHO lenta. Umbral de seguridad alto.',
    umbral_hipoglicemia_critica: 18,
  },
  {
    id: 'anon-p02-unab',
    alias: 'Paciente #02 — Niño / Alta Variabilidad',
    tipo: 'pediatrico',
    seed: 2025,
    parametros: { CR: 18, ISF: 80, TDD: 22, glucosaBasal: 124, pico_absorcion_cho: 35, variabilidad: 0.16 },
    perfil_clinico: 'Paciente pediátrico de 9 años, 31 kg. Muy alta sensibilidad y variabilidad glucémica. Absorción de CHO rápida. Riesgo hipoglicémico crítico con dosis > 5U.',
    umbral_hipoglicemia_critica: 5,
  },
  {
    id: 'anon-p05-unab',
    alias: 'Paciente #05 — Adolescente / Patrón Nocturno Alterado',
    tipo: 'adolescente',
    seed: 5058,
    parametros: { CR: 10, ISF: 45, TDD: 54, glucosaBasal: 135, pico_absorcion_cho: 50, variabilidad: 0.12 },
    perfil_clinico: 'Adolescente de 16 años, 63 kg. Fenómeno del alba marcado y variabilidad nocturna elevada. Sensibilidad moderada. Requiere ajuste basal vespertino.',
    umbral_hipoglicemia_critica: 11,
  },
];

/** Entidad SesionSimulacion (instancia activa). */
export const sesionActiva = {
  id_sesion: 'SIM-2026-001',
  fk_paciente: null,
  fecha_inicio: '2026-06-12T08:00:00Z',
  horizonte_horas: 24,
  estado: 'inactiva',
};

/** Tasa basal estimada (U/h) ≈ 50% de la dosis total diaria repartida en 24 h. */
export function tasaBasal(perfil) {
  return +((perfil.parametros.TDD * 0.5) / 24).toFixed(2);
}

/* =========================================================================
 * PACIENTES PERSONALIZADOS (creados desde la UI, persistidos en localStorage)
 * ========================================================================= */

const STORAGE_KEY = 'biotwin:pacientes:v1';

function _leerStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function _guardarStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(PACIENTES.filter((p) => p.custom)));
  } catch { /* almacenamiento no disponible: se mantienen solo en memoria */ }
}

// Semilla determinista derivada del id (FNV-1a). Evita usar Math.random.
function _hashSemilla(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

/** Carga los pacientes personalizados guardados y los anexa a PACIENTES. */
export function cargarPacientesGuardados() {
  let n = 0;
  for (const p of _leerStorage()) {
    if (!PACIENTES.some((x) => x.id === p.id)) { PACIENTES.push(p); n++; }
  }
  return n;
}

/**
 * Crea un PacienteVirtual desde los datos del formulario, lo agrega a PACIENTES
 * y lo persiste. Devuelve el índice del nuevo paciente dentro de PACIENTES.
 */
export function agregarPaciente(datos) {
  const id = 'anon-c' + Date.now().toString(36);
  const nuevo = {
    id,
    alias: datos.alias,
    tipo: datos.tipo,
    seed: _hashSemilla(id + datos.alias),
    parametros: {
      CR: datos.CR, ISF: datos.ISF, TDD: datos.TDD,
      glucosaBasal: datos.glucosaBasal,
      pico_absorcion_cho: datos.pico_absorcion_cho,
      variabilidad: datos.variabilidad,
    },
    perfil_clinico: datos.perfil_clinico || 'Paciente personalizado.',
    umbral_hipoglicemia_critica: datos.umbral_hipoglicemia_critica,
    custom: true,
  };
  PACIENTES.push(nuevo);
  _guardarStorage();
  return PACIENTES.length - 1;
}

/**
 * Actualiza los datos de un paciente personalizado existente (manteniendo su id
 * y seed) y persiste el cambio. Devuelve el índice del paciente en PACIENTES, o
 * -1 si no existe o no es personalizado.
 */
export function editarPaciente(id, datos) {
  const idx = PACIENTES.findIndex((p) => p.id === id);
  if (idx === -1 || !PACIENTES[idx].custom) return -1;
  const p = PACIENTES[idx];
  p.alias = datos.alias;
  p.tipo = datos.tipo;
  p.parametros = {
    CR: datos.CR, ISF: datos.ISF, TDD: datos.TDD,
    glucosaBasal: datos.glucosaBasal,
    pico_absorcion_cho: datos.pico_absorcion_cho,
    variabilidad: datos.variabilidad,
  };
  p.perfil_clinico = datos.perfil_clinico || 'Paciente personalizado.';
  p.umbral_hipoglicemia_critica = datos.umbral_hipoglicemia_critica;
  _guardarStorage();
  return idx;
}

/** Elimina un paciente personalizado por id. Devuelve true si se eliminó. */
export function eliminarPaciente(id) {
  const idx = PACIENTES.findIndex((p) => p.id === id);
  if (idx === -1 || !PACIENTES[idx].custom) return false;
  PACIENTES.splice(idx, 1);
  _guardarStorage();
  return true;
}
