"""
rl/entorno.py — Entorno Gymnasium sobre simglucose para el agente RL.

Envuelve el simulador fisiológico T1DSimEnv (UVA/Padova) en una interfaz
Gymnasium compatible con Stable-Baselines3. Modela un control closed-loop
HÍBRIDO realista (estándar clínico): el agente recibe el anuncio de la comida y
la tendencia glucémica, y entrega insulina (bolo + modulación basal). La
recompensa está orientada al Time In Range (OE2: 70–180 mg/dL > 80 %).

El constructor de observación `construir_obs` se comparte con el motor de
inferencia para garantizar consistencia entrenamiento↔producción.
"""

from __future__ import annotations

from datetime import datetime

import gymnasium as gym
import numpy as np
from gymnasium import spaces
from simglucose.actuator.pump import InsulinPump
from simglucose.controller.base import Action
from simglucose.patient.t1dpatient import T1DPatient
from simglucose.sensor.cgm import CGMSensor
from simglucose.simulation.env import T1DSimEnv
from simglucose.simulation.scenario import CustomScenario

OBJETIVO = 140.0
# La modulación basal del RL llega hasta 2× la basal nominal, de modo que la
# acción 0.5 (centro natural donde PPO inicia la exploración) corresponde EXACTO
# a la basal nominal —la política que de por sí logra ~87 % TIR—. El agente parte
# así cerca del óptimo y solo afina, en vez de tener que descubrirlo desde un
# extremo del rango de acción.
MAX_FACTOR_BASAL = 2.0


def insulina_max_paso(tdd: float) -> float:
    """Insulina discrecional máxima por paso (U). ~10 % de la dosis diaria."""
    return max(2.0, 0.10 * tdd)


def construir_obs(
    cgm: float, tendencia: float, tasa_basal: float, max_rate: float, comida_g: float
) -> np.ndarray:
    """Vector de estado normalizado de 5 dimensiones."""
    return np.array(
        [
            cgm / 400.0,                                  # nivel glucémico
            (cgm - OBJETIVO) / 200.0,                     # error respecto al objetivo
            float(np.clip(tendencia / 5.0, -1.0, 1.0)),   # tendencia (mg/dL/min)
            min(tasa_basal / (max_rate + 1e-9), 1.0),     # tasa basal previa (modulación)
            min(comida_g / 100.0, 1.0),                   # anuncio de comida
        ],
        dtype=np.float32,
    )


def _riesgo_magni(bg: float) -> float:
    """
    Índice de riesgo de Magni et al. (2007), estándar en control glucémico.
    Es ~0 cerca de 112 mg/dL y crece de forma asimétrica hacia hipo e hiper,
    penalizando progresivamente ambas desviaciones (a diferencia de un umbral
    plano, motiva al agente a corregir la hiperglicemia en vez de tolerarla).
    """
    bg = max(bg, 1.0)
    f = 3.5506 * (np.log(bg) ** 0.8353 - 3.7932)
    return 10.0 * f * f


def recompensa_tir(bg: float) -> float:
    """
    Recompensa por paso: −riesgo de Magni + bonus por Time In Range que escala con
    la cercanía al objetivo (premia control estricto en torno a 140, no solo estar
    dentro de 70–180), penalizando además las excursiones extremas.
    """
    r = -_riesgo_magni(bg) / 100.0
    if 70.0 <= bg <= 180.0:
        r += 1.0 - 0.6 * abs(bg - OBJETIVO) / 70.0   # +1.0 en el objetivo, ~+0.4 en los bordes
    if bg < 54.0 or bg > 250.0:
        r -= 1.0
    return r


