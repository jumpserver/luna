from __future__ import annotations

import time
from dataclasses import dataclass, field

from faceliveplus.challenge import ActionChallenge, ChallengeState
from faceliveplus.engine import FaceLiveEngine
from faceliveplus.types import RecognitionResult


def _challenge_payload(state: ChallengeState) -> dict[str, object]:
    return {
        "type": state.challenge,
        "text": state.text,
        "passed": state.passed,
        "score": state.score,
        "reason": state.reason,
        "remaining_seconds": state.remaining_seconds,
    }


@dataclass(slots=True)
class EnrollmentSession:
    name: str
    timeout_seconds: float = 20.0
    required_samples: int = 3
    person_id: str | None = None
    started_at: float = field(default_factory=time.monotonic)
    challenge: ActionChallenge | None = None
    accepted_samples: int = 0
    last_sample_at: float | None = None
    finished: bool = False

    def __post_init__(self) -> None:
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("name is required")
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if not 1 <= self.required_samples <= 8:
            raise ValueError("required_samples must be between 1 and 8")
        if self.challenge is None:
            self.challenge = ActionChallenge(started_at=self.started_at)

    @property
    def enforce_liveness(self) -> bool:
        return True

    def update(
        self,
        engine: FaceLiveEngine,
        results: list[RecognitionResult],
        now: float | None = None,
    ) -> dict[str, object]:
        timestamp = time.monotonic() if now is None else now
        elapsed = timestamp - self.started_at

        if self.finished:
            return self._payload("enrollment_complete", "采集已完成。", [], None)

        primary = results[0] if len(results) == 1 else None
        challenge_state = self.challenge.update(primary.face if primary else None, timestamp)
        challenge = _challenge_payload(challenge_state)

        if elapsed >= self.timeout_seconds:
            self.finished = True
            event = self._event("enrollment_failed", timestamp, elapsed_seconds=elapsed)
            return self._payload(
                "enrollment_failed",
                f"{self.timeout_seconds:g}s 内未完成活体采集。",
                [event],
                challenge,
            )

        if len(results) > 1:
            return self._payload("enrolling", "画面中只能有一张人脸。", [], challenge)
        if primary is None:
            return self._payload("enrolling", "请将人脸完整放入摄像头采集区域。", [], challenge)

        liveness = primary.face.liveness
        live = bool(liveness and liveness.is_live)
        if self.person_id and primary.match.person_id != self.person_id:
            return self._payload("enrolling", "当前人脸与已选人员不一致，未写入样本。", [], challenge)

        can_sample = (
            live
            and challenge_state.passed
            and (self.last_sample_at is None or timestamp - self.last_sample_at >= 0.25)
        )
        if can_sample:
            item = engine.register_candidate(self.name, primary.face, self.person_id)
            self.person_id = item.person_id
            self.accepted_samples += 1
            self.last_sample_at = timestamp

        if self.accepted_samples >= self.required_samples:
            self.finished = True
            event = self._event(
                "enrollment_complete",
                timestamp,
                samples=float(self.accepted_samples),
            )
            return self._payload(
                "enrollment_complete",
                f"已为 {self.name} 采集 {self.accepted_samples} 个人脸样本。",
                [event],
                challenge,
            )

        if not live:
            detail = "正在验证活体，请自然移动并保持光线充足。"
        elif not challenge_state.passed:
            detail = f"活体已通过，{challenge_state.text}。"
        else:
            detail = f"正在采集样本 {self.accepted_samples}/{self.required_samples}。"
        return self._payload("enrolling", detail, [], challenge)

    def _payload(
        self,
        status: str,
        detail: str,
        events: list[dict[str, object]],
        challenge: dict[str, object] | None,
    ) -> dict[str, object]:
        return {
            "mode": "enroll",
            "phase": "enrolling",
            "status": status,
            "detail": detail,
            "finished": self.finished,
            "person_id": self.person_id,
            "accepted_samples": self.accepted_samples,
            "required_samples": self.required_samples,
            "events": events,
            "challenge": challenge,
        }

    def _event(self, name: str, timestamp: float, **extra: float) -> dict[str, object]:
        return {
            "event": name,
            "target_id": self.person_id,
            "target_name": self.name,
            "flow_mode": "enroll",
            "occurred_at_monotonic": round(timestamp, 4),
            **{key: round(value, 3) for key, value in extra.items()},
        }
