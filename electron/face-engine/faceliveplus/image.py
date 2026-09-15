from __future__ import annotations

from pathlib import Path

import numpy as np


def require_cv2():
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("OpenCV 未安装，请执行 pip install opencv-python。") from exc
    return cv2


def read_bgr(path: str | Path) -> np.ndarray:
    cv2 = require_cv2()
    image = cv2.imread(str(path))
    if image is None:
        raise ValueError(f"无法读取图片：{path}")
    return image


def save_bgr(path: str | Path, image: np.ndarray) -> None:
    cv2 = require_cv2()
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    ok = cv2.imwrite(str(target), image)
    if not ok:
        raise ValueError(f"无法保存图片：{target}")


def align_face(image_bgr: np.ndarray, landmarks: np.ndarray, size: int = 112) -> np.ndarray:
    cv2 = require_cv2()
    src = np.asarray(landmarks[:5], dtype=np.float32)
    dst = np.asarray(
        [
            [38.2946, 51.6963],
            [73.5318, 51.5014],
            [56.0252, 71.7366],
            [41.5493, 92.3655],
            [70.7299, 92.2041],
        ],
        dtype=np.float32,
    )
    if size != 112:
        dst *= size / 112
    transform, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.LMEDS)
    if transform is None:
        x1, y1 = np.maximum(src.min(axis=0).astype(int) - 20, 0)
        x2, y2 = np.minimum(src.max(axis=0).astype(int) + 20, [image_bgr.shape[1], image_bgr.shape[0]])
        return cv2.resize(image_bgr[y1:y2, x1:x2], (size, size))
    return cv2.warpAffine(image_bgr, transform, (size, size), borderValue=0)


def draw_debug(image_bgr: np.ndarray, results, *, draw_bbox: bool, draw_landmarks: bool, draw_liveness: bool) -> np.ndarray:
    cv2 = require_cv2()
    output = image_bgr.copy()
    for result in results:
        face = result.face
        match = result.match
        x1, y1, x2, y2 = face.bbox
        is_live = face.liveness.is_live if face.liveness else True
        color = (40, 180, 80) if match.is_match and is_live else (40, 80, 220)

        if draw_bbox:
            cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                output,
                f"{match.name} {match.similarity:.2f}",
                (x1, max(20, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
                cv2.LINE_AA,
            )

        if draw_landmarks and face.landmarks is not None:
            for point in face.landmarks.astype(int):
                cv2.circle(output, tuple(point), 2, (255, 180, 0), -1)

        if draw_liveness and face.liveness is not None:
            cv2.putText(
                output,
                f"live={face.liveness.score:.2f} {face.liveness.reason}",
                (x1, min(output.shape[0] - 10, y2 + 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
                cv2.LINE_AA,
            )
    return output
