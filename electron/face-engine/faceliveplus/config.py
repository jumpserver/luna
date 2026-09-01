from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal


DeviceMode = Literal["cpu", "gpu", "auto"]
LivenessMode = Literal["off", "motion", "onnx", "hybrid"]


@dataclass(slots=True)
class DebugConfig:
    enabled: bool = False
    draw_bbox: bool = True
    draw_landmarks: bool = True
    draw_liveness: bool = True


@dataclass(slots=True)
class RecognitionConfig:
    threshold: float = 0.42
    det_size: tuple[int, int] = (640, 640)
    max_faces: int = 8

    def __post_init__(self) -> None:
        self.det_size = tuple(self.det_size)
        if not 0.0 < self.threshold <= 1.0:
            raise ValueError("recognition.threshold must be between 0 and 1")
        if len(self.det_size) != 2 or min(self.det_size) <= 0:
            raise ValueError("recognition.det_size must contain two positive integers")
        if self.max_faces < 1:
            raise ValueError("recognition.max_faces must be at least 1")


@dataclass(slots=True)
class LivenessConfig:
    mode: LivenessMode = "motion"
    threshold: float = 0.72
    onnx_model_path: str | None = None
    min_motion_score: float = 0.05
    min_face_size: int = 80

    def __post_init__(self) -> None:
        if not 0.0 <= self.threshold <= 1.0:
            raise ValueError("liveness.threshold must be between 0 and 1")
        if not 0.0 <= self.min_motion_score <= 1.0:
            raise ValueError("liveness.min_motion_score must be between 0 and 1")
        if self.min_face_size < 1:
            raise ValueError("liveness.min_face_size must be at least 1")


@dataclass(slots=True)
class TrackingConfig:
    away_after_seconds: float = 3.0
    match_iou_threshold: float = 0.2


@dataclass(slots=True)
class FaceLiveConfig:
    device: DeviceMode = "auto"
    providers: list[str] = field(default_factory=list)
    data_dir: str = "app/data"
    model_name: str = "buffalo_l"
    model_root: str | None = None
    recognition: RecognitionConfig = field(default_factory=RecognitionConfig)
    liveness: LivenessConfig = field(default_factory=LivenessConfig)
    tracking: TrackingConfig = field(default_factory=TrackingConfig)
    debug: DebugConfig = field(default_factory=DebugConfig)

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir)

    @property
    def embeddings_path(self) -> Path:
        return self.data_path / "embeddings.json"

    @property
    def known_faces_path(self) -> Path:
        return self.data_path / "known_faces"


def load_config(path: str | Path | None = None) -> FaceLiveConfig:
    if path is None:
        return FaceLiveConfig()

    config_path = Path(path)
    payload = json.loads(config_path.read_text(encoding="utf-8"))
    return config_from_dict(payload)


def config_from_dict(payload: dict[str, Any]) -> FaceLiveConfig:
    recognition = RecognitionConfig(**payload.get("recognition", {}))
    liveness = LivenessConfig(**payload.get("liveness", {}))
    tracking = TrackingConfig(**payload.get("tracking", {}))
    debug = DebugConfig(**payload.get("debug", {}))
    known = {key: value for key, value in payload.items() if key not in {"recognition", "liveness", "tracking", "debug"}}
    return FaceLiveConfig(
        **known,
        recognition=recognition,
        liveness=liveness,
        tracking=tracking,
        debug=debug,
    )
