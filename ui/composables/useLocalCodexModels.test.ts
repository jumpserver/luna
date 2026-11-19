import { afterEach, expect, it, vi } from "vitest";
import { computed, effectScope, shallowRef } from "vue";
import { useLocalCodexModels } from "./useLocalCodexModels";
import { DEFAULT_CODEX_SETTINGS } from "~/shared/codex/types";
import type { LocalCodexModel } from "~/shared/codex/types";
import { LocalAiError } from "~/shared/codex/errorProtocol";

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.useRealTimers();
});
const entry: LocalCodexModel = { id: "available-model", name: "Available", isDefault: true };

it("automatically loads either connection after input settles, and ignores superseded results", async () => {
  vi.useFakeTimers();
  const draft = shallowRef({ ...DEFAULT_CODEX_SETTINGS });
  const first = Promise.withResolvers<LocalCodexModel[]>();
  const fetchModels = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce([entry]);
  const scope = effectScope();
  scopes.push(scope);
  const catalog = scope.run(() => useLocalCodexModels(() => draft.value, fetchModels))!;
  await vi.advanceTimersByTimeAsync(500);
  expect(fetchModels).toHaveBeenCalledTimes(1);
  draft.value = { ...draft.value, connection: "existing" };
  await vi.advanceTimersByTimeAsync(500);
  expect(fetchModels).toHaveBeenCalledTimes(2);
  first.resolve([{ ...entry, id: "obsolete-model" }]);
  await Promise.resolve();
  expect(catalog.models.value).toEqual([entry]);
});

it("waits for a ready connection, allows refresh after failure, and stops on disposal", async () => {
  vi.useFakeTimers();
  const ready = shallowRef(false);
  const draft = computed(() => (ready.value ? { ...DEFAULT_CODEX_SETTINGS } : null));
  const failure = new LocalAiError("LOCAL_AI_PROVIDER_ERROR", "Future provider wording", {
    status: 401,
    providerCode: "invalid_api_key"
  });
  const fetchModels = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce([entry]);
  const scope = effectScope();
  scopes.push(scope);
  const catalog = scope.run(() => useLocalCodexModels(() => draft.value, fetchModels))!;
  await vi.advanceTimersByTimeAsync(500);
  expect(fetchModels).not.toHaveBeenCalled();
  ready.value = true;
  await vi.advanceTimersByTimeAsync(500);
  expect(catalog.error.value).toBe(failure);
  await catalog.refresh();
  expect(catalog.models.value).toEqual([entry]);
  ready.value = false;
  expect(catalog.models.value).toEqual([]);
  ready.value = true;
  scope.stop();
  await vi.advanceTimersByTimeAsync(500);
  expect(fetchModels).toHaveBeenCalledTimes(2);
});
