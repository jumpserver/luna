import type { WorkspaceTerminalTarget, WorkspaceTerminalTask } from "~/composables/useWorkspaceTerminalTasks";
import ts from "typescript";
import { afterEach, expect, it } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import * as terminal from "#koko/composables/terminal/useTerminalAiSessions";
import { resolveWorkspaceTerminalTarget } from "~/composables/useWorkspaceTerminalTasks";
import { terminalAiPanelDomain } from "./ai/domains/terminal/adapter";
import source from "./WorkspaceAssistantPanel.vue?raw";

const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: "workspace-terminal-policy", inlineTemplate: true });
const { outputText } = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext }
});
const cleanups: Array<() => void> = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
);

function mountPanel() {
  const first = terminal.registerKokoTerminalAiSession("mode-first", { readyState: WebSocket.OPEN } as WebSocket, "1")!;
  const second = terminal.registerKokoTerminalAiSession(
    "mode-second",
    { readyState: WebSocket.OPEN } as WebSocket,
    "2"
  )!;
  cleanups.push(() => {
    terminal.unregisterKokoTerminalAiSession(first.paneId);
    terminal.unregisterKokoTerminalAiSession(second.paneId);
  });
  first.backgroundExec = true;
  second.backgroundExec = true;
  const targets = Vue.shallowRef<WorkspaceTerminalTarget[]>(
    [first, second].map((session) => ({
      target_id: session.paneId,
      pane_id: session.paneId,
      session_id: session.paneId,
      label: session.paneId,
      asset_name: session.paneId,
      address: "",
      account: "root",
      protocol: "ssh",
      available: true,
      busy: false
    }))
  );
  const activePaneId = Vue.shallowRef(first.paneId);
  const assistant = Vue.shallowRef(
    Vue.shallowReactive({
      target: "auto",
      enabled: true,
      agent: { state: {} },
      terminalTasks: Vue.shallowReactive<WorkspaceTerminalTask[]>([]),
      taskActive: false,
      runContext: null as { default_terminal_target: WorkspaceTerminalTarget | null } | null
    })
  );
  const globals = {
    computed: Vue.computed,
    reactive: Vue.reactive,
    watch: Vue.watch,
    useI18n: () => ({ t: (key: string) => key }),
    useWorkspaceTabs: () => ({ activePaneId, activeTab: Vue.shallowRef(null) }),
    useAiPanel: () => ({ pendingTerminalPrompt: Vue.shallowRef(null) })
  };
  const services = {
    ...terminal,
    terminalAiPanelDomain,
    resolveWorkspaceTerminalTarget,
    useWorkspaceAssistantRuntime: () => ({}),
    useWorkspaceAssistantPanelSession: () => ({ session: assistant, scopeId: Vue.shallowRef("scope") }),
    isWorkspaceAssistantBusy: () => false,
    workspaceAssistantMessages: () => [],
    workspaceAssistantTerminalTargets: () => targets.value,
    useAiConnectionNotice: () => ({
      noticeKey: Vue.shallowRef(""),
      statusKey: Vue.shallowRef(""),
      blocked: Vue.shallowRef(false)
    })
  };
  let composer!: {
    executionMode: string;
    modeOptions: Array<{ value: string; disabled?: boolean }>;
    showPolicy: boolean;
    contextItems: Array<{ label: string }>;
  };
  let updateMode!: (value: string) => void;
  const composerComponent = Vue.defineComponent({
    props: ["executionMode", "modeOptions", "showPolicy", "contextItems"],
    emits: ["updateExecutionMode"],
    setup(props, { emit }) {
      composer = props as typeof composer;
      updateMode = (value) => emit("updateExecutionMode", value);
      return () => null;
    }
  });
  const emptyComponent = { render: () => null };
  const component = new Function(
    "require",
    ...Object.keys(globals),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )(
    (name: string) => {
      if (name === "vue") return Vue;
      if (name.endsWith(".vue"))
        return { __esModule: true, default: name.endsWith("AiComposer.vue") ? composerComponent : emptyComponent };
      return services;
    },
    ...Object.values(globals)
  );
  const renderer = Vue.createRenderer({
    insert() {},
    remove() {},
    patchProp() {},
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText() {},
    setElementText() {},
    parentNode: () => null,
    nextSibling: () => null
  });
  const app = renderer.createApp(component);
  for (const name of ["UButton", "UIcon", "UTooltip", "USelect", "UEmpty", "UAlert"])
    app.component(name, emptyComponent);
  cleanups.push(() => app.unmount());
  app.mount({});
  return { first, second, targets, activePaneId, assistant, composer, updateMode };
}

