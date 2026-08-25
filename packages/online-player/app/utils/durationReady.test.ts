import { describe, expect, it } from "vitest";
import { createDurationGate } from "#online-player/utils/durationReady";

describe("createDurationGate", () => {
  it("stays closed while duration is still growing", () => {
    const gate = createDurationGate(1000);
    gate.note(100, 0);
    expect(gate.isSettled(500)).toBe(false);
    gate.note(200, 500);
    gate.note(300, 900);
    expect(gate.isSettled(1600)).toBe(false);
  });

  it("opens after duration stops changing for the settle window", () => {
    const gate = createDurationGate(1000);
    gate.note(400, 0);
    expect(gate.isSettled(999)).toBe(false);
    expect(gate.isSettled(1000)).toBe(true);
  });

  it("resets after a new source starts", () => {
    const gate = createDurationGate(1000);
    gate.note(400, 0);
    expect(gate.isSettled(1000)).toBe(true);
    gate.reset();
    expect(gate.isSettled(2000)).toBe(false);
  });
});
