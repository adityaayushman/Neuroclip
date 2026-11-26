import json
import logging
import threading
import time
from typing import Any, Protocol

log = logging.getLogger("neuroclip.cache")


class Cache(Protocol):
    def get(self, key: str) -> Any | None: ...
    def set(self, key: str, value: Any, ttl_s: int) -> None: ...
    def delete_prefix(self, prefix: str) -> None: ...
    def incr(self, key: str, ttl_s: int) -> int: ...


class MemoryCache:
    def __init__(self) -> None:
        self._data: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()

    def _live(self, key: str) -> tuple[Any, float] | None:
        item = self._data.get(key)
        if item and item[1] > time.monotonic():
            return item
        self._data.pop(key, None)
        return None

    def get(self, key: str) -> Any | None:
        with self._lock:
            item = self._live(key)
            return item[0] if item else None

    def set(self, key: str, value: Any, ttl_s: int) -> None:
        with self._lock:
            self._data[key] = (value, time.monotonic() + ttl_s)

    def delete_prefix(self, prefix: str) -> None:
        with self._lock:
            for k in [k for k in self._data if k.startswith(prefix)]:
                del self._data[k]

    def incr(self, key: str, ttl_s: int) -> int:
        with self._lock:
            item = self._live(key)
            if item is None:
                self._data[key] = (1, time.monotonic() + ttl_s)
                return 1
            self._data[key] = (item[0] + 1, item[1])
            return item[0] + 1


class RedisCache:
    def __init__(self, url: str) -> None:
        import redis

        self._r = redis.Redis.from_url(url, socket_timeout=0.5, socket_connect_timeout=0.5)
        self._err = redis.RedisError

    def get(self, key: str) -> Any | None:
        try:
            raw = self._r.get(key)
            return json.loads(raw) if raw else None
        except self._err:
            log.warning("redis get failed", exc_info=True)
            return None

    def set(self, key: str, value: Any, ttl_s: int) -> None:
        try:
            self._r.set(key, json.dumps(value), ex=ttl_s)
        except self._err:
            log.warning("redis set failed", exc_info=True)

    def delete_prefix(self, prefix: str) -> None:
        try:
            for k in self._r.scan_iter(match=f"{prefix}*"):
                self._r.delete(k)
        except self._err:
            log.warning("redis delete failed", exc_info=True)

    def incr(self, key: str, ttl_s: int) -> int:
        try:
            n = int(self._r.incr(key))
            if n == 1:
                self._r.expire(key, ttl_s)
            return n
        except self._err:
            log.warning("redis incr failed; allowing request", exc_info=True)
            return 0


def make_cache(redis_url: str) -> Cache:
    return RedisCache(redis_url) if redis_url else MemoryCache()
