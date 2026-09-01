from __future__ import annotations

import numpy as np

from faceliveplus.config import LivenessConfig
from faceliveplus.image import require_cv2
from faceliveplus.liveness.base import LivenessDetector
from faceliveplus.types import FaceCandidate, LivenessResult


class MotionLivenessDetector(LivenessDetector):
    """Lightweight anti-replay signal based on temporal face texture change.

    This is useful as a built-in baseline and debug signal. For production anti-spoofing,
    combine it with an ONNX anti-spoofing model through HybridLivenessDetector.
    """

    def __init__(self, config: LivenessConfig) -> None:
        self.config = config
        self.previous_gray: np.ndarray | None = None

    def analyze(self, frame, face: FaceCandidate) -> LivenessResult:
        cv2 = require_cv2()
        x1, y1, x2, y2 = face.bbox
        width = x2 - x1
        height = y2 - y1
        if min(width, height) < self.config.min_face_size:
            return LivenessResult(False, 0.0, "face_too_small")

        crop = frame[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
        if crop.size == 0:
            return LivenessResult(False, 0.0, "empty_crop")

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (96, 96))
        texture_score = min(float(cv2.Laplacian(gray, cv2.CV_64F).var()) / 500.0, 1.0)

        motion_score = 0.0
        if self.previous_gray is not None:
            diff = cv2.absdiff(gray, self.previous_gray)
            motion_score = min(float(diff.mean()) / 20.0, 1.0)

        self.previous_gray = gray
        score = round((texture_score * 0.6) + (motion_score * 0.4), 4)
        is_live = score >= self.config.threshold or motion_score >= self.config.min_motion_score
        reason = f"motion={motion_score:.3f},texture={texture_score:.3f}"
        return LivenessResult(is_live=is_live, score=score, reason=reason)
