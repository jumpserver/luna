import assert from "node:assert/strict";
import test from "node:test";
import { isFaceLiveWebSocket } from "../src/face/socket-policy.ts";

test("allows only the active JumpServer site's FaceLive WebSocket", () => {
  assert.equal(
    isFaceLiveWebSocket("wss://jump.example/tenant/ws/facelive/capture/?token=test", "https://jump.example"),
    true
  );
  assert.equal(isFaceLiveWebSocket("ws://127.0.0.1:8080/ws/facelive/capture/", "http://127.0.0.1:8080"), true);
  assert.equal(isFaceLiveWebSocket("wss://other.example/ws/facelive/capture/", "https://jump.example"), false);
  assert.equal(isFaceLiveWebSocket("wss://jump.example/ws/facelive-evil/capture/", "https://jump.example"), false);
  assert.equal(isFaceLiveWebSocket("wss://jump.example/koko/ws/", "https://jump.example"), false);
});
