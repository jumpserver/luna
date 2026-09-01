from __future__ import annotations

from faceliveplus.config import LivenessConfig
from faceliveplus.types import FaceCandidate, LivenessResult


class LivenessDetector:
    def analyze(self, frame, face: FaceCandidate) -> LivenessResult:
        raise NotImplementedError


class DisabledLivenessDetector(LivenessDetector):
    def analyze(self, frame, face: FaceCandidate) -> LivenessResult:
        return LivenessResult(is_live=True, score=1.0, reason="disabled")


class HybridLivenessDetector(LivenessDetector):
    def __init__(self, motion: LivenessDetector, onnx: LivenessDetector, threshold: float) -> None:
        self.motion = motion
        self.onnx = onnx
        self.threshold = threshold

    def analyze(self, frame, face: FaceCandidate) -> LivenessResult:
        motion = self.motion.analyze(frame, face)
        model = self.onnx.analyze(frame, face)
        score = round((motion.score * 0.35) + (model.score * 0.65), 4)
        return LivenessResult(is_live=score >= self.threshold, score=score, reason=f"hybrid:{motion.reason}+{model.reason}")


def create_liveness_detector(config: LivenessConfig) -> LivenessDetector:
    from faceliveplus.liveness.motion import MotionLivenessDetector
    from faceliveplus.liveness.onnx import OnnxLivenessDetector

    if config.mode == "off":
        return DisabledLivenessDetector()
    if config.mode == "motion":
        return MotionLivenessDetector(config)
    if config.mode == "onnx":
        return OnnxLivenessDetector(config)
    if config.mode == "hybrid":
        return HybridLivenessDetector(MotionLivenessDetector(config), OnnxLivenessDetector(config), config.threshold)
    raise ValueError(f"未知活体检测模式：{config.mode}")
