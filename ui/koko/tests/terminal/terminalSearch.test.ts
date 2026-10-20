import { SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import source from "../../components/SearchInput/index.vue?raw";
import terminalSource from "../../components/Terminal/index.vue?raw";
import { TerminalMittEvent } from "../../composables/terminal/protocol";
import "@xterm/xterm/css/xterm.css";

const services = {
  ...Vue,
  useI18n: () => ({ t: (key: string) => key }),
  useElementSize: () => ({ width: Vue.ref(0) }),
  useMutationObserver: () => {}
};
function compileComponent(source: string, modules: Record<string, unknown> = {}) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "terminal-search-test", inlineTemplate: true });
  const { outputText } = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
  return new Function(
    "require",
    ...Object.keys(services),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )((name: string) => (name === "vue" ? Vue : modules[name]), ...Object.values(services));
}

const component = compileComponent(source);
const inputComponent = Vue.defineComponent({
  props: ["modelValue", "size"],
  emits: ["update:modelValue"],
  setup(props, { emit, expose }) {
    const inputRef = Vue.ref<HTMLInputElement | null>(null);
    expose({ inputRef });
    return () =>
      Vue.h("input", {
        ref: inputRef,
        value: props.modelValue,
        onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value)
      });
  }
});

it.skipIf(typeof document === "undefined").each(["clear", "close", "unmount"])(
  "clears terminal search decorations and selection on %s, including after more output",
  async (action) => {
    const container = document.createElement("div");
    container.style.cssText = "width: 600px; height: 300px";
    const host = document.createElement("div");
    document.body.append(container, host);
    const terminal = new Terminal({ allowProposedApi: true });
    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    terminal.open(container);
    const open = Vue.ref(true);
    const app = Vue.createApp({
      render: () => (open.value ? Vue.h(component, { searchAddon, onClose: () => (open.value = false) }) : null)
    });
    app.component("UInput", inputComponent);
    app.component("UButton", { render: () => Vue.h("button") });
    app.mount(host);
    const write = (value: string) => new Promise<void>((resolve) => terminal.write(value, resolve));

    try {
      await write("needle one\r\nneedle two\r\n");
      const input = host.querySelector("input")!;
      input.value = "needle";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await Vue.nextTick();
      expect(terminal.getSelection()).toBe("needle");
      await vi.waitFor(() => {
        expect(container.querySelectorAll(".xterm-find-result-decoration").length).toBeGreaterThan(1);
      });

      // Leave the addon's delayed highlight refresh pending when clearing/closing.
      await write("needle three\r\n");
      if (action === "clear") {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (action === "close") {
        host.querySelector<HTMLButtonElement>('button[icon="i-lucide-x"]')!.click();
      } else {
        open.value = false;
      }
      await Vue.nextTick();
      expect(terminal.hasSelection()).toBe(false);
      await vi.waitFor(() => expect(container.querySelector(".xterm-find-result-decoration")).toBeNull());
      await write("needle four\r\n");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(terminal.hasSelection()).toBe(false);
      expect(container.querySelector(".xterm-find-result-decoration")).toBeNull();

      if (action !== "clear") {
        open.value = true;
        await Vue.nextTick();
        expect(host.querySelector("input")!.value).toBe("");
        expect(terminal.hasSelection()).toBe(false);
      }
    } finally {
      app.unmount();
      terminal.dispose();
      host.remove();
      container.remove();
    }
  }
);

it.skipIf(typeof document === "undefined")(
  "focuses search on every OpenSearch event, including after reopening",
  async () => {
    const host = document.createElement("div");
    const terminalInput = document.createElement("textarea");
    document.body.append(host, terminalInput);
    const openSearch = vi.fn();
    const terminalComponent = compileComponent(terminalSource, {
      "@jumpserver/connectors-core": { connectorSessionKey: Symbol("session") },
      "#koko/components/SearchInput/index.vue": { __esModule: true, default: component },
      "#koko/composables/terminal/protocol": { TerminalMittEvent },
      "#koko/composables/terminal/useTerminalEvents": {
        useKokoTerminalEvents: () => ({
          onMittEvent: (event: TerminalMittEvent, callback: () => void) => {
            expect(event).toBe(TerminalMittEvent.OpenSearch);
            openSearch.mockImplementation(callback);
          }
        })
      },
      "#koko/composables/terminal/useTerminalSocket": {
        useKokoTerminalSocket: () => ({
          commandSuggestions: { selectedIndex: Vue.ref(0), open: Vue.ref(false) },
          searchAddon: Vue.shallowRef({ findNext: vi.fn() }),
          containerRef: Vue.ref(null),
          selectionText: Vue.ref(""),
          canUseClipboard: () => false,
          contextMenuVisible: Vue.ref(false),
          contextMenuPosition: Vue.ref({ x: 0, y: 0 }),
          zmodem: { uploadOpen: Vue.ref(false), fileInfo: Vue.ref(null) }
        })
      },
      "#koko/host": { useKokoHostAdapter: () => ({}) }
    });
    const app = Vue.createApp(terminalComponent);
    Object.assign(app.config.globalProperties, { $t: (key: string) => key, unref: Vue.unref });
    app.component("UInput", inputComponent);
    app.component("UButton", { render: () => Vue.h("button") });
    for (const name of ["UModal", "UDropdownMenu", "UIcon"]) app.component(name, { render: () => null });
    app.mount(host);

    try {
      terminalInput.focus();
      openSearch();
      await Vue.nextTick();
      const input = host.querySelector("input")!;
      expect(document.activeElement).toBe(input);
      input.value = "needle";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await Vue.nextTick();

      terminalInput.focus();
      openSearch();
      await Vue.nextTick();
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe("needle");

      host.querySelector<HTMLButtonElement>('button[icon="i-lucide-x"]')!.click();
      await Vue.nextTick();
      terminalInput.focus();
      openSearch();
      await Vue.nextTick();
      expect(document.activeElement).toBe(host.querySelector("input"));
    } finally {
      app.unmount();
      host.remove();
      terminalInput.remove();
    }
  }
);
