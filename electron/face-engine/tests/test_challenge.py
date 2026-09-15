import numpy as np

from faceliveplus.challenge import ActionChallenge
from faceliveplus.types import FaceCandidate


def make_face(nose_x: float, *, bbox=(0, 0, 100, 100)) -> FaceCandidate:
    points = np.asarray(
        [
            [30.0 + bbox[0], 34.0],
            [70.0 + bbox[0], 34.0],
            [nose_x, 52.0],
            [38.0 + bbox[0], 74.0],
            [62.0 + bbox[0], 74.0],
        ],
        dtype=np.float32,
    )
    return FaceCandidate(
        bbox=bbox,
        landmarks=points,
        pose_landmarks=None,
        pose=None,
        embedding=np.zeros(512, dtype=np.float32),
        aligned_face=None,
        detection_score=1.0,
    )


def test_shake_head_requires_real_two_direction_pose_change():
    challenge = ActionChallenge(challenge="shake_head", timeout_seconds=20.0)
    state = None
    for index, nose_x in enumerate([50.0, 43.0, 39.0, 50.0, 57.0, 61.0]):
        state = challenge.update(make_face(nose_x), now=float(index))
    assert state is not None
    assert state.passed


def test_shake_head_ignores_whole_face_translation():
    challenge = ActionChallenge(challenge="shake_head", timeout_seconds=20.0)
    state = None
    for index, bbox_x in enumerate([0, 8, 16, 24, 32, 40]):
        bbox = (bbox_x, 0, bbox_x + 100, 100)
        state = challenge.update(make_face(bbox_x + 50.0, bbox=bbox), now=float(index))
    assert state is not None
    assert not state.passed
    assert state.score < 0.6
