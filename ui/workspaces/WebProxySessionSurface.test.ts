import ts from "typescript";
import { expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import source from "./WebProxySessionSurface.vue?raw";

function setupSurface(safeMode = false) {
  const desktopWebProxy = {
    completeVerification: vi.fn(async () => true),
    interactionInput: vi.fn(async () => true),
    setActive: vi.fn(async () => {}),
    setBounds: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    navigate: vi.fn(),
    history: vi.fn(),
    reload: vi.fn()
  };
  const emit = vi.fn();
  const markSessionConnected = vi.fn();
  const closeSession = vi.fn(async () => true);
  // Execute the component's setup without mounting its native Electron view.
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!;
  const { outputText } = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const scope = {
    exports: {},
    require: () => ({ desktopWebProxy }),
    ref,
    computed,
    watch: vi.fn(),
    onMounted: vi.fn(),
    onBeforeUnmount: vi.fn(),
    defineExpose: vi.fn(),
    defineProps: () => ({ tab: { id: "tab", payload: { webProxy: { safeMode } } } }),
    defineEmits: () => emit,
    useWorkspaceTabs: () => ({ activeTabId: ref("tab"), tabs: ref([]), markSessionConnected, closeSession }),
    usePlatform: () => ({}),
    registerWorkspaceSessionCloseGuard: vi.fn(),
    document: { visibilityState: "visible" }
  };
  const surface = new Function(
    ...Object.keys(scope),
    `${outputText}\nreturn { interactivePending, interactiveCanComplete, verificationCollapsed, collapseVerification, resumeVerification, verificationCompletionError, completeVerification, verificationFrame, verificationRenderedRevision, verificationCursor, verificationWaitingMessage, autofillStatus, verificationInputRef, verificationPointer, verificationText, closeView, syncView, viewCreated, contentRef, viewLabel, handleState, preview, error, navigationDisabled, safeMode, history, reload, reconnect };`
  )(...Object.values(scope));
  surface.viewCreated.value = true;
  surface.contentRef.value = {
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 100, width: 100, height: 100 })
  };
  return { surface, desktopWebProxy, emit, markSessionConnected, closeSession };
}

it.each([true, false])(
  "keeps the address read-only with safe mode %s while allowing history and reload",
  async (safeMode) => {
    const { surface, desktopWebProxy } = setupSurface(safeMode);
    surface.handleState({
      label: surface.viewLabel,
      url: "https://example.test/dashboard",
      loading: false,
      error: "",
      autofillPending: false,
      autofillStartedAt: Date.now()
    });
    expect(surface.safeMode.value).toBe(safeMode);
    expect(source).toMatch(/<UInput[^>]+:model-value="addressValue"[^>]+\sreadonly\s/);
    expect(source).not.toContain('@submit.prevent="navigate"');
    expect(desktopWebProxy.navigate).not.toHaveBeenCalled();
    surface.history("back");
    surface.history("forward");
    surface.reload();
    expect(desktopWebProxy.history.mock.calls).toEqual([
      [surface.viewLabel, "back"],
      [surface.viewLabel, "forward"]
    ]);
    expect(desktopWebProxy.reload).toHaveBeenCalledExactlyOnceWith(surface.viewLabel);
  }
);

it("shares recording finalization across concurrent closes and stops view updates immediately", async () => {
  const { surface, desktopWebProxy } = setupSurface();
  const finish = Promise.withResolvers<void>();
  desktopWebProxy.close.mockReturnValue(finish.promise);

  const closed = vi.fn();
  const first = surface.closeView();
  const second = surface.closeView().then(closed);
  await surface.syncView();

  expect(closed).not.toHaveBeenCalled();
  expect(desktopWebProxy.close).toHaveBeenCalledTimes(1);
  expect(desktopWebProxy.setActive.mock.calls).toEqual([[expect.any(String), false]]);
  expect(desktopWebProxy.setBounds).not.toHaveBeenCalled();

  finish.resolve();
  await expect(first).resolves.toBe(true);
  await second;
  expect(closed).toHaveBeenCalledWith(true);
  await surface.closeView();
  expect(desktopWebProxy.close).toHaveBeenCalledTimes(1);
});

