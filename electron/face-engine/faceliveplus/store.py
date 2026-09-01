from __future__ import annotations

import json
import os
from pathlib import Path
from uuid import uuid4

import numpy as np

from faceliveplus.types import FaceEmbedding


class EmbeddingStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.items: list[FaceEmbedding] = []
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            self.items = []
            return

        payload = json.loads(self.path.read_text(encoding="utf-8"))
        self.items = [
            FaceEmbedding(
                person_id=item["person_id"],
                name=item["name"],
                vector=np.asarray(item["vector"], dtype=np.float32),
                metadata=item.get("metadata", {}),
            )
            for item in payload.get("faces", [])
        ]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "faces": [
                {
                    "person_id": item.person_id,
                    "name": item.name,
                    "vector": item.vector.astype(float).tolist(),
                    "metadata": item.metadata,
                }
                for item in self.items
            ]
        }
        pending = self.path.with_suffix(f"{self.path.suffix}.pending-{os.getpid()}")
        pending.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        pending.replace(self.path)

    def add(self, name: str, vector: np.ndarray, person_id: str | None = None, metadata: dict | None = None) -> FaceEmbedding:
        item = FaceEmbedding(
            person_id=person_id or uuid4().hex,
            name=name,
            vector=self._normalize(vector),
            metadata=metadata or {},
        )
        self.items.append(item)
        self.save()
        return item

    def people(self) -> list[dict[str, str | int]]:
        seen: dict[str, dict[str, str | int]] = {}
        for item in self.items:
            current = seen.setdefault(item.person_id, {"person_id": item.person_id, "name": item.name, "samples": 0})
            current["samples"] = int(current["samples"]) + 1
        return sorted(seen.values(), key=lambda item: str(item["name"]).casefold())

    def remove_person(self, person_id: str) -> int:
        before = len(self.items)
        self.items = [item for item in self.items if item.person_id != person_id]
        removed = before - len(self.items)
        if removed:
            self.save()
        return removed

    def search(self, vector: np.ndarray) -> tuple[FaceEmbedding | None, float]:
        if not self.items:
            return None, 0.0

        probe = self._normalize(vector)
        matrix = np.stack([item.vector for item in self.items])
        scores = matrix @ probe
        index = int(np.argmax(scores))
        return self.items[index], float(scores[index])

    @staticmethod
    def _normalize(vector: np.ndarray) -> np.ndarray:
        value = np.asarray(vector, dtype=np.float32)
        norm = np.linalg.norm(value)
        if norm == 0:
            return value
        return value / norm
