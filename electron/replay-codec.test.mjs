import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTimeline,
  computeTargetDimensions,
  encodeInstruction,
  GuacamoleParser,
  ReplayRenderer
} from "./replay-codec.mjs";

test("parses byte-length Guacamole instructions", () => {
  const parser = new GuacamoleParser(Buffer.from(encodeInstruction("name", "你好")));
  assert.deepEqual(parser.nextInstruction(), { opcode: "name", args: ["你好"] });
  assert.equal(parser.nextInstruction(), null);
});

test("builds a ten frames-per-second replay timeline", () => {
  const replay = Buffer.from(
    [
      encodeInstruction("size", "0", "1920", "1080"),
      encodeInstruction("sync", "1000"),
      encodeInstruction("sync", "1350")
    ].join("")
  );
  assert.deepEqual(buildTimeline(replay), {
    frames: [1100, 1200, 1300],
    maxWidth: 1920,
    maxHeight: 1080
  });
  assert.deepEqual(computeTargetDimensions(1920, 1080, "p720"), { width: 1280, height: 720 });
});

test("renders fills and copies using the replay layer model", () => {
  const renderer = new ReplayRenderer(() => null, 2, 2);
  renderer.handle({ opcode: "cfill", args: ["0", "0", "10", "20", "30", "255"] });
  renderer.handle({ opcode: "copy", args: ["0", "0", "0", "1", "1", "0", "1", "1", "1"] });
  const frame = renderer.composite();
  assert.deepEqual([...frame.pixels.subarray(0, 4)], [10, 20, 30, 255]);
  assert.deepEqual([...frame.pixels.subarray(12, 16)], [10, 20, 30, 255]);
});
