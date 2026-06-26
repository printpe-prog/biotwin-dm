"""
rl/controlador_pid.py — Controlador PID clínico (línea base).

Implementa el "Controlador Heurístico PID Clásico" que el informe define como
línea base comparativa y plan de contingencia (matriz de riesgos: si el agente
RL no converge, se usa este controlador). Modula la infusión de insulina basal
en función del error glucémico respecto de un objetivo.

Restricciones de seguridad: la insulina nunca es negativa (no se puede "retirar"
insulina ya administrada) y la tasa se satura a un múltiplo del basal.
"""

from __future__ import annotations


class ControladorPID:
    def __init__(
        self,
        basal: float,
        objetivo: float = 140.0,
        kp: float = 3.0e-4,
        ki: float = 1.0e-6,
        kd: float = 5.0e-4,
        max_factor: float = 8.0,
    ) -> None:
        self.basal = basal
        self.objetivo = objetivo
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self.max_rate = basal * max_factor
        self.reset()

    def reset(self) -> None:
        self._integral = 0.0
        self._error_prev = 0.0

    def step(self, glucosa: float, dt_min: float) -> float:
        """Devuelve la tasa de insulina (U/min) para este paso, basal + corrección."""
        error = glucosa - self.objetivo  # > 0 si hay hiperglicemia → más insulina

        # Anti-windup: solo integra cuando hay hiperglicemia.
        if error > 0:
            self._integral += error * dt_min
        else:
            self._integral *= 0.9  # descarga suave del integrador

        deriv = (error - self._error_prev) / dt_min if dt_min else 0.0
        self._error_prev = error

        correccion = self.kp * error + self.ki * self._integral + self.kd * deriv
        tasa = self.basal + max(0.0, correccion)
        return min(max(tasa, 0.0), self.max_rate)
