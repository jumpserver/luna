from __future__ import annotations

import time
from collections.abc import Callable

from faceliveplus.config import TrackingConfig
from faceliveplus.types import PresenceEvent, RecognitionResult


PresenceCallback = Callable[[PresenceEvent], None]


class PresenceTracker:
    def __init__(self, config: TrackingConfig, callback: PresenceCallback | None = None) -> None:
        self.config = config
        self.callback = callback
        self.last_seen: dict[str, tuple[str, float]] = {}
        self.away_emitted: set[str] = set()

    def update(self, results: list[RecognitionResult], now: float | None = None) -> list[PresenceEvent]:
        timestamp = time.monotonic() if now is None else now
        events: list[PresenceEvent] = []

        for result in results:
            match = result.match
            if not match.is_match or not match.person_id:
                continue
            self.last_seen[match.person_id] = (match.name, timestamp)
            self.away_emitted.discard(match.person_id)

        for person_id, (name, last_seen_at) in list(self.last_seen.items()):
            elapsed = timestamp - last_seen_at
            if elapsed >= self.config.away_after_seconds and person_id not in self.away_emitted:
                event = PresenceEvent(person_id=person_id, name=name, event="away", elapsed_seconds=round(elapsed, 3))
                events.append(event)
                self.away_emitted.add(person_id)
                if self.callback:
                    self.callback(event)

        return events
