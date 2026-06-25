/**
 * build.mjs — Genera el build portable de un solo archivo.
 *
 * Toma la versión modular (index.html + css/ + js/) y produce
 * `BioTwin_DM_Prototype_v1.html`, un único .html autocontenido que se abre con
 * doble clic. Así el monolito nunca diverge de la fuente modular: tras cualquier
 * cambio, basta con ejecutar `node build.mjs`.
 *
 * Estrategia: elimina las sentencias `import`/`export` de cada módulo, los
 * concatena en orden de dependencias dentro de un IIFE, e incrusta el CSS.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const SALIDA = 'BioTwin_DM_Prototype_v1.html';

// Orden topológico: módulos hoja primero, orquestador (main) al final.
const MODULOS = [
  'js/config.js', 'js/state.js', 'js/core/random.js', 'js/core/tiempo.js',
  'js/data/pacientes.js', 'js/engine/simulador.js', 'js/pipeline/ohio.js',
  'js/ui/dom.js', 'js/ui/kpis.js', 'js/ui/consola.js', 'js/ui/grafico.js',
  'js/ui/modal.js', 'js/ui/formularioPaciente.js', 'js/main.js',
];

/** Elimina las sentencias import (incluso multilínea) y el prefijo `export `. */
function despojar(src) {
  return src
    .replace(/^\s*import\b[\s\S]*?from\s*['"][^'"]+['"];?[^\n]*\n/gm, '')
    .replace(/^(\s*)export\s+/gm, '$1');
}

const bloques = [];
for (const rel of MODULOS) {
  const src = await readFile(join(ROOT, rel), 'utf8');
  bloques.push(`\n/* ===== ${rel} ===== */\n` + despojar(src).trim() + '\n');
}

const bundle = bloques.join('\n');
const css = (await readFile(join(ROOT, 'css/styles.css'), 'utf8')).trim();
let html = await readFile(join(ROOT, 'index.html'), 'utf8');

// Incrusta el CSS en lugar del <link>
html = html.replace(
  /^[ \t]*<link rel="stylesheet" href="css\/styles\.css" \/>\s*$/m,
  `  <style>\n${css}\n  </style>`,
);

// Reemplaza el módulo de entrada por el bundle dentro de un IIFE
const scriptInline =
  `  <!-- Build autogenerado por build.mjs a partir de los módulos ES. NO editar a mano. -->\n` +
  `  <script>\n  (function () {\n  'use strict';\n${bundle}\n  })();\n  </script>`;
html = html.replace(
  /^[ \t]*<script type="module" src="js\/main\.js"><\/script>\s*$/m,
  scriptInline,
);

await writeFile(join(ROOT, SALIDA), html, 'utf8');
console.log(`✓ Generado ${SALIDA} (${MODULOS.length} módulos + CSS incrustados).`);
