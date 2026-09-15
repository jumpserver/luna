from __future__ import annotations

import random
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from faceliveplus.types import FaceCandidate


ChallengeType = Literal["shake_head", "nod_head", "open_mouth"]


CHALLENGE_TEXT: dict[ChallengeType, str] = {
    "shake_head": "请左右摇头",
    "nod_head": "请上下点头",
    "open_mouth": "请张嘴",
}


@dataclass(slots=True)
class ChallengeState:
    challenge: ChallengeType
    text: str
    passed: bool
    score: float
    reason: str
    remaining_seconds: float


@dataclass(slots=True)
class ActionChallenge:
    challenge: ChallengeType = field(default_factory=lambda: random.choice(list(CHALLENGE_TEXT)))
    timeout_seconds: float = 10.0
    passed_hold_seconds: float = 1.2
    samples: deque[tuple[float, float, float, float, float, float]] = field(default_factory=lambda: deque(maxlen=30))
    started_at: float = field(default_factory=time.monotonic)
    passed_at: float | None = None

    def update(self, face: FaceCandidate | None, now: float | None = None) -> ChallengeState:
        timestamp = time.monotonic() if now is None else now
        if self._should_rotate(timestamp):
            self._reset(timestamp)

        if face is not None:
            self._add_sample(timestamp, face)

        score, reason = self._score()
        if score >= 1.0 and self.passed_at is None:
            self.passed_at = timestamp

        return ChallengeState(
            challenge=self.challenge,
            text=CHALLENGE_TEXT[self.challenge],
            passed=self.passed_at is not None,
            score=round(score, 3),
            reason=reason,
            remaining_seconds=max(0.0, round(self.timeout_seconds - (timestamp - self.started_at), 1)),
        )

    def _add_sample(self, timestamp: float, face: FaceCandidate) -> None:
        x1, y1, x2, y2 = face.bbox
        width = max(1, x2 - x1)
        height = max(1, y2 - y1)
        landmarks = face.pose_landmarks if face.pose_landmarks is not None else face.landmarks

        if landmarks is not None and len(landmarks) >= 5:
            points = np.asarray(landmarks, dtype=np.float32)
            nose = points[2] if len(points) == 5 else points.mean(axis=0)
            nose_x = float((nose[0] - x1) / width)
            nose_y = float((nose[1] - y1) / height)
            yaw = self._yaw_signal(points, x1, width)
            pitch = self._pitch_signal(points, y1, height)
            if face.pose is not None:
                pitch_deg, yaw_deg, _roll_deg = face.pose
                yaw = float(yaw_deg / 45.0)
                pitch = float(pitch_deg / 35.0)
            mouth_open = self._mouth_open_ratio(points, width, height)
        else:
            nose_x = 0.5
            nose_y = 0.5
            yaw = 0.0
            pitch = 0.0
            mouth_open = 0.0

        self.samples.append((timestamp, yaw, pitch, nose_x, nose_y, mouth_open))

    def _score(self) -> tuple[float, str]:
        if len(self.samples) < 4:
            return 0.0, "collecting_samples"

        values = np.asarray(list(self.samples), dtype=np.float32)
        yaw_values = values[:, 1]
        pitch_values = values[:, 2]
        x_values = values[:, 3]
        y_values = values[:, 4]
        mouth_values = values[:, 5]

        yaw_range = float(yaw_values.max() - yaw_values.min())
        pitch_range = float(pitch_values.max() - pitch_values.min())
        x_range = float(x_values.max() - x_values.min())
        y_range = float(y_values.max() - y_values.min())
        mouth_max = float(mouth_values.max())
        baseline_size = min(4, len(yaw_values))
        yaw_baseline = float(np.median(yaw_values[:baseline_size]))
        pitch_baseline = float(np.median(pitch_values[:baseline_size]))
        yaw_left = yaw_baseline - float(yaw_values.min())
        yaw_right = float(yaw_values.max()) - yaw_baseline
        pitch_up = pitch_baseline - float(pitch_values.min())
        pitch_down = float(pitch_values.max()) - pitch_baseline

        if self.challenge == "shake_head":
            amplitude_score = min(1.0, yaw_range / 0.38)
            direction_score = min(1.0, min(yaw_left, yaw_right) / 0.10)
            score = min(1.0, amplitude_score * 0.72 + direction_score * 0.28)
            return score, (
                f"yaw_range={yaw_range:.3f},left={yaw_left:.3f},"
                f"right={yaw_right:.3f},x_range={x_range:.3f}"
            )
        if self.challenge == "nod_head":
            amplitude_score = min(1.0, pitch_range / 0.32)
            direction_score = min(1.0, min(pitch_up, pitch_down) / 0.08)
            score = min(1.0, amplitude_score * 0.72 + direction_score * 0.28)
            return score, (
                f"pitch_range={pitch_range:.3f},up={pitch_up:.3f},"
                f"down={pitch_down:.3f},y_range={y_range:.3f}"
            )
        return min(1.0, mouth_max / 0.16), f"mouth={mouth_max:.3f}"

    def _should_rotate(self, timestamp: float) -> bool:
        if self.passed_at is not None and timestamp - self.passed_at >= self.passed_hold_seconds:
            return True
        return timestamp - self.started_at >= self.timeout_seconds

    def _reset(self, timestamp: float | None = None) -> None:
        previous = self.challenge
        choices = [name for name in CHALLENGE_TEXT if name != previous]
        self.challenge = random.choice(choices)
        self.samples.clear()
        self.started_at = time.monotonic() if timestamp is None else timestamp
        self.passed_at = None

    @staticmethod
    def _mouth_open_ratio(points: np.ndarray, width: int, height: int) -> float:
        if len(points) < 90:
            return 0.0

        mouth = points[52:72]
        if len(mouth) == 0:
            return 0.0

        x_span = max(1.0, float(mouth[:, 0].max() - mouth[:, 0].min()))
        y_span = float(mouth[:, 1].max() - mouth[:, 1].min())
        return max(y_span / x_span, y_span / max(1.0, min(width, height)))

    @staticmethod
    def _yaw_signal(points: np.ndarray, x1: int, width: int) -> float:
        if len(points) == 5:
            left_eye, right_eye, nose = points[0], points[1], points[2]
            eye_mid_x = float((left_eye[0] + right_eye[0]) / 2)
            eye_width = max(1.0, float(abs(right_eye[0] - left_eye[0])))
            return float((nose[0] - eye_mid_x) / eye_width)

        xs = np.sort(points[:, 0])
        left = float(np.mean(xs[: max(4, len(xs) // 5)]))
        right = float(np.mean(xs[-max(4, len(xs) // 5):]))
        center_x = x1 + width / 2
        face_width = max(1.0, float(width))
        side_balance = ((right - center_x) - (center_x - left)) / face_width
        centroid_offset = (float(points[:, 0].mean()) - center_x) / face_width
        return float((side_balance * 0.75) + (centroid_offset * 0.25))

    @staticmethod
    def _pitch_signal(points: np.ndarray, y1: int, height: int) -> float:
        if len(points) == 5:
            left_eye, right_eye, nose, left_mouth, right_mouth = points
            eye_y = float((left_eye[1] + right_eye[1]) / 2)
            mouth_y = float((left_mouth[1] + right_mouth[1]) / 2)
            span = max(1.0, mouth_y - eye_y)
            return float((nose[1] - eye_y) / span)

        ys = np.sort(points[:, 1])
        top = float(np.mean(ys[: max(4, len(ys) // 5)]))
        bottom = float(np.mean(ys[-max(4, len(ys) // 5):]))
        center_y = y1 + height / 2
        face_height = max(1.0, float(height))
        vertical_balance = ((bottom - center_y) - (center_y - top)) / face_height
        centroid_offset = (float(points[:, 1].mean()) - center_y) / face_height
        return float((vertical_balance * 0.75) + (centroid_offset * 0.25))
