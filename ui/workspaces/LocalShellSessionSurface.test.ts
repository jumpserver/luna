import type { WorkspaceClipboardSurfaceTarget } from "~/composables/useWorkspaceClipboardPaste";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import source from "./LocalShellSessionSurface.vue?raw";

async function setupSurface() {
  let input!: (data: string) => void;
  let capture!: () => WorkspaceClipboardSurfaceTarget;
  const terminal = {
    cols: 80,
    rows: 24,
    loadAddon() {},
    open() {},
    focus() {},
    onResize() {},
    onData(handler: typeof input) {
      input = handler;
    },
    paste: vi.fn((text: string) => input(`\x1b[200~${text}\x1b[201~`))
  };
  const write = vi.fn(async (_sessionId: string, _data: string) => {});
  const services = {
    Terminal: class {
      constructor() {
        return terminal;
      }
    },
    FitAddon: class {
      fit() {}
    },
    ResizeObserver: class {
      observe() {}
    },
    desktopLocalShell: {
      start: async () => {},
      resize: async () => {},
      onOutput: async () => vi.fn(),
      onExit: async () => vi.fn(),
      write
    },
    registerWorkspaceClipboardSurface: (_element: HTMLElement, getTarget: typeof capture) => {
      capture = getTarget;
      return vi.fn();
    },
    registerLocalShellTerminalSession: vi.fn(),
    getDefaultTerminalConfig: () => ({}),
    appTerminalTheme: () => ({}),
    syncXtermBackground: vi.fn(),
    defineProps: () => ({ tab: { id: "local-pane" } }),
    defineExpose: vi.fn(),
    useWorkspaceTabs: () => ({ markSessionConnected: vi.fn() }),
    useI18n: () => ({ t: (key: string) => key }),
    useSettingManager: () => ({ codeFontSize: shallowRef(14) }),
    isDesktopRuntime: () => true,
    useDebounceFn: (fn: () => void) => fn,
    onMounted: vi.fn(),
    onBeforeUnmount: vi.fn(),
    watch: vi.fn(),
    shallowRef
  };
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!;
  const { outputText } = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const surface = new Function(
    "require",
    ...Object.keys(services),
    `const exports = {};\n${outputText}\nreturn { start, containerRef };`
  )(() => services, ...Object.values(services));
  surface.containerRef.value = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
  await surface.start();
  return { target: capture(), input, terminal, write };
}

it.each([false, true])("waits for the history paste's own IPC write (reject: %s)", async (reject) => {
  const { target, input, terminal, write } = await setupSurface();
  input("ordinary typing before paste");
  const pendingWrite = Promise.withResolvers<void>();
  write.mockReturnValueOnce(pendingWrite.promise);
  const completed = vi.fn();
  const paste = Promise.resolve(target.paste("history text")).then(completed);
  input("ordinary typing while paste is pending");
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  expect(terminal.paste).toHaveBeenCalledExactlyOnceWith("history text");
  expect(write).toHaveBeenNthCalledWith(2, "local-pane", "\x1b[200~history text\x1b[201~");

  if (reject) {
    const rejected = expect(paste).rejects.toThrow("Shell session closed");
    pendingWrite.reject(new Error("Shell session closed"));
    await rejected;
    expect(completed).not.toHaveBeenCalled();
  } else {
    pendingWrite.resolve();
    await paste;
    expect(completed).toHaveBeenCalledExactlyOnceWith("pasted");
  }
});
