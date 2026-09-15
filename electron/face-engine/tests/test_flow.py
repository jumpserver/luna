from types import SimpleNamespace

import numpy as np

from faceliveplus.challenge import ChallengeState
from faceliveplus.enrollment import EnrollmentSession
from faceliveplus.flow import FaceFlowSession
from faceliveplus.types import FaceCandidate, LivenessResult, RecognitionMatch, RecognitionResult


class PassingChallenge:
    def update(self, _face, _now):
        return ChallengeState(
            challenge="shake_head",
            text="请左右摇头",
            passed=True,
            score=1.0,
            reason="test",
            remaining_seconds=8.0,
        )


def result(person_id="person-1", *, live=True, matched=True):
    face = FaceCandidate(
        bbox=(10, 10, 110, 110),
        landmarks=np.zeros((5, 2), dtype=np.float32),
        pose_landmarks=None,
        pose=(0.0, 0.0, 0.0),
        embedding=np.ones(512, dtype=np.float32),
        aligned_face=None,
        detection_score=0.99,
        liveness=LivenessResult(live, 0.95 if live else 0.1, "test"),
    )
    return RecognitionResult(
        face=face,
        match=RecognitionMatch(
            person_id=person_id,
            name="Alice",
            similarity=0.91,
            is_match=matched,
        ),
    )


def test_auth_requires_target_liveness_and_challenge():
    session = FaceFlowSession(
        mode="auth",
        target_id="person-1",
        target_name="Alice",
        timeout_seconds=10,
        started_at=0.0,
        challenge=PassingChallenge(),
    )

    pending = session.update([result(live=False, matched=False)], now=1.0)
    assert pending["status"] == "authenticating"

    success = session.update([result()], now=2.0)
    assert success["status"] == "auth_success"
    assert success["finished"] is True
    assert success["events"][0]["event"] == "auth_success"


def test_monitor_runs_liveness_once_then_emits_away_and_return_events():
    session = FaceFlowSession(
        mode="monitor",
        target_id="person-1",
        target_name="Alice",
        timeout_seconds=10,
        away_after_seconds=3,
        started_at=0.0,
        challenge=PassingChallenge(),
    )

    initialized = session.update([result()], now=1.0)
    assert initialized["status"] == "monitor_started"
    assert session.phase == "monitoring"
    assert session.enforce_liveness is False

    warning = session.update([], now=2.0)
    assert warning["events"][0]["event"] == "monitor_away_warning"

    timeout = session.update([], now=5.1)
    assert timeout["events"][0]["event"] == "monitor_away_timeout"

    repeated = session.update([], now=7.0)
    assert repeated["events"] == []

    returned = session.update([result(live=False, matched=True)], now=8.0)
    assert returned["status"] == "monitoring"
    assert returned["events"][0]["event"] == "monitor_returned"


def test_enrollment_collects_samples_only_after_liveness_and_action():
    saved = []

    class Engine:
        def register_candidate(self, name, candidate, person_id=None):
            saved.append((name, candidate, person_id))
            return SimpleNamespace(person_id=person_id or "person-1")

    session = EnrollmentSession(
        name="Alice",
        timeout_seconds=10,
        required_samples=2,
        started_at=0.0,
        challenge=PassingChallenge(),
    )

    pending = session.update(Engine(), [result(live=False, matched=False)], now=0.1)
    assert pending["status"] == "enrolling"
    assert saved == []

    session.update(Engine(), [result()], now=0.4)
    complete = session.update(Engine(), [result()], now=0.7)
    assert complete["status"] == "enrollment_complete"
    assert complete["person_id"] == "person-1"
    assert len(saved) == 2
