import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { useEventListener } from "@vueuse/core";
import { compileScript, parse } from "vue/compiler-sfc";
import source from "./clipboardHistory.vue?raw";

const { descriptor } = parse(source);
const script = compileScript(descriptor, { id: "clipboard-history-test", inlineTemplate: true });
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

async function key(key: string, options: KeyboardEventInit = {}, type = "keydown") {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...options });
  (document.activeElement || window).dispatchEvent(event);
  await Vue.nextTick();
  await Vue.nextTick();
  return event;
}

async function mountHistory(texts = ["first clip", "second clip"]) {
  const paste = vi.fn(async () => "pasted");
  const writeText = vi.fn(async () => {});
  const services = {
    ...Vue,
    useEventListener,
    useI18n: () => ({ t: (key: string) => key, locale: Vue.ref("en") }),
    usePlatform: () => ({ isMacOS: Vue.ref(true) }),
    useRoute: () => ({ fullPath: "/" }),
    useToast: () => ({ add: vi.fn() }),
    useAppShortcuts: () => ({
      blocked: () => false,
      matches: (_id: string, event: KeyboardEvent) => event.code === "KeyH" && event.metaKey && event.shiftKey
    }),
    useWorkspaceClipboardPaste: () => ({
      captureTarget: () => ({ terminal: true, mode: "paste", paste, focus: vi.fn() })
    }),
    desktopClipboard: {
      history: async () => texts.map((text, index) => ({ id: String(index), text, copiedAt: 0 })),
      historyStatus: async () => ({ enabled: true }),
      writeText
    }
  };
  const component = new Function(
    "require",
    ...Object.keys(services),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )((name: string) => (name === "vue" ? Vue : services), ...Object.values(services));
  const host = document.createElement("div");
  document.body.append(host);
  const app = Vue.createApp(component);
  app.component(
    "UModal",
    Vue.defineComponent({
      props: ["open", "content"],
      setup(props, { slots }) {
        Vue.watch(
          () => props.open,
          (open) => {
            props.content[open ? "onOpenAutoFocus" : "onCloseAutoFocus"](new Event("autofocus"));
          },
          { flush: "post" }
        );
        return () => (props.open ? Vue.h("section", slots.content?.()) : null);
      }
    })
  );
  app.component(
    "UInput",
    Vue.defineComponent({
      props: ["modelValue"],
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
    })
  );
  app.component(
    "UButton",
    Vue.defineComponent({
      setup:
        (_props, { slots }) =>
        () =>
          Vue.h("button", slots.default?.())
    })
  );
  for (const name of ["UIcon", "UKbd", "UDropdownMenu"]) app.component(name, { render: () => null });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await key("H", { code: "KeyH", metaKey: true, shiftKey: true });
  await key("H", { code: "KeyH", metaKey: true, shiftKey: true }, "keyup");
  await vi.waitFor(() => expect(host.querySelectorAll('[role="option"]')).toHaveLength(texts.length));
  return { host, paste, writeText };
}

it.skipIf(typeof document === "undefined")(
  "pastes the clicked option once and blocks held Enter until keyup",
  async () => {
    const { host, paste, writeText } = await mountHistory();
    const option = host.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!;
    option.focus();
    option.click();
    await Vue.nextTick();
    expect(option.getAttribute("aria-selected")).toBe("true");
    await key("Enter", { code: "Enter" });
    expect(paste).toHaveBeenCalledExactlyOnceWith("second clip");
    expect(writeText).not.toHaveBeenCalled();
    expect(host.querySelector('[role="listbox"]')).toBeNull();

    const underlyingKeydown = vi.fn();
    window.addEventListener("keydown", underlyingKeydown);
    cleanups.push(() => window.removeEventListener("keydown", underlyingKeydown));
    await key("Enter", { code: "Enter", repeat: true });
    expect(underlyingKeydown).not.toHaveBeenCalled();
    await key("Enter", { code: "Enter" }, "keyup");
    await key("Enter", { code: "Enter" });
    expect(underlyingKeydown).toHaveBeenCalledOnce();
    expect(paste).toHaveBeenCalledOnce();
  }
);

it.skipIf(typeof document === "undefined")(
  "reopens on a fresh shortcut press after its previous keyup was lost",
  async () => {
    const { host } = await mountHistory();
    const shortcut = { code: "KeyH", metaKey: true, shiftKey: true };
    await key("H", shortcut);
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    await key("H", { ...shortcut, repeat: true });
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    await key("H", shortcut);
    await vi.waitFor(() => expect(host.querySelectorAll('[role="option"]')).toHaveLength(2));
  }
);

it.skipIf(typeof document === "undefined")(
  "copies without pasting on Command+Enter from a focused option",
  async () => {
    const { host, paste, writeText } = await mountHistory();
    const option = host.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!;
    option.focus();
    option.click();
    await Vue.nextTick();
    await key("Enter", { code: "Enter", metaKey: true });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("second clip");
    expect(paste).not.toHaveBeenCalled();
  }
);

it.skipIf(typeof document === "undefined")("does not submit IME confirmation or repeated Enter", async () => {
  const { host, paste, writeText } = await mountHistory();
  for (const options of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
    await key("Enter", { code: "Enter", ...options });
  }
  expect(paste).not.toHaveBeenCalled();
  expect(writeText).not.toHaveBeenCalled();
  expect(host.querySelector('[role="listbox"]')).not.toBeNull();
});

it.skipIf(typeof document === "undefined")(
  "requires confirmation before sending multiline terminal text unchanged",
  async () => {
    const text = "pwd\nwhoami\n";
    const { host, paste } = await mountHistory([text]);
    await key("Enter", { code: "Enter" });
    expect(paste).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("ClipboardHistory.RiskDescription");
    expect(document.activeElement?.textContent).toBe("ClipboardHistory.Cancel");
    const confirm = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "ClipboardHistory.ConfirmPaste"
    )!;
    confirm.click();
    await Vue.nextTick();
    expect(paste).toHaveBeenCalledExactlyOnceWith(text);
  }
);
