from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


BBox = tuple[int, int, int, int]


@dataclass(slots=True)
class FaceEmbedding:
    person_id: str
    name: str
    vector: np.ndarray
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class LivenessResult:
    is_live: bool
    score: float
    reason: str


@dataclass(slots=True)
class FaceCandidate:
    bbox: BBox
    landmarks: np.ndarray | None
    pose_landmarks: np.ndarray | None
    pose: tuple[float, float, float] | None
    embedding: np.ndarray
    aligned_face: np.ndarray | None
    detection_score: float
    liveness: LivenessResult | None = None


@dataclass(slots=True)
class RecognitionMatch:
    person_id: str | None
    name: str
    similarity: float
    is_match: bool
    reason: str = ""


@dataclass(slots=True)
class RecognitionResult:
    face: FaceCandidate
    match: RecognitionMatch


@dataclass(slots=True)
class PresenceEvent:
    person_id: str
    name: str
    event: str
    elapsed_seconds: float
