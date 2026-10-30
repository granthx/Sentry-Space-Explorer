from app.cache import MISSING, TTLCache


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_get_returns_value_until_it_expires():
    clock = FakeClock()
    cache = TTLCache(ttl_seconds=10, clock=clock)
    cache.set("a", {"x": 1})
    assert cache.get("a") == {"x": 1}
    clock.now += 9.9
    assert cache.get("a") == {"x": 1}
    clock.now += 0.2
    assert cache.get("a", MISSING) is MISSING


def test_custom_ttl_overrides_default():
    clock = FakeClock()
    cache = TTLCache(ttl_seconds=10, clock=clock)
    cache.set("long", 1, ttl=100)
    clock.now += 50
    assert cache.get("long") == 1


def test_zero_ttl_is_not_stored():
    cache = TTLCache(ttl_seconds=10)
    cache.set("a", 1, ttl=0)
    assert cache.get("a", MISSING) is MISSING


def test_oldest_entry_is_evicted_when_full():
    cache = TTLCache(ttl_seconds=10, max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.get("a")  # touch "a" so "b" becomes the oldest
    cache.set("c", 3)
    assert cache.get("b", MISSING) is MISSING
    assert cache.get("a") == 1
    assert cache.get("c") == 3


def test_stats_count_hits_and_misses():
    cache = TTLCache(ttl_seconds=10)
    cache.set("a", 1)
    cache.get("a")
    cache.get("nope")
    stats = cache.stats()
    assert stats["hits"] == 1
    assert stats["misses"] == 1
    assert stats["entries"] == 1