it("keeps a safe preview through timeout and only marks the session connected after autofill finishes", async () => {
  const { surface, desktopWebProxy, markSessionConnected } = setupSurface();
  const state = {
    label: surface.viewLabel,
    url: "https://example.test",
    loading: false,
    error: "",
    autofillPending: true,
    autofillStartedAt: Date.now()
  };
  surface.handleState({ ...state, preview: "data:image/jpeg;base64,safe" });
  expect(surface.preview.value).toContain("safe");
  expect(surface.navigationDisabled.value).toBe(true);
  surface.history("back");
  surface.reload();
  expect(desktopWebProxy.navigate).not.toHaveBeenCalled();
  expect(desktopWebProxy.history).not.toHaveBeenCalled();
  expect(desktopWebProxy.reload).not.toHaveBeenCalled();
  expect(markSessionConnected).not.toHaveBeenCalled();

  surface.handleState({ ...state, autofillPending: false, error: "timeout" });
  await surface.syncView();
  expect(surface.preview.value).toContain("safe");
  expect(markSessionConnected).not.toHaveBeenCalled();
  expect(desktopWebProxy.setBounds).not.toHaveBeenCalled();

  surface.handleState({ ...state, autofillPending: false });
  expect(surface.preview.value).toBe("");
  expect(surface.navigationDisabled.value).toBe(false);
  expect(markSessionConnected).toHaveBeenCalledWith("tab");
});

it("finalizes the old view once before requesting a fresh connection", async () => {
  const { surface, desktopWebProxy, emit } = setupSurface();
  const finish = Promise.withResolvers<void>();
  desktopWebProxy.close.mockReturnValue(finish.promise);
  const retry = surface.reconnect();
  await surface.reconnect();
  expect(emit).not.toHaveBeenCalled();
  finish.resolve();
  await retry;
  expect(desktopWebProxy.close).toHaveBeenCalledTimes(1);
  expect(emit).toHaveBeenCalledExactlyOnceWith("reconnect");
});

it("returns by collapsing verification and resumes the same view without closing or submitting", async () => {
  const { surface, desktopWebProxy, closeSession } = setupSurface();
  surface.handleState({
    label: surface.viewLabel,
    autofillPending: true,
    interactivePending: true,
    interactiveCanComplete: true
  });
  surface.verificationFrame.value = { image: "verification", width: 100, height: 100, revision: 1 };
  surface.verificationRenderedRevision.value = 1;
  await surface.syncView();
  await surface.collapseVerification();
  expect(surface.verificationCollapsed.value).toBe(true);
  expect(surface.viewCreated.value).toBe(true);
  expect(desktopWebProxy.setActive).toHaveBeenLastCalledWith(surface.viewLabel, false);
  await surface.completeVerification();
  expect(desktopWebProxy.completeVerification).not.toHaveBeenCalled();
  expect(desktopWebProxy.close).not.toHaveBeenCalled();
  expect(closeSession).not.toHaveBeenCalled();
  await surface.resumeVerification();
  expect(surface.verificationCollapsed.value).toBe(false);
  expect(desktopWebProxy.setActive).toHaveBeenLastCalledWith(surface.viewLabel, true);
  expect(surface.verificationFrame.value.image).toBe("verification");
  expect(desktopWebProxy.close).not.toHaveBeenCalled();
});

it("does not resize a closed view when an earlier activation finishes", async () => {
  const { surface, desktopWebProxy } = setupSurface();
  const activation = Promise.withResolvers<void>();
  desktopWebProxy.setActive.mockReturnValueOnce(activation.promise);

  const syncing = surface.syncView();
  await surface.closeView();
  activation.resolve();
  await syncing;

  expect(desktopWebProxy.setBounds).not.toHaveBeenCalled();
  expect(desktopWebProxy.close).toHaveBeenCalledTimes(1);
});

it("keeps navigation locked and does not mark a manual-verification session as authenticated", () => {
  const { surface, markSessionConnected } = setupSurface();
  const state = {
    label: surface.viewLabel,
    loading: false,
    error: "",
    autofillPending: true,
    interactivePending: true,
    autofillPreviewFrozen: true,
    autofillStartedAt: Date.now()
  };
  surface.handleState(state);
  expect(surface.interactivePending.value).toBe(true);
  expect(surface.navigationDisabled.value).toBe(true);
  expect(markSessionConnected).not.toHaveBeenCalled();
  surface.verificationFrame.value = { image: "verification", width: 100, height: 100, revision: 1 };
  surface.handleState({ ...state, error: "timeout" });
  expect(surface.verificationFrame.value).toBe(null);
  expect(markSessionConnected).not.toHaveBeenCalled();
});

