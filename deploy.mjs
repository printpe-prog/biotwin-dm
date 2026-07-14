/**
 * deploy.mjs — Sube el build de producción al servidor FTP via FTPS explícito.
 *
 * Uso:
 *   FTP_PASS=tupassword node deploy.mjs
 *
 * Requiere Node 18+. Usa el módulo nativo `node:net` + TLS para FTPS explícito.
 * La contraseña NUNCA se hardcodea aquí — siempre via variable de entorno FTP_PASS.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const HOST = 'ftp.hostlan.cl';
const PORT = 21;
const USER = 'biotwin@hostlan.cl';
const PASS = process.env.FTP_PASS;
const ARCHIVO = 'BioTwin_DM_Prototype_v1.html';
const RUTA_SERVIDOR = 'public_html/biotwin/index.html'; // ruta pública en el servidor

if (!PASS) {
  console.error('❌  Falta la contraseña FTP.');
  console.error('    Uso: FTP_PASS=tupassword node deploy.mjs');
  process.exit(1);
}

// Verifica que el monolito existe y está actualizado
try {
  await readFile(join(process.cwd(), ARCHIVO));
} catch {
  console.error(`❌  No existe ${ARCHIVO}. Ejecuta primero: node build.mjs`);
  process.exit(1);
}

console.log(`\n→ Conectando a ${HOST}:${PORT} como ${USER}...`);

// La contraseña NO se pasa como argumento de la línea de comandos (quedaría
// visible en el listado de procesos y en el historial del shell). En su lugar
// se entrega a curl por stdin mediante `--config -`. Valores citados: se escapan
// backslash y comillas conforme al formato del archivo de configuración de curl.
const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const configCurl = [
  'ssl',
  'ftp-create-dirs',
  `user "${esc(USER)}:${esc(PASS)}"`,
  `upload-file "${esc(ARCHIVO)}"`,
  `url "ftp://${esc(HOST)}/${esc(RUTA_SERVIDOR)}"`,
].join('\n');

try {
  execSync('curl --config - --progress-bar', {
    input: configCurl,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`\n✓ Deploy exitoso: ${ARCHIVO} → ftp://${HOST}/${RUTA_SERVIDOR}`);
  console.log(`  Producción: http://${HOST.replace('ftp.', '')}/biotwin/`);
} catch {
  console.error('\n❌  Error durante el upload FTP. Verifica credenciales y conectividad.');
  process.exit(1);
}
