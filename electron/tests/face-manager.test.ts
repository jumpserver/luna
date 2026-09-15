import assert from "node:assert/strict";
import test from "node:test";
import { faceEngineInternals } from "../src/face/manager.ts";

test("camera allowlist accepts matching labels and rejects other devices", () => {
  const policy = { mode: "allowlist" as const, labelPattern: "JumpCam Pro" };
  const accepted = faceEngineInternals.validateCamera({ deviceId: "camera-1", label: "JumpCam Pro 4K" }, policy, {});
  assert.equal(accepted.matchedBy, "label_pattern");
  assert.throws(
    () => faceEngineInternals.validateCamera({ deviceId: "camera-2", label: "Virtual Camera" }, policy, {}),
    /not allowed/
  );
});

test("managed camera policy cannot be weakened by renderer settings", () => {
  assert.throws(
    () =>
      faceEngineInternals.validateCamera(
        { deviceId: "camera-1", label: "Any Camera" },
        { mode: "any" },
        { JMS_FACE_CAMERA_LABEL_PATTERN: "ApprovedCam" }
      ),
    /not allowed/
  );
});

test("flow action validation rejects credentials and unsafe methods", () => {
  assert.throws(
    () => faceEngineInternals.normalizeAction({ type: "api", url: "https://user:secret@example.com/callback" }),
    /must not contain credentials/
  );
  assert.throws(() => faceEngineInternals.normalizeAction({ type: "method", method: "../run" }), /invalid/);
  assert.deepEqual(faceEngineInternals.normalizeAction({ type: "redirect", url: "/session" }), {
    type: "redirect",
    url: "/session"
  });
});
