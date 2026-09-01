from __future__ import annotations

import sys

import numpy as np

from faceliveplus.config import FaceLiveConfig
from faceliveplus.image import align_face
from faceliveplus.types import FaceCandidate


class InsightFaceBackend:
    def __init__(self, config: FaceLiveConfig) -> None:
        try:
            from insightface.app import FaceAnalysis
        except ImportError as exc:
            raise RuntimeError("InsightFace 未安装，请执行 pip install insightface onnxruntime。") from exc

        providers, accelerated = self._resolve_providers(config)
        try:
            self.app = self._prepare(FaceAnalysis, config, providers, accelerated)
            self.providers = providers
            self.accelerated = accelerated
        except Exception as exc:
            if config.device != "auto" or not accelerated:
                raise
            print(
                f"Accelerated ONNX provider initialization failed; falling back to CPU: {exc}",
                file=sys.stderr,
            )
            self.providers = ["CPUExecutionProvider"]
            self.accelerated = False
            self.app = self._prepare(FaceAnalysis, config, self.providers, False)

    def detect(self, frame_bgr: np.ndarray) -> list[FaceCandidate]:
        faces = self.app.get(frame_bgr)
        candidates: list[FaceCandidate] = []

        for face in faces:
            bbox = tuple(int(value) for value in face.bbox)
            alignment_landmarks = getattr(face, "kps", None)
            pose_landmarks = getattr(face, "landmark_2d_106", None)
            landmarks = pose_landmarks if pose_landmarks is not None else alignment_landmarks
            pose = getattr(face, "pose", None)
            pose_tuple = tuple(float(value) for value in pose) if pose is not None else None
            embedding = np.asarray(face.normed_embedding, dtype=np.float32)
            aligned = align_face(frame_bgr, alignment_landmarks) if alignment_landmarks is not None else None
            candidates.append(
                FaceCandidate(
                    bbox=bbox,
                    landmarks=landmarks,
                    pose_landmarks=pose_landmarks,
                    pose=pose_tuple,
                    embedding=embedding,
                    aligned_face=aligned,
                    detection_score=float(getattr(face, "det_score", 0.0)),
                )
            )

        return candidates

    @staticmethod
    def _resolve_providers(config: FaceLiveConfig) -> tuple[list[str], bool]:
        try:
            import onnxruntime as ort

            available = set(ort.get_available_providers())
        except ImportError:
            available = {"CPUExecutionProvider"}

        if config.providers:
            providers = [provider for provider in config.providers if provider in available]
            if not providers:
                raise RuntimeError("None of the configured ONNX Runtime providers are available")
        elif config.device == "cpu":
            providers = ["CPUExecutionProvider"]
        else:
            preferred = [
                "CUDAExecutionProvider",
                "CoreMLExecutionProvider",
                "DmlExecutionProvider",
                "ROCMExecutionProvider",
                "CPUExecutionProvider",
            ]
            providers = [provider for provider in preferred if provider in available]

        accelerated = any(provider != "CPUExecutionProvider" for provider in providers)
        if config.device == "gpu" and not accelerated:
            raise RuntimeError("GPU mode was requested, but no accelerated ONNX Runtime provider is available")
        return providers or ["CPUExecutionProvider"], accelerated

    @staticmethod
    def _prepare(FaceAnalysis, config: FaceLiveConfig, providers: list[str], accelerated: bool):
        analysis_options = {"name": config.model_name, "providers": providers}
        if config.model_root:
            analysis_options["root"] = config.model_root
        app = FaceAnalysis(**analysis_options)
        app.prepare(ctx_id=0 if accelerated else -1, det_size=config.recognition.det_size)
        return app
