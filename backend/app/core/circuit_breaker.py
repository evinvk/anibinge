"""
Simple circuit breaker for upstream API calls.

States:
  CLOSED  — normal operation, requests pass through
  OPEN    — too many failures, requests fast-fail without calling upstream
  HALF_OPEN — probe: allow one request through to test recovery

Usage:
    breaker = CircuitBreaker("jikan", failure_threshold=5, recovery_timeout=30)

    async def call():
        async with breaker:
            return await jikan_client._get(...)
"""
from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable

from fastapi import HTTPException
import logging

logger = logging.getLogger("anibinge.circuit_breaker")


class State(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_max: int = 1
    _state: State = field(default=State.CLOSED, repr=False)
    _failure_count: int = field(default=0, repr=False)
    _success_count: int = field(default=0, repr=False)
    _last_failure_time: float = field(default=0.0, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    @property
    def state(self) -> State:
        if self._state == State.OPEN:
            if time.monotonic() - self._last_failure_time >= self.recovery_timeout:
                self._state = State.HALF_OPEN
                self._success_count = 0
                logger.info("circuit_breaker:%s OPEN -> HALF_OPEN", self.name)
        return self._state

    def _on_success(self) -> None:
        if self._state == State.HALF_OPEN:
            self._success_count += 1
            if self._success_count >= self.half_open_max:
                self._state = State.CLOSED
                self._failure_count = 0
                logger.info("circuit_breaker:%s HALF_OPEN -> CLOSED", self.name)
        elif self._state == State.CLOSED:
            self._failure_count = 0

    def _on_failure(self) -> None:
        if self._state == State.HALF_OPEN:
            self._state = State.OPEN
            self._last_failure_time = time.monotonic()
            logger.warning("circuit_breaker:%s HALF_OPEN -> OPEN", self.name)
        elif self._state == State.CLOSED:
            self._failure_count += 1
            if self._failure_count >= self.failure_threshold:
                self._state = State.OPEN
                self._last_failure_time = time.monotonic()
                logger.warning(
                    "circuit_breaker:%s CLOSED -> OPEN (failures=%d)",
                    self.name,
                    self._failure_count,
                )

    @asynccontextmanager
    async def __call__(self):
        async with self._lock:
            current = self.state
            if current == State.OPEN:
                raise HTTPException(
                    status_code=503,
                    detail=f"Service '{self.name}' is temporarily unavailable",
                )
        try:
            yield
            async with self._lock:
                self._on_success()
        except HTTPException:
            raise
        except Exception:
            async with self._lock:
                self._on_failure()
            raise

    @property
    def is_available(self) -> bool:
        return self.state != State.OPEN

    def stats(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure_age_s": (
                round(time.monotonic() - self._last_failure_time, 1)
                if self._last_failure_time
                else None
            ),
        }


# ── Global breakers for each upstream service ─────────────────────────

_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(
    name: str,
    *,
    failure_threshold: int = 5,
    recovery_timeout: float = 30.0,
) -> CircuitBreaker:
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(
            name=name,
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout,
        )
    return _breakers[name]


def all_breakers() -> list[dict[str, Any]]:
    return [b.stats() for b in _breakers.values()]
