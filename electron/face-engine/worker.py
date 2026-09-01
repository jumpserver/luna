from __future__ import annotations

import base64
import binascii
import json
import os
import platform
import sys
import traceback
from contextlib import redirect_stdout
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from faceliveplus.config import FaceLiveConfig, config_from_dict
from faceliveplus.engine import FaceLiveEngine
from faceliveplus.enrollment import EnrollmentSession
from faceliveplus.flow import FaceFlowSession
from faceliveplus.image import require_cv2
from faceliveplus.liveness import create_liveness_detector


MAX_ENCODED_FRAME_BYTES = 6 * 1024 * 1024


@dataclass(slots=True)
class SessionRecord:
    controller: EnrollmentSession | FaceFlowSession
    liveness: Any
    debug: bool


class FaceWorkerService:
    def __init__(self) -> None:
        data_dir = os.environ.get("JMS_FACE_DATA_DIR", str(Path.cwd() / ".data"))
        model_root = os.environ.get("JMS_FACE_MODEL_ROOT") or None
        self.config = FaceLiveConfig(data_dir=data_dir, model_root=model_root)
        self.engine: FaceLiveEngine | None = None
        self.sessions: dict[str, SessionRecord] = {}

    def handle(self, command: str, payload: dict[str, Any]) -> Any:
        handlers = {
            "status": self.status,
            "initialize": self.initialize,
            "configure": self.configure,
            "list_people": self.list_people,
            "remove_person": self.remove_person,
            "start_session": self.start_session,
            "process_frame": self.process_frame,
            "stop_session": self.stop_session,
            "shutdown": self.shutdown,
        }
        handler = handlers.get(command)
        if not handler:
            raise ValueError(f"Unsupported worker command: {command}")
        return handler(payload)

    def status(self, _payload: dict[str, Any]) -> dict[str, Any]:
        capabilities: dict[str, Any] = {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "engine_initialized": self.engine is not None,
            "active_sessions": len(self.sessions),
        }
        try:
            import cv2
            import insightface
            import onnxruntime as ort

            capabilities.update(
                {
                    "opencv": cv2.__version__,
                    "insightface": insightface.__version__,
                    "onnxruntime": ort.__version__,
                    "available_providers": ort.get_available_providers(),
                }
            )
        except ImportError as exc:
            capabilities["dependency_error"] = str(exc)
        if self.engine:
            capabilities.update(self.engine.runtime_info())
        return capabilities

    def initialize(self, _payload: dict[str, Any]) -> dict[str, Any]:
        engine = self._engine()
        return {**self.status({}), **engine.runtime_info(), "people": engine.list_people()}

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.sessions:
            raise RuntimeError("Stop active face sessions before changing engine configuration")
        normalized = self._normalize_config(payload)
        self.config = config_from_dict(normalized)
        self.engine = self._create_engine()
        return {**self.status({}), **self.engine.runtime_info(), "people": self.engine.list_people()}

    def list_people(self, _payload: dict[str, Any]) -> list[dict[str, Any]]:
        return self._engine().list_people()

    def remove_person(self, payload: dict[str, Any]) -> dict[str, Any]:
        person_id = str(payload.get("person_id") or "").strip()
        if not person_id:
            raise ValueError("person_id is required")
        removed = self._engine().remove_person(person_id)
        return {"removed_samples": removed, "people": self._engine().list_people()}

    def start_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        session_id = str(payload.get("session_id") or "").strip()
        if not session_id:
            raise ValueError("session_id is required")
        if session_id in self.sessions:
            raise ValueError("face session already exists")

        mode = str(payload.get("mode") or "").strip()
        timeout = _positive_float(payload.get("timeout_seconds"), 20.0, "timeout_seconds")
        started_at = _optional_float(payload.get("started_at"))
        common = {"timeout_seconds": timeout}
        if started_at is not None:
            common["started_at"] = started_at

        if mode == "enroll":
            controller: EnrollmentSession | FaceFlowSession = EnrollmentSession(
                name=str(payload.get("name") or ""),
                required_samples=max(1, min(8, int(payload.get("required_samples") or 3))),
                person_id=str(payload.get("person_id") or "").strip() or None,
                **common,
            )
        elif mode in {"auth", "monitor"}:
            threshold = _optional_float(payload.get("threshold"))
            if threshold is not None and not 0.0 < threshold <= 1.0:
                raise ValueError("threshold must be between 0 and 1")
            controller = FaceFlowSession(
                mode=mode,
                target_id=str(payload.get("target_id") or "").strip(),
                target_name=str(payload.get("target_name") or "").strip(),
                away_after_seconds=_positive_float(
                    payload.get("away_after_seconds"), 5.0, "away_after_seconds"
                ),
                threshold=threshold,
                **common,
            )
        else:
            raise ValueError(f"Unsupported face session mode: {mode}")

        self._engine()
        record = SessionRecord(
            controller=controller,
            liveness=create_liveness_detector(self.config.liveness),
            debug=bool(payload.get("debug", self.config.debug.enabled)),
        )
        self.sessions[session_id] = record
        return {
            "session_id": session_id,
            "mode": mode,
            "phase": "enrolling" if mode == "enroll" else controller.phase,
        }

    def process_frame(self, payload: dict[str, Any]) -> dict[str, Any]:
        session_id = str(payload.get("session_id") or "").strip()
        record = self.sessions.get(session_id)
        if not record:
            raise ValueError("face session not found")

        frame = _decode_frame(str(payload.get("image") or ""))
        controller = record.controller
        engine = self._engine()
        threshold = controller.threshold if isinstance(controller, FaceFlowSession) else None
        results = engine.analyze_frame(
            frame,
            update_presence=False,
            enforce_liveness=controller.enforce_liveness,
            threshold=threshold,
            liveness_detector=record.liveness,
        )
        flow = (
            controller.update(engine, results)
            if isinstance(controller, EnrollmentSession)
            else controller.update(results)
        )
        return {
            "session_id": session_id,
            "frame": {"width": int(frame.shape[1]), "height": int(frame.shape[0])},
            "faces": [_result_payload(result, include_landmarks=record.debug) for result in results],
            "flow": flow,
        }

    def stop_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        session_id = str(payload.get("session_id") or "").strip()
        removed = self.sessions.pop(session_id, None)
        return {"stopped": removed is not None}

    def shutdown(self, _payload: dict[str, Any]) -> dict[str, Any]:
        self.sessions.clear()
        return {"shutdown": True}

    def _engine(self) -> FaceLiveEngine:
        if self.engine is None:
            self.engine = self._create_engine()
        return self.engine

    def _create_engine(self) -> FaceLiveEngine:
        # InsightFace writes provider/model diagnostics to stdout. Keep stdout
        # exclusive to the JSONL protocol and route library diagnostics to stderr.
        with redirect_stdout(sys.stderr):
            return FaceLiveEngine(self.config)

    def _normalize_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        recognition = payload.get("recognition") or {}
        liveness = payload.get("liveness") or {}
        debug = payload.get("debug") or {}
        data_dir = os.environ.get("JMS_FACE_DATA_DIR") or str(payload.get("data_dir") or self.config.data_dir)
        model_root = os.environ.get("JMS_FACE_MODEL_ROOT") or payload.get("model_root") or self.config.model_root
        return {
            "device": payload.get("device", self.config.device),
            "providers": payload.get("providers", self.config.providers),
            "data_dir": data_dir,
            "model_name": payload.get("model_name", self.config.model_name),
            "model_root": model_root,
            "recognition": {
                "threshold": recognition.get("threshold", self.config.recognition.threshold),
                "det_size": recognition.get("det_size", self.config.recognition.det_size),
                "max_faces": recognition.get("max_faces", self.config.recognition.max_faces),
            },
            "liveness": {
                "mode": liveness.get("mode", self.config.liveness.mode),
                "threshold": liveness.get("threshold", self.config.liveness.threshold),
                "onnx_model_path": liveness.get("onnx_model_path", self.config.liveness.onnx_model_path),
                "min_motion_score": liveness.get("min_motion_score", self.config.liveness.min_motion_score),
                "min_face_size": liveness.get("min_face_size", self.config.liveness.min_face_size),
            },
            "tracking": {
                "away_after_seconds": self.config.tracking.away_after_seconds,
                "match_iou_threshold": self.config.tracking.match_iou_threshold,
            },
            "debug": {
                "enabled": debug.get("enabled", self.config.debug.enabled),
                "draw_bbox": debug.get("draw_bbox", self.config.debug.draw_bbox),
                "draw_landmarks": debug.get("draw_landmarks", self.config.debug.draw_landmarks),
                "draw_liveness": debug.get("draw_liveness", self.config.debug.draw_liveness),
            },
        }


