"""A tiny in-memory TTL cache.

NASA's keys are rate limited (DEMO_KEY: 30 requests/hour), so every successful
upstream response is cached for a while. Swap this for Redis later if you ever
run more than one backend process.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any, Callable, Hashable

MISSING = object()


class TTLCache:
    def __init__(
        self,
        ttl_seconds: float = 900,
        max_entries: int = 512,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.default_ttl = ttl_seconds
        self.max_entries = max_entries
        self._clock = clock
        self._store: OrderedDict[Hashable, tuple[float, Any]] = OrderedDict()
        self.hits = 0
        self.misses = 0

    def get(self, key: Hashable, default: Any = None) -> Any:
        item = self._store.get(key)
        if item is None:
            self.misses += 1
            return default
        expires_at, value = item
        if expires_at <= self._clock():
            del self._store[key]
            self.misses += 1
            return default
        self._store.move_to_end(key)
        self.hits += 1
        return value

    def set(self, key: Hashable, value: Any, ttl: float | None = None) -> None:
        """Store a value. ttl=None uses the default; ttl<=0 means "do not cache"."""
        ttl = self.default_ttl if ttl is None else ttl
        if ttl <= 0:
            return
        self._store[key] = (self._clock() + ttl, value)
        self._store.move_to_end(key)
        while len(self._store) > self.max_entries:
            self._store.popitem(last=False)

    def clear(self) -> None:
        self._store.clear()

    def stats(self) -> dict[str, Any]:
        return {
            "entries": len(self._store),
            "max_entries": self.max_entries,
            "hits": self.hits,
            "misses": self.misses,
            "default_ttl_seconds": self.default_ttl,
        }
