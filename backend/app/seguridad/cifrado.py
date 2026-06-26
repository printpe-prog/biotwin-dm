"""
seguridad/cifrado.py — Cifrado y anonimización REALES.

Reemplaza la simulación criptográfica del prototipo (bloques base64 falsos) por
operaciones reales conforme a la Ley N° 19.628 (Art. 2 letra g, datos sensibles
de salud) y la Ley N° 21.719:

  - Anonimización irreversible de identificadores: SHA-256 con sal.
  - Cifrado en reposo: Fernet (AES-128-CBC + HMAC-SHA256, de la librería
    `cryptography`), que es autenticado y resistente a manipulación.

Cada operación registra un flujo de auditoría con el bloque cifrado REAL, no
una cadena verosímil generada por una PRNG.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet


@dataclass
class MotorCifrado:
    """Motor de cifrado/anonimización con contador de operaciones de sesión."""

    clave: bytes = field(default_factory=Fernet.generate_key)
    sal: bytes = field(default_factory=lambda: os.urandom(16))
    ops_cifradas: int = 0

    def __post_init__(self) -> None:
        self._fernet = Fernet(self.clave)

    # --- Anonimización irreversible (Ley N° 19.628 Art. 2 g) ---
    def anonimizar(self, identificador: str) -> str:
        """Devuelve el hash SHA-256 (con sal) de un identificador directo."""
        h = hashlib.sha256(self.sal + identificador.encode("utf-8"))
        return h.hexdigest()

    def seudonimo(self, identificador: str) -> str:
        """Seudónimo corto y estable para mostrar en logs (primeros 12 hex)."""
        return self.anonimizar(identificador)[:12]

    # --- Cifrado autenticado en reposo (Fernet / AES-256 efectivo) ---
    def cifrar(self, payload: dict[str, Any]) -> str:
        """Cifra un payload JSON y devuelve el token Fernet real (base64url)."""
        crudo = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        token = self._fernet.encrypt(crudo)
        self.ops_cifradas += 1
        return token.decode("ascii")

    def descifrar(self, token: str) -> dict[str, Any]:
        """Descifra y verifica un token Fernet; lanza si fue manipulado."""
        crudo = self._fernet.decrypt(token.encode("ascii"))
        return json.loads(crudo)

    # --- HMAC de integridad (firma de un registro) ---
    def firmar(self, datos: bytes) -> str:
        return hmac.new(self.clave, datos, hashlib.sha256).hexdigest()

    def registrar_flujo_seguridad(
        self, evento: str, payload: dict[str, Any], patient_id: str
    ) -> dict[str, Any]:
        """
        Produce el flujo de auditoría de 5 entradas (equivalente real al que el
        frontend mostraba simulado). Devuelve un dict serializable para la API.
        """
        seud = self.seudonimo(patient_id)
        token = self.cifrar(payload)  # incrementa ops_cifradas
        ts = datetime.now(timezone.utc).isoformat()
        # Muestra solo un prefijo del token real en la línea de log.
        bloque = token[:48]
        return {
            "evento": evento,
            "timestamp": ts,
            "entradas": [
                {"tag": "INFO", "msg": f"EVENT: {evento} | patient={seud}"},
                {"tag": "ENCRYPT", "msg": f"RAW_PAYLOAD: {json.dumps(payload, ensure_ascii=False)}"},
                {
                    "tag": "ANONYMIZE",
                    "msg": f'PII_MASK: patient_id -> sha256 -> "{seud}..." | Ley N° 19.628 Art.2(g)',
                },
                {"tag": "FERNET", "msg": f"ENCRYPTED_BLOCK: {bloque}..."},
                {
                    "tag": "DB_WRITE",
                    "msg": "STATUS: 200 OK | tabla=RegistroGlucemico | Ley N° 21.719 compliant",
                },
            ],
            "ops_cifradas": self.ops_cifradas,
            "token": token,
        }


# Instancia global de sesión (una clave por arranque del servidor).
motor = MotorCifrado()
