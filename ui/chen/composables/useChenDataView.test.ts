import { describe, expect, it } from "vitest";
import { mergeChenDataViewTiming, startChenDataViewTiming } from "~/chen/composables/useChenDataView";

describe("chen data view timing", () => {
  it("records client elapsed time when a request completes", () => {
    const state = {};
    startChenDataViewTiming(state, 1_000);
    expect(mergeChenDataViewTiming(state, { loading: false }, 1_275)).toEqual({ loading: false, durationMs: 275 });
  });

  it("keeps the start time through loading state updates", () => {
    expect(mergeChenDataViewTiming({ requestStartedAt: 1_000 }, { loading: true }, 1_100)).toEqual({
      loading: true,
      requestStartedAt: 1_000
    });
  });

  it("prefers an explicit server duration", () => {
    expect(
      mergeChenDataViewTiming({ requestStartedAt: 1_000 }, { loading: false, execution_time_ms: 42 }, 1_500)
    ).toMatchObject({ durationMs: 42 });
  });

  it("keeps a completed duration across later state updates", () => {
    expect(mergeChenDataViewTiming({ durationMs: 85 }, { loading: false })).toEqual({
      loading: false,
      durationMs: 85
    });
  });
});