it("maps scaled verification input and cancels an out-of-region release without clicking", () => {
  const { surface, desktopWebProxy } = setupSurface();
  surface.verificationFrame.value = { image: "verification", width: 400, height: 200, revision: 7, cursor: "text" };
  surface.verificationRenderedRevision.value = 7;
  const focus = vi.fn();
  surface.verificationInputRef.value = { focus };
  const image = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn()
  };
  const event = {
    type: "pointerdown",
    button: 0,
    isPrimary: true,
    pointerId: 1,
    currentTarget: image,
    clientX: 100,
    clientY: 100,
    preventDefault: vi.fn()
  };
  surface.verificationPointer(event, "mouseDown");
  expect(surface.verificationCursor.value).toBe("text");
  expect(desktopWebProxy.interactionInput).toHaveBeenLastCalledWith(surface.viewLabel, {
    type: "mouseDown",
    x: 0.5,
    y: 0.5,
    revision: 7
  });
  expect(focus).toHaveBeenCalled();
  surface.verificationPointer({ ...event, type: "pointerup", clientX: 220 }, "mouseUp");
  expect(surface.verificationCursor.value).toBe("default");
  expect(desktopWebProxy.interactionInput).toHaveBeenLastCalledWith(surface.viewLabel, { type: "cancel", revision: 7 });
  // A newly resized frame cannot receive input until its image has loaded.
  surface.verificationFrame.value.revision = 8;
  surface.verificationPointer(event, "mouseDown");
  expect(surface.verificationCursor.value).toBe("default");
  expect(desktopWebProxy.interactionInput).toHaveBeenCalledTimes(2);
});

it("shows login progress after submission and removes the verification panel when login ends", async () => {
  const { surface, desktopWebProxy } = setupSurface();
  const state = {
    label: surface.viewLabel,
    autofillPending: true,
    interactivePending: true,
    interactiveCanComplete: true
  };
  surface.handleState(state);
  expect(surface.verificationWaitingMessage.value).toBe("正在加载验证区域…");
  const submitted = Promise.withResolvers<boolean>();
  desktopWebProxy.completeVerification.mockReturnValueOnce(submitted.promise);
  const completing = surface.completeVerification();
  expect(surface.verificationWaitingMessage.value).toBe("正在登录…");
  surface.autofillStatus.value = "submitted";
  submitted.resolve(true);
  await completing;
  expect(surface.verificationWaitingMessage.value).toBe("正在登录…");
  // A late interactive flag must not reopen the panel after autofill has ended.
  surface.handleState({ ...state, autofillPending: false });
  expect(surface.interactivePending.value).toBe(false);
  expect(surface.interactiveCanComplete.value).toBe(false);
  expect(surface.verificationFrame.value).toBeNull();
});

it("only offers manual completion when enabled by the main process and preserves verification on failure", async () => {
  const { surface, desktopWebProxy, markSessionConnected } = setupSurface();
  await surface.completeVerification();
  expect(desktopWebProxy.completeVerification).not.toHaveBeenCalled();
  const state = {
    label: surface.viewLabel,
    loading: false,
    error: "",
    autofillPending: true,
    interactivePending: true,
    interactiveCanComplete: true
  };
  surface.handleState(state);
  surface.verificationFrame.value = { image: "verification", width: 100, height: 100, revision: 1 };
  desktopWebProxy.completeVerification.mockResolvedValueOnce(false);
  await surface.completeVerification();
  expect(surface.verificationCompletionError.value).toContain("重试");
  expect(surface.error.value).toBe("");
  expect(surface.verificationFrame.value).not.toBeNull();
  await surface.completeVerification();
  expect(surface.verificationCompletionError.value).toBe("");
  expect(desktopWebProxy.close).not.toHaveBeenCalled();
  expect(markSessionConnected).not.toHaveBeenCalled();
  expect(surface.navigationDisabled.value).toBe(true);
  surface.handleState({ ...state, autofillPending: false, interactivePending: false, interactiveCanComplete: false });
  expect(markSessionConnected).toHaveBeenCalledWith("tab");
  expect(surface.verificationFrame.value).toBeNull();
  expect(desktopWebProxy.close).not.toHaveBeenCalled();
});
