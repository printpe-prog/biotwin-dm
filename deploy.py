"""
deploy.py — Sube el build de producción al servidor FTP vía FTPS explícito.

Uso (PowerShell):
    $env:FTP_USER = "<usuario>"; $env:FTP_PASS = "<contraseña>"; python deploy.py

Uso (bash):
    FTP_USER=<usuario> FTP_PASS=<contraseña> python deploy.py

Ni el usuario ni la contraseña se escriben en este archivo: se leen de las
variables de entorno FTP_USER y FTP_PASS, y la contraseña se entrega directamente
a la conexión FTPS. Así no viaja en la línea de comandos, por lo que no queda
visible en la lista de procesos ni en el historial del shell.

Solo usa la biblioteca estándar (`ftplib`), de modo que no hace falta curl ni
una segunda cadena de herramientas.
"""

from __future__ import annotations

import os
import sys
from ftplib import FTP_TLS, all_errors
from pathlib import Path

# Credenciales y host por variable de entorno: este repositorio es publico,
# de modo que ni el usuario ni la contrasena quedan versionados.
HOST = os.environ.get("FTP_HOST", "ftp.hostlan.cl")
USUARIO = os.environ.get("FTP_USER")
ARCHIVO = "BioTwin_DM_Prototype_v1.html"
RUTA_SERVIDOR = "public_html/biotwin/index.html"  # ruta pública en el servidor

RAIZ = Path(__file__).resolve().parent


def _asegurar_directorio(ftp: FTP_TLS, carpetas: list[str]) -> None:
    """Entra en cada carpeta de la ruta, creándola si no existe."""
    for carpeta in carpetas:
        try:
            ftp.cwd(carpeta)
        except all_errors:
            ftp.mkd(carpeta)
            ftp.cwd(carpeta)


def main() -> None:
    clave = os.environ.get("FTP_PASS")
    if not USUARIO or not clave:
        sys.exit(
            "Faltan las credenciales FTP.\n"
            "  PowerShell: $env:FTP_USER = \"<usuario>\"; $env:FTP_PASS = \"<contrasena>\"; python deploy.py\n"
            "  bash:       FTP_USER=<usuario> FTP_PASS=<contrasena> python deploy.py"
        )

    local = RAIZ / ARCHIVO
    if not local.is_file():
        sys.exit(f"No existe {ARCHIVO}. Ejecuta primero: python build.py")

    *carpetas, remoto = RUTA_SERVIDOR.split("/")
    tam = local.stat().st_size
    print(f"-> Conectando a {HOST} como {USUARIO}...")

    try:
        with FTP_TLS(HOST) as ftp:
            ftp.login(USUARIO, clave)
            ftp.prot_p()  # cifra tambien el canal de datos, no solo el de control
            _asegurar_directorio(ftp, carpetas)
            with local.open("rb") as f:
                ftp.storbinary(f"STOR {remoto}", f)
    except all_errors as e:
        sys.exit(f"Error durante el upload FTP: {e}\nVerifica credenciales y conectividad.")

    print(f"OK {ARCHIVO} ({tam:,} bytes) -> ftp://{HOST}/{RUTA_SERVIDOR}")
    print(f"   Produccion: http://{HOST.removeprefix('ftp.')}/biotwin/")


if __name__ == "__main__":
    main()
