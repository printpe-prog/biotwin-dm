"""
build.py — Genera el build portable de un solo archivo.

Toma la versión modular (index.html + css/ + js/) y produce
`BioTwin_DM_Prototype_v1.html`, un único .html autocontenido que se abre con
doble clic. Así el monolito nunca diverge de la fuente modular: tras cualquier
cambio, basta con ejecutar este script.

Estrategia: elimina las sentencias `import`/`export` de cada módulo, los
concatena en orden de dependencias dentro de un IIFE, e incrusta el CSS.

Uso:
    python build.py                 # escribe BioTwin_DM_Prototype_v1.html
    python build.py otra_salida.html

Solo usa la biblioteca estándar: el proyecto ya requiere Python para el
backend, de modo que no hace falta una segunda cadena de herramientas.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
SALIDA = "BioTwin_DM_Prototype_v1.html"

# Orden topológico: módulos hoja primero, orquestador (main) al final.
MODULOS = [
    "js/config.js", "js/state.js", "js/core/random.js", "js/core/tiempo.js",
    "js/data/pacientes.js", "js/engine/simulador.js", "js/pipeline/ohio.js",
    "js/ui/dom.js", "js/ui/kpis.js", "js/ui/consola.js", "js/ui/grafico.js",
    "js/ui/modal.js", "js/ui/formularioPaciente.js", "js/api.js", "js/main.js",
]

_RE_IMPORT = re.compile(
    r"^[ \t\r\n]*import\b.*?from[ \t\r\n]*['\"][^'\"]+['\"];?[^\n]*\n",
    re.MULTILINE | re.DOTALL,
)
_RE_EXPORT = re.compile(r"^([ \t]*)export[ \t]+", re.MULTILINE)


def despojar(src: str) -> str:
    """Elimina las sentencias import (incluso multilínea) y el prefijo `export `."""
    return _RE_EXPORT.sub(r"\1", _RE_IMPORT.sub("", src))


def construir() -> str:
    bloques = [
        f"\n/* ===== {rel} ===== */\n" + despojar((RAIZ / rel).read_text(encoding="utf-8")).strip() + "\n"
        for rel in MODULOS
    ]
    bundle = "\n".join(bloques)

    css = (RAIZ / "css/styles.css").read_text(encoding="utf-8").strip()
    html = (RAIZ / "index.html").read_text(encoding="utf-8")

    # Incrusta el CSS en lugar del <link>
    html, n_css = re.subn(
        r'^[ \t]*<link rel="stylesheet" href="css/styles\.css" />[ \t]*\r?$',
        lambda _: f"  <style>\n{css}\n  </style>",
        html,
        count=1,
        flags=re.MULTILINE,
    )
    if n_css != 1:
        raise SystemExit("No se encontró el <link> de css/styles.css en index.html")

    # Reemplaza el módulo de entrada por el bundle dentro de un IIFE
    script_inline = (
        "  <!-- Build autogenerado por build.py a partir de los módulos ES. NO editar a mano. -->\n"
        "  <script>\n  (function () {\n  'use strict';\n"
        f"{bundle}\n  }})();\n  </script>"
    )
    html, n_js = re.subn(
        r'^[ \t]*<script type="module" src="js/main\.js"></script>[ \t]*\r?$',
        lambda _: script_inline,
        html,
        count=1,
        flags=re.MULTILINE,
    )
    if n_js != 1:
        raise SystemExit("No se encontró el <script type=\"module\"> de js/main.js en index.html")

    return html


def main() -> None:
    destino = RAIZ / (sys.argv[1] if len(sys.argv) > 1 else SALIDA)
    # Se escribe con CRLF para conservar el estilo de línea del repositorio.
    destino.write_text(construir(), encoding="utf-8", newline="\r\n")
    print(f"OK Generado {destino.name} ({len(MODULOS)} modulos + CSS incrustados).")


if __name__ == "__main__":
    main()
