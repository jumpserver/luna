import { afterEach, expect, it, vi } from "vitest";
import type { WorkspacePane } from "./useWorkspaceTabs";
import { captureWorkspaceClipboardTarget, registerWorkspaceClipboardSurface } from "./useWorkspaceClipboardPaste";

const disposers: Array<() => void> = [];
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

function createInput(ownerDocument: { activeElement: HTMLElement | null }) {
  const element = {
    ownerDocument,
    isConnected: true,
    contains: (target: unknown) => target === element,
    getClientRects: () => [{}],
    focus: () => {
      ownerDocument.activeElement = element;
    },
    blur: () => {
      ownerDocument.activeElement = null;
    }
  } as unknown as HTMLElement;
  return element;
}

function setup() {
  const pane = { id: "pane", assetName: "server", status: "connected" } as WorkspacePane;
  const ownerDocument = { activeElement: null as HTMLElement | null };
  const input = createInput(ownerDocument);
  const otherInput = createInput(ownerDocument);
  const root = {
    ownerDocument,
    contains: (target: unknown) => target === input || target === otherInput
  } as HTMLElement;
  const paste = vi.fn(() => "pasted" as const);
  const otherPaste = vi.fn(() => "pasted" as const);
  const register = () =>
    registerWorkspaceClipboardSurface(input, () => ({
      terminal: true,
      mode: "paste",
      paste,
      focus: () => input.focus()
    }));
  const unregister = register();
  disposers.push(unregister);
  disposers.push(
    registerWorkspaceClipboardSurface(otherInput, () => ({
      terminal: false,
      mode: "paste",
      paste: otherPaste,
      focus: () => otherInput.focus()
    }))
  );
  let current = true;
  input.focus();
  const target = captureWorkspaceClipboardTarget(pane, root, () => current)!;
  return {
    pane,
    root,
    input,
    otherInput,
    paste,
    otherPaste,
    target,
    unregister,
    register,
    switchPane: () => (current = false)
  };
}

it("captures only the focused surface and keeps its target while the picker takes focus", async () => {
  const state = setup();
  state.otherInput.focus();
  expect(await state.target.paste("line one\nline two")).toBe("pasted");
  expect(state.paste).toHaveBeenCalledExactlyOnceWith("line one\nline two");
  expect(state.otherPaste).not.toHaveBeenCalled();
  state.target.focus();
  expect(state.input.ownerDocument.activeElement).toBe(state.input);
});

it("rejects a switched or disconnected pane and does not redirect input", async () => {
  const switched = setup();
  switched.switchPane();
  expect(await switched.target.paste("text")).toBe("unavailable");
  expect(switched.paste).not.toHaveBeenCalled();
  const disconnected = setup();
  disconnected.pane.status = "disconnected";
  expect(await disconnected.target.paste("text")).toBe("unavailable");
  expect(disconnected.paste).not.toHaveBeenCalled();
});

it("does not reuse a captured target after the connector has been replaced", async () => {
  const state = setup();
  state.unregister();
  disposers.push(state.register());
  expect(await state.target.paste("text")).toBe("unavailable");
  expect(state.paste).not.toHaveBeenCalled();
});

it("rechecks token paste permissions and ignores focus outside the pane", async () => {
  const state = setup();
  state.pane.payload = { actions: ["copy"] };
  expect(await state.target.paste("text")).toBe("denied");
  expect(state.paste).not.toHaveBeenCalled();
  state.input.blur();
  expect(captureWorkspaceClipboardTarget(state.pane, state.root, () => true)).toBeNull();
});
