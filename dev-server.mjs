/**
 * dev-server.mjs — Servidor estático mínimo, sin dependencias, para desarrollo.
 *
 * Los módulos ES no se cargan desde file:// (política CORS del navegador), así
 * que se necesita servir el proyecto por HTTP. Este servidor cubre justo eso.
 *
 * Uso:
 *   node dev-server.mjs            (sirve la carpeta actual en el puerto 8000)
 *   node dev-server.mjs ./ 3000    (carpeta y puerto personalizados)
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] || process.cwd());
const PORT = Number(process.argv[3] || 8000);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

const servidor = http.createServer(async (req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  const archivo = normalize(join(ROOT, ruta));

  // Evita el path traversal fuera de la raíz servida
  if (!archivo.startsWith(ROOT)) {
    res.writeHead(403); res.end('403 Forbidden'); return;
  }
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo).toLowerCase()] || 'application/octet-stream' });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + ruta);
  }
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`✗ El puerto ${PORT} ya está en uso. Probá: node dev-server.mjs ./ ${PORT + 1}`);
  } else {
    console.error('✗ Error del servidor:', e.message);
  }
  process.exit(1);
});

servidor.listen(PORT, () => {
  console.log(`BioTwin-DM dev server activo → http://localhost:${PORT}/`);
  console.log(`Sirviendo: ${ROOT}`);
});