class EntornoGlucosa(gym.Env):
    """Entorno de control glucémico de 24 h virtuales con comidas anunciadas."""

    metadata = {"render_modes": []}

    def __init__(
        self,
        patient_name: str = "adult#001",
        horizonte_horas: int = 24,
        seed: int | None = None,
        reward_fun=recompensa_tir,
    ) -> None:
        super().__init__()
        self.patient_name = patient_name
        self.horizonte_horas = horizonte_horas
        self.reward_fun = reward_fun

        from app.engine.pacientes import basal_estacionario, obtener_perfil
        self.basal = basal_estacionario(patient_name)
        perfil = obtener_perfil(patient_name)
        self.tdd = perfil["parametros"]["TDD"]
        self.CR = perfil["parametros"]["CR"]          # calculadora de bolo de comida
        self.max_rate = self.basal * MAX_FACTOR_BASAL  # tope de la modulación basal
        self._rng = np.random.default_rng(seed)

        self.action_space = spaces.Box(low=0.0, high=1.0, shape=(1,), dtype=np.float32)
        self.observation_space = spaces.Box(
            low=np.array([0.0, -2.0, -1.0, 0.0, 0.0], dtype=np.float32),
            high=np.array([1.5, 2.0, 1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )

        sensor = CGMSensor.withName("Dexcom", seed=(seed or 1))
        self.sample_time = int(sensor.sample_time)
        self.max_steps = int(self.horizonte_horas * 60 / self.sample_time)
        self._seed = seed

    def _generar_comidas(self) -> dict[int, float]:
        """Tres comidas (desayuno, almuerzo, cena) con CHO y horario aleatorios."""
        comidas: dict[int, float] = {}
        for base_h, cmin, cmax in [(7, 40, 80), (13, 50, 95), (19, 40, 85)]:
            minuto = base_h * 60 + int(self._rng.integers(-60, 60))
            minuto = (minuto // self.sample_time) * self.sample_time
            comidas[minuto] = float(self._rng.integers(cmin, cmax))
        return comidas

    def _construir_env(self) -> None:
        patient = T1DPatient.withName(self.patient_name)
        sensor = CGMSensor.withName("Dexcom", seed=(self._seed or 1))
        pump = InsulinPump.withName("Insulet")
        start = datetime(2026, 1, 1, 0, 0, 0)
        escenario = [(m / 60.0, cho) for m, cho in self.comidas.items()]
        scenario = CustomScenario(start_time=start, scenario=escenario)
        self.env = T1DSimEnv(patient, sensor, pump, scenario)

    def _comida_en(self, paso: int) -> float:
        return self.comidas.get(paso * self.sample_time, 0.0)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if seed is not None:
            self._rng = np.random.default_rng(seed)
        self.comidas = self._generar_comidas()
        self._construir_env()
        self.env.reset()
        self._paso = 0
        self._tasa_basal = self.basal
        obs, _, _, info = self.env.step(Action(basal=self.basal, bolus=0))
        self._cgm = float(obs.CGM)
        self._cgm_prev = self._cgm
        comida = self._comida_en(self._paso)
        return construir_obs(self._cgm, 0.0, self.basal, self.max_rate, comida), {}

    def step(self, action):
        # Bolo de comida AUTOMÁTICO (calculadora CR, estándar de cuidado): cubre
        # la ingesta anunciada en este paso. El RL solo modula la basal.
        minuto = self._paso * self.sample_time
        comida_g = self.comidas.get(minuto, 0.0)
        bolo_comida = (comida_g / self.CR) if comida_g > 0 else 0.0

        # Acción del agente: factor de modulación de la basal (0–4×).
        tasa = float(np.clip(action[0], 0.0, 1.0)) * self.max_rate
        obs, _, done, info = self.env.step(
            Action(basal=tasa, bolus=bolo_comida / self.sample_time)
        )
        self._cgm_prev = self._cgm
        self._cgm = float(obs.CGM)
        self._tasa_basal = tasa
        self._paso += 1

        bg = float(info["bg"])
        recompensa = self.reward_fun(bg)
        truncado = self._paso >= self.max_steps
        terminado = bool(done) or bg < 20 or bg > 600
        tendencia = (self._cgm - self._cgm_prev) / self.sample_time
        comida_sig = self._comida_en(self._paso)
        observacion = construir_obs(self._cgm, tendencia, self._tasa_basal, self.max_rate, comida_sig)
        return observacion, recompensa, terminado, truncado, {"bg": bg, "cgm": self._cgm}
