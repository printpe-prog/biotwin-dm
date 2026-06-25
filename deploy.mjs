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

// curl soporta FTPS explícito (--ssl) y está disponible en Windows 10/11
const cmd = `curl --ssl --ftp-create-dirs -u "${USER}:${PASS}" -T "${ARCHIVO}" "ftp://${HOST}/${ARCHIVO}" --progress-bar`;

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\n✓ Deploy exitoso: ${ARCHIVO} → ftp://${HOST}/${ARCHIVO}`);
  console.log(`  Producción: http://${HOST.replace('ftp.', '')}/`);
} catch {
  console.error('\n❌  Error durante el upload FTP. Verifica credenciales y conectividad.');
  process.exit(1);
}
