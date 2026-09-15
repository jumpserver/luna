from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Literal

from faceliveplus.challenge import ActionChallenge, ChallengeState
from faceliveplus.types import RecognitionResult


FlowMode = Literal["auth", "monitor"]


def _challenge_payload(state: ChallengeState) -> dict[str, object]:
    return {
        "type": state.challenge,
        "text": state.text,
        "passed": state.passed,
        "score": state.score,
        "reason": state.reason,
        "remaining_seconds": state.remaining_seconds,
    }


def _monitoring_challenge_payload() -> dict[str, object]:
    return {
        "type": None,
        "text": "监测中",
        "passed": True,
        "score": 1.0,
        "reason": "liveness_completed_once",
        "remaining_seconds": 0.0,
    }


@dataclass(slots=True)
class FaceFlowSession:
    mode: FlowMode
    target_id: str
    target_name: str
    timeout_seconds: float
    away_after_seconds: float = 5.0
    threshold: float | None = None
    started_at: float = field(default_factory=time.monotonic)
    challenge: ActionChallenge | None = None
    phase: str = field(init=False)
    finished: bool = False
    missing_since: float | None = None
    away_callback_emitted: bool = False

    def __post_init__(self) -> None:
        if self.mode not in {"auth", "monitor"}:
            raise ValueError(f"Unsupported face flow mode: {self.mode}")
        if not self.target_id:
            raise ValueError("target_id is required")
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if self.away_after_seconds <= 0:
            raise ValueError("away_after_seconds must be positive")
        self.phase = "authenticating" if self.mode == "auth" else "initializing"
        if self.challenge is None:
            self.challenge = ActionChallenge(started_at=self.started_at)

    @property
    def enforce_liveness(self) -> bool:
        return self.phase != "monitoring"

    def update(self, results: list[RecognitionResult], now: float | None = None) -> dict[str, object]:
        timestamp = time.monotonic() if now is None else now
        target = self._target_result(results)

        if self.finished:
            return self._payload("finished", "流程已结束。", [], _monitoring_challenge_payload())

        if self.phase == "monitoring":
            return self._update_monitoring(target, timestamp)

        challenge_state = self.challenge.update(target.face if target else None, timestamp)
        challenge = _challenge_payload(challenge_state)
        target_ready = bool(
            target
            and target.match.is_match
            and target.face.liveness
            and target.face.liveness.is_live
        )
        elapsed = timestamp - self.started_at

        if target_ready and challenge_state.passed:
            if self.mode == "auth":
                self.finished = True
                return self._payload(
                    "auth_success",
                    f"{self.target_name} 已通过识别、活体和动作挑战。",
                    [self._event("auth_success", timestamp, elapsed_seconds=elapsed)],
                    challenge,
                )

            self.phase = "monitoring"
            self.missing_since = None
            self.away_callback_emitted = False
            return self._payload(
                "monitor_started",
                f"{self.target_name} 已完成一次活检，开始在线监测。",
                [self._event("monitor_started", timestamp, elapsed_seconds=elapsed)],
                _monitoring_challenge_payload(),
            )

        if elapsed >= self.timeout_seconds:
            self.finished = True
            event_name = "auth_failed" if self.mode == "auth" else "monitor_init_failed"
            return self._payload(
                event_name,
                f"{self.timeout_seconds:g}s 内未完成目标识别、活体和动作挑战。",
                [self._event(event_name, timestamp, elapsed_seconds=elapsed)],
                challenge,
            )

        target_text = "目标与活体已通过" if target_ready else "等待目标识别和活体通过"
        action_text = "动作已通过" if challenge_state.passed else "等待动作挑战通过"
        remaining = max(0.0, self.timeout_seconds - elapsed)
        status = "authenticating" if self.mode == "auth" else "monitor_initializing"
        return self._payload(status, f"{target_text}，{action_text}，剩余 {remaining:.1f}s。", [], challenge)

    def _update_monitoring(self, target: RecognitionResult | None, timestamp: float) -> dict[str, object]:
        visible = bool(target and target.match.is_match)
        events: list[dict[str, object]] = []

        if visible:
            if self.missing_since is not None:
                events.append(
                    self._event(
                        "monitor_returned",
                        timestamp,
                        missing_seconds=timestamp - self.missing_since,
                    )
                )
            self.missing_since = None
            self.away_callback_emitted = False
            return self._payload(
                "monitoring",
                f"{self.target_name} 在摄像头采集区域内。",
                events,
                _monitoring_challenge_payload(),
            )

        if self.missing_since is None:
            self.missing_since = timestamp
            events.append(self._event("monitor_away_warning", timestamp, missing_seconds=0.0))
            return self._payload(
                "monitor_away_warning",
                f"{self.target_name} 已离开摄像头采集区域。",
                events,
                _monitoring_challenge_payload(),
            )

        missing_seconds = timestamp - self.missing_since
        if missing_seconds >= self.away_after_seconds and not self.away_callback_emitted:
            self.away_callback_emitted = True
            events.append(
                self._event("monitor_away_timeout", timestamp, missing_seconds=missing_seconds)
            )

        status = "monitor_away_timeout" if self.away_callback_emitted else "monitor_away_warning"
        detail = (
            f"{self.target_name} 已离开 {missing_seconds:.1f}s，"
            f"超过 {self.away_after_seconds:g}s 后触发回调。"
        )
        return self._payload(status, detail, events, _monitoring_challenge_payload())

    def _target_result(self, results: list[RecognitionResult]) -> RecognitionResult | None:
        candidates = [result for result in results if result.match.person_id == self.target_id]
        if not candidates:
            return None
        return max(candidates, key=lambda result: result.match.similarity)

    def _payload(
        self,
        status: str,
        detail: str,
        events: list[dict[str, object]],
        challenge: dict[str, object],
    ) -> dict[str, object]:
        return {
            "mode": self.mode,
            "phase": self.phase,
            "status": status,
            "detail": detail,
            "finished": self.finished,
            "events": events,
            "challenge": challenge,
        }

    def _event(self, name: str, timestamp: float, **extra: float) -> dict[str, object]:
        return {
            "event": name,
            "target_id": self.target_id,
            "target_name": self.target_name,
            "flow_mode": self.mode,
            "occurred_at_monotonic": round(timestamp, 4),
            **{key: round(value, 3) for key, value in extra.items()},
        }