it("binds execution options and updates to the selected terminal session", async () => {
  const panel = mountPanel();
  expect(panel.composer.modeOptions.map((option) => option.value)).toEqual(["auto", "pty", "background"]);
  panel.updateMode("pty");
  await Vue.nextTick();
  expect(panel.first.executionMode).toBe("pty");
  expect(panel.second.executionMode).toBe("auto");
  expect(panel.composer.executionMode).toBe("pty");

  panel.assistant.value.target = panel.second.paneId;
  await Vue.nextTick();
  expect(panel.composer.executionMode).toBe("auto");
  panel.updateMode("background");
  await Vue.nextTick();
  expect(panel.first.executionMode).toBe("pty");
  expect(panel.second.executionMode).toBe("background");

  panel.assistant.value.target = "auto";
  panel.activePaneId.value = panel.second.paneId;
  await Vue.nextTick();
  expect(panel.composer.executionMode).toBe("background");
  panel.assistant.value.target = "workspace";
  await Vue.nextTick();
  expect(panel.composer.showPolicy).toBe(false);
  expect(panel.composer.modeOptions).toEqual([]);
  panel.updateMode("pty");
  expect(panel.second.executionMode).toBe("background");
});

it.each(["pty", "background"])("keeps unsupported %s execution disabled", async (mode) => {
  const panel = mountPanel();
  panel.first.ptyExec = false;
  panel.first.backgroundExec = false;
  await Vue.nextTick();
  expect(panel.composer.modeOptions.find((option) => option.value === mode)?.disabled).toBe(true);
  panel.updateMode(mode);
  expect(panel.first.executionMode).toBe("auto");
});

it.each(["running", "waiting_approval"] as const)(
  "keeps the %s task terminal bound across focus changes",
  async (status) => {
    const panel = mountPanel();
    panel.first.executionMode = "pty";
    panel.first.backgroundExec = false;
    panel.second.executionMode = "background";
    const task = Vue.shallowReactive<WorkspaceTerminalTask>({
      id: "task-1",
      prompt: "Inspect the terminal",
      target: panel.targets.value[0]!,
      session: panel.first,
      messages: [],
      status,
      error: "",
      active: true
    });
    panel.assistant.value.terminalTasks.push(task);
    panel.activePaneId.value = panel.second.paneId;
    await Vue.nextTick();

    expect(panel.composer.contextItems[0]?.label).toBe(`@${panel.first.paneId}`);
    expect(panel.composer.executionMode).toBe("pty");
    expect(panel.composer.modeOptions.find((option) => option.value === "background")?.disabled).toBe(true);
    panel.updateMode("background");
    expect(panel.first.executionMode).toBe("pty");
    panel.updateMode("auto");
    expect(panel.first.executionMode).toBe("auto");
    expect(panel.second.executionMode).toBe("background");

    task.active = false;
    await Vue.nextTick();
    expect(panel.composer.contextItems[0]?.label).toBe(`@${panel.second.paneId}`);
    expect(panel.composer.executionMode).toBe("background");
    panel.updateMode("pty");
    expect(panel.second.executionMode).toBe("pty");
    expect(panel.first.executionMode).toBe("auto");
  }
);

it("uses the captured run target before a terminal task is created", async () => {
  const panel = mountPanel();
  panel.first.executionMode = "pty";
  panel.assistant.value.runContext = { default_terminal_target: panel.targets.value[0]! };
  panel.assistant.value.taskActive = true;
  panel.activePaneId.value = panel.second.paneId;
  await Vue.nextTick();

  expect(panel.composer.executionMode).toBe("pty");
  panel.updateMode("background");
  expect(panel.first.executionMode).toBe("background");
  expect(panel.second.executionMode).toBe("auto");
});

it("does not fall back to the focused terminal when the captured target disappears", async () => {
  const panel = mountPanel();
  panel.assistant.value.runContext = { default_terminal_target: panel.targets.value[0]! };
  panel.assistant.value.taskActive = true;
  panel.activePaneId.value = panel.second.paneId;
  panel.targets.value = [panel.targets.value[1]!];
  await Vue.nextTick();

  expect(panel.composer.showPolicy).toBe(false);
  expect(panel.composer.modeOptions).toEqual([]);
  panel.updateMode("pty");
  expect(panel.second.executionMode).toBe("auto");
});
