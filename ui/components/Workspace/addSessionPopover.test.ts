import ts from "typescript";
import { expect, it, vi } from "vitest";
import { computed, nextTick, ref, watch } from "vue";
import source from "./addSessionPopover.vue?raw";
import layout from "../../layouts/default.vue?raw";

it("opens the existing picker after leaving focus/tools, and starts a shell only after selection", async () => {
  const handlers = new Map<string, () => void>();
  const bus = {
    on: (name: string, handler: () => void) => handlers.set(name, handler),
    emit: (name: string) => handlers.get(name)?.()
  };
  const openLocalShell = vi.fn();
  const focusMode = ref(true);
  const activeWorkspaceMode = ref("tools");
  const exitFocusMode = vi.fn(async () => {
    focusMode.value = false;
  });
  const navigateTo = vi.fn(async () => {
    activeWorkspaceMode.value = "assets";
  });
  const closeSettings = vi.fn();
  const setSidebarCollapsed = vi.fn();
  const scope = {
    exports: {},
    require: () => ({ useUserInfoStore: () => ({}) }),
    ref,
    computed,
    watch,
    nextTick,
    focusMode,
    activeWorkspaceMode,
    exitFocusMode,
    navigateTo,
    closeSettings,
    setSidebarCollapsed,
    useEventBus: () => bus,
    useAssetTree: () => ({}),
    useRecentConnections: () => ({ recentConnections: ref([]) }),
    useSavedSessionGroups: () => ({ savedGroups: ref([]) }),
    useWorkspaceTabs: () => ({ openLocalShell }),
    useI18n: () => ({ t: (key: string) => key }),
    useToast: () => ({}),
    useAppShortcuts: () => ({}),
    isDesktopRuntime: () => true,
    useDebounceFn: (fn: unknown) => fn
  };
  const script = source.match(/<script setup lang="ts">([^]*?)<\/script>/)![1];
  const functions = ["openNewSession", "openAssetWorkspace"].map(
    (name) => layout.match(new RegExp(`^async function ${name}\\([^]*?^}`, "m"))![0]
  );
  const { outputText } = ts.transpileModule(`${script}\n${functions.join("\n")}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
  const picker = new Function(
    ...Object.keys(scope),
    `${outputText}; return { open, openNewSession, selectLocalShell };`
  )(...Object.values(scope));

  expect(picker.open.value).toBe(false);
  await picker.openNewSession();
  expect(exitFocusMode).toHaveBeenCalledOnce();
  expect(closeSettings).toHaveBeenCalledOnce();
  expect(navigateTo).toHaveBeenCalledWith("/");
  expect(setSidebarCollapsed).toHaveBeenCalledWith(false);
  expect(picker.open.value).toBe(true);
  expect(openLocalShell).not.toHaveBeenCalled();
  picker.selectLocalShell();
  expect(picker.open.value).toBe(false);
  expect(openLocalShell).toHaveBeenCalledExactlyOnceWith("AddSession.LocalShell");
});
