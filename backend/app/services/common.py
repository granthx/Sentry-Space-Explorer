from __future__ import annotations

# Responses for events strictly in the past do not change, so cache for 24 hours.
PAST_TTL_SECONDS: int = 24 * 3600

