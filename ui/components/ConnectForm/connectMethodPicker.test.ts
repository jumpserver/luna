import type { Ref } from "vue";
import type { ConnectMethod } from "~/composables/useConnectMethods";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import * as connectMethods from "~/composables/useConnectMethods";
import pickerSource from "./connectMethodPicker.vue?raw";
import * as methodUtils from "./connectMethodUtils";

vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: vi.fn() }));

const { descriptor } = parse(pickerSource);
const script = compileScript(descriptor, { id: "connect-method-picker" });
const { outputText } = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
});
const unmounts: Array<() => void> = [];
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
  vi.unstubAllGlobals();
});

function mountPicker(protocol: string, values: string[], desktop = true, configured = true) {
  vi.stubGlobal("isDesktopRuntime", () => desktop);
  const selected = Vue.ref(values[0] || "");
  const methods: ConnectMethod[] = values.map((value) => ({
    value,
    label: value,
    type: "native",
    icon: "",
    disabled: false,
    listen: "",
    component: "koko"
  }));
  const globals = {
    computed: Vue.computed,
    ref: Vue.ref,
    watch: Vue.watch,
    isDesktopRuntime: () => desktop,
    useI18n: () => ({ t: (key: string) => key }),
    useConnectFormAppearance: () => ({}),
    useSettingManager: () => ({
      modernIsland: Vue.ref(false),
      appConfig: Vue.ref({
        clients: configured
          ? [
              {
                name: "custom",
                display_name: "Custom client",
                protocol: [protocol],
                is_set: true,
                match_first: [protocol]
              }
            ]
          : []
      })
    })
  };
  const modules: Record<string, unknown> = {
    vue: Vue,
    "~/composables/useConnectMethods": connectMethods,
    "./connectMethodUtils": methodUtils
  };
  const component = new Function(
    "require",
    ...Object.keys(globals),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )((name: string) => modules[name], ...Object.values(globals));
  let state!: {
    connectMethod: Ref<string>;
    connectMethodTabItems: Ref<Array<{ label: string; value: string }>>;
    selectedConnectMethodType: Ref<string>;
  };
  const setup = component.setup;
  component.setup = (props: unknown, context: unknown) => {
    state = setup(props, context);
    return () => null;
  };
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
  const app = renderer.createApp({
    render: () =>
      Vue.h(component, {
        protocol,
        methods,
        connectMethod: selected.value,
        "onUpdate:connectMethod": (value: string) => {
          selected.value = value;
        }
      })
  });
  app.mount({});
  unmounts.push(() => app.unmount());
  return { state, selected };
}

it.each([
  ["ssh", "ssh_client", "ssh_guide"],
  ["mysql", "db_client", "db_guide"],
  ["vnc", "vnc_client", "vnc_guide"]
])(
  "appends the %s guide to configured applications even when Core lists the guide first",
  async (protocol, client, guide) => {
    const { state, selected } = mountPicker(protocol, [guide, client]);
    expect(state.selectedConnectMethodType.value).toBe("native");
    expect(state.connectMethodTabItems.value).toEqual([
      { label: "Custom client", value: `native_app:${client}:custom` },
      { label: guide, value: guide }
    ]);
    state.connectMethod.value = `native_app:${client}:custom`;
    await Vue.nextTick();
    expect(selected.value).toBe(`native_app:${client}:custom`);
    state.connectMethod.value = guide;
    await Vue.nextTick();
    expect(selected.value).toBe(guide);
    expect(state.selectedConnectMethodType.value).toBe("native");
  }
);

it("keeps guides available when no local application is configured", () => {
  const { state } = mountPicker("ssh", ["ssh_client", "ssh_guide"], true, false);
  expect(state.connectMethodTabItems.value).toEqual([{ label: "ssh_guide", value: "ssh_guide" }]);
});

it("does not wrap a guide as a local application when Core only allows guides", () => {
  const { state } = mountPicker("mysql", ["db_guide"]);
  expect(state.connectMethodTabItems.value).toEqual([{ label: "db_guide", value: "db_guide" }]);
});

it("preserves the web application's server-provided client and guide choices", () => {
  const { state } = mountPicker("ssh", ["ssh_client", "ssh_guide"], false);
  expect(state.connectMethodTabItems.value).toEqual([
    { label: "ssh_client", value: "ssh_client" },
    { label: "ssh_guide", value: "ssh_guide" }
  ]);
});

it("does not offer a guide that Core has not returned", () => {
  const { state } = mountPicker("sftp", ["sftp_client"]);
  expect(state.connectMethodTabItems.value).toEqual([
    { label: "Custom client", value: "native_app:sftp_client:custom" }
  ]);
});