def _decode_frame(data_url: str) -> np.ndarray:
    encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
    if not encoded or len(encoded) > MAX_ENCODED_FRAME_BYTES * 2:
        raise ValueError("frame is empty or too large")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("invalid base64 frame") from exc
    if len(raw) > MAX_ENCODED_FRAME_BYTES:
        raise ValueError("decoded frame is too large")
    cv2 = require_cv2()
    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("unable to decode image frame")
    return frame


def _result_payload(result, *, include_landmarks: bool) -> dict[str, Any]:
    liveness = result.face.liveness
    payload: dict[str, Any] = {
        "name": result.match.name,
        "person_id": result.match.person_id,
        "is_match": result.match.is_match,
        "similarity": result.match.similarity,
        "reason": result.match.reason,
        "bbox": list(result.face.bbox),
        "detection_score": round(result.face.detection_score, 4),
        "pose": list(result.face.pose) if result.face.pose is not None else None,
        "liveness": None,
    }
    if liveness:
        payload["liveness"] = {
            "is_live": liveness.is_live,
            "score": liveness.score,
            "reason": liveness.reason,
        }
    if include_landmarks and result.face.landmarks is not None:
        payload["landmarks"] = np.asarray(result.face.landmarks).round(2).tolist()
    return payload


def _positive_float(value: Any, default: float, name: str) -> float:
    result = default if value in {None, ""} else float(value)
    if result <= 0:
        raise ValueError(f"{name} must be positive")
    return result


def _optional_float(value: Any) -> float | None:
    return None if value in {None, ""} else float(value)


def _write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> int:
    service = FaceWorkerService()
    debug = os.environ.get("JMS_FACE_DEBUG") == "1"
    for line in sys.stdin:
        request_id: Any = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            result = service.handle(str(request.get("command") or ""), request.get("payload") or {})
            _write_response({"id": request_id, "ok": True, "result": result})
            if request.get("command") == "shutdown":
                return 0
        except Exception as exc:
            response: dict[str, Any] = {
                "id": request_id,
                "ok": False,
                "error": {"type": type(exc).__name__, "message": str(exc)},
            }
            if debug:
                response["error"]["traceback"] = traceback.format_exc()
            _write_response(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
