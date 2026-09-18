import ts from "typescript";
import { expect, it } from "vitest";
import { computed, ref } from "vue";
import source from "./header.vue?raw";

it("keeps guest tools accessible while hiding only the empty Windows workspace bar", () => {
  const desktop = ref(true);
  const isWindows = ref(true);
  const loggedIn = ref(false);
  const focusMode = ref(false);
  const tabs = ref<object[]>([]);
  const path = ref("/");
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!;
  const { outputText } = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const scope = {
    exports: {},
    require: () => ({ useUserInfoStore: () => ({ loggedIn }) }),
    computed,
    storeToRefs: (store: unknown) => store,
    useRouter: () => ({ currentRoute: computed(() => ({ path: path.value })) }),
    useLocalePath: () => (value: unknown) => value,
    useI18n: () => ({ t: (key: string) => key }),
    usePlatform: () => ({ isMacOS: computed(() => !isWindows.value), isWindows }),
    useWorkspaceMode: () => ({ activeWorkspaceMode: ref("assets") }),
    useWorkspaceTabs: () => ({ focusMode, tabs, workspaceFullscreen: ref(false) }),
    isDesktopRuntime: () => desktop.value
  };
  const header = new Function(
    ...Object.keys(scope),
    `${outputText}; return { showTitleBarMenu, showWorkspaceHeader };`
  )(...Object.values(scope));

  expect(header.showTitleBarMenu.value).toBe(true);
  expect(header.showWorkspaceHeader.value).toBe(false);
  for (const tool of ["/videoplayer", "/tools", "/transcode", "/face"]) {
    path.value = tool;
    expect(header.showWorkspaceHeader.value).toBe(true);
  }
  path.value = "/";
  tabs.value = [{}];
  expect(header.showWorkspaceHeader.value).toBe(true);
  focusMode.value = true;
  expect(header.showWorkspaceHeader.value).toBe(false);
  focusMode.value = false;
  tabs.value = [];
  loggedIn.value = true;
  expect(header.showTitleBarMenu.value).toBe(false);
  expect(header.showWorkspaceHeader.value).toBe(true);
  loggedIn.value = false;
  desktop.value = false;
  expect(header.showTitleBarMenu.value).toBe(false);
  expect(header.showWorkspaceHeader.value).toBe(true);
  desktop.value = true;
  isWindows.value = false;
  expect(header.showTitleBarMenu.value).toBe(false);
  expect(header.showWorkspaceHeader.value).toBe(true);
});
