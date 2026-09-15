from __future__ import annotations

import numpy as np

from faceliveplus.config import LivenessConfig
from faceliveplus.image import require_cv2
from faceliveplus.liveness.base import LivenessDetector
from faceliveplus.types import FaceCandidate, LivenessResult


class OnnxLivenessDetector(LivenessDetector):
    def __init__(self, config: LivenessConfig) -> None:
        if not config.onnx_model_path:
            raise ValueError("liveness.onnx_model_path 未配置。")
        try:
            import onnxruntime as ort
        except ImportError as exc:
            raise RuntimeError("ONNX Runtime 未安装，请执行 pip install onnxruntime 或 onnxruntime-gpu。") from exc

        self.config = config
        self.session = ort.InferenceSession(config.onnx_model_path, providers=ort.get_available_providers())
        self.input_name = self.session.get_inputs()[0].name

    def analyze(self, frame, face: FaceCandidate) -> LivenessResult:
        cv2 = require_cv2()
        x1, y1, x2, y2 = face.bbox
        crop = frame[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
        if crop.size == 0:
            return LivenessResult(False, 0.0, "empty_crop")

        blob = cv2.resize(crop, (80, 80))
        blob = cv2.cvtColor(blob, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))[None, :, :, :]
        output = self.session.run(None, {self.input_name: blob})[0]
        score = float(np.asarray(output).reshape(-1)[-1])
        return LivenessResult(is_live=score >= self.config.threshold, score=round(score, 4), reason="onnx")
