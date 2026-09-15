from __future__ import annotations

from pathlib import Path

from faceliveplus.backends import InsightFaceBackend
from faceliveplus.config import FaceLiveConfig
from faceliveplus.image import draw_debug, read_bgr, save_bgr
from faceliveplus.liveness import create_liveness_detector
from faceliveplus.presence import PresenceCallback, PresenceTracker
from faceliveplus.store import EmbeddingStore
from faceliveplus.types import RecognitionMatch, RecognitionResult


class FaceLiveEngine:
    def __init__(self, config: FaceLiveConfig | None = None, away_callback: PresenceCallback | None = None) -> None:
        self.config = config or FaceLiveConfig()
        self.backend = InsightFaceBackend(self.config)
        self.store = EmbeddingStore(self.config.embeddings_path)
        self.liveness = create_liveness_detector(self.config.liveness)
        self.presence = PresenceTracker(self.config.tracking, away_callback)

    def register_image(self, name: str, image_path: str | Path, person_id: str | None = None) -> int:
        frame = read_bgr(image_path)
        faces = self.backend.detect(frame)
        if not faces:
            raise ValueError("没有检测到人脸。")

        count = 0
        for face in faces:
            self.store.add(
                name=name.strip(),
                person_id=person_id,
                vector=face.embedding,
                metadata={"source": str(image_path), "det_score": face.detection_score},
            )
            count += 1
        return count

    def register_frame(self, name: str, frame_bgr, person_id: str | None = None) -> int:
        faces = self.backend.detect(frame_bgr)
        if not faces:
            return 0

        for face in faces:
            self.store.add(name=name.strip(), person_id=person_id, vector=face.embedding, metadata={"source": "camera"})
        return len(faces)

    def register_candidate(self, name: str, candidate, person_id: str | None = None):
        return self.store.add(
            name=name.strip(),
            person_id=person_id,
            vector=candidate.embedding,
            metadata={"source": "camera", "det_score": candidate.detection_score},
        )

    def analyze_frame(
        self,
        frame_bgr,
        *,
        update_presence: bool = True,
        enforce_liveness: bool = True,
        threshold: float | None = None,
        liveness_detector=None,
    ) -> list[RecognitionResult]:
        candidates = self.backend.detect(frame_bgr)
        results: list[RecognitionResult] = []

        for candidate in candidates[: self.config.recognition.max_faces]:
            detector = liveness_detector or self.liveness
            candidate.liveness = detector.analyze(frame_bgr, candidate) if enforce_liveness else None
            item, similarity = self.store.search(candidate.embedding)
            match_threshold = self.config.recognition.threshold if threshold is None else threshold
            passed_similarity = bool(item and similarity >= match_threshold)
            passed_liveness = bool(candidate.liveness and candidate.liveness.is_live)
            is_match = passed_similarity and (passed_liveness if enforce_liveness else True)
            reason = self._match_reason(
                has_candidate=item is not None,
                passed_similarity=passed_similarity,
                passed_liveness=passed_liveness,
                enforce_liveness=enforce_liveness,
            )
            match = RecognitionMatch(
                person_id=item.person_id if item and passed_similarity else None,
                name=item.name if item and passed_similarity else "Unknown",
                similarity=round(similarity, 4),
                is_match=is_match,
                reason=reason,
            )
            results.append(RecognitionResult(face=candidate, match=match))

        if update_presence:
            self.presence.update(results)

        return results

    def analyze_image(self, image_path: str | Path) -> list[RecognitionResult]:
        return self.analyze_frame(read_bgr(image_path), update_presence=False, enforce_liveness=False)

    def render_debug(self, frame_bgr, results: list[RecognitionResult]):
        debug = self.config.debug
        return draw_debug(
            frame_bgr,
            results,
            draw_bbox=debug.draw_bbox,
            draw_landmarks=debug.draw_landmarks,
            draw_liveness=debug.draw_liveness,
        )

    def analyze_image_with_debug(self, image_path: str | Path, output_path: str | Path) -> list[RecognitionResult]:
        frame = read_bgr(image_path)
        results = self.analyze_frame(frame, update_presence=False, enforce_liveness=False)
        save_bgr(output_path, self.render_debug(frame, results))
        return results

    def list_people(self) -> list[dict[str, str]]:
        return self.store.people()

    def remove_person(self, person_id: str) -> int:
        return self.store.remove_person(person_id)

    def runtime_info(self) -> dict[str, object]:
        return {
            "model_name": self.config.model_name,
            "device": self.config.device,
            "providers": list(self.backend.providers),
            "accelerated": self.backend.accelerated,
        }

    @staticmethod
    def _match_reason(
        *,
        has_candidate: bool,
        passed_similarity: bool,
        passed_liveness: bool,
        enforce_liveness: bool,
    ) -> str:
        if not has_candidate:
            return "empty_store"
        if not passed_similarity:
            return "below_similarity_threshold"
        if enforce_liveness and not passed_liveness:
            return "liveness_rejected"
        if not enforce_liveness and not passed_liveness:
            return "matched_without_static_liveness"
        return "matched"
