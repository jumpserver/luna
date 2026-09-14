import type { Ref } from "vue";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import { resolveAdvancedOptionFlags } from "./advancedOptionFlags";
import advancedSource from "./connectAdvancedOptions.vue?raw";
import fieldsSource from "./fields.vue?raw";

function mountSetup(source: string, props: () => Record<string, unknown>, services: Record<string, unknown> = {}) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "connection-options" });
  const { outputText } = ts.transpileModule(script.content.replaceAll("import.meta.client", "false"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
  const globals = {
    computed: Vue.computed,
    ref: Vue.ref,
    shallowRef: Vue.shallowRef,
    watch: Vue.watch,
    onMounted: Vue.onMounted,
    useI18n: () => ({ t: (key: string) => key }),
    useConnectFormAppearance: () => ({}),
    watchDebounced: () => {},
    ...services
  };
  const component = new Function(
    "require",
    ...Object.keys(globals),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )((name: string) => (name === "vue" ? Vue : { resolveAdvancedOptionFlags, ...services }), ...Object.values(globals));
  let state!: { selectedResolution: Ref<string>; advancedOptionOpen: Ref<boolean> };
  const setup = component.setup;
  component.setup = (props: unknown, context: unknown) => {
    state = setup(props, context);
    return () => null;
  };
  // Exercise Vue's real setup and v-model propagation without rendering Nuxt UI controls.
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
  const app = renderer.createApp({ render: () => Vue.h(component, props()) });
  app.mount({});
  return { state, unmount: () => app.unmount() };
}

it("updates the connection resolution without collapsing or changing other options", async () => {
  const options = Vue.ref({ resolution: "auto", remote_microphone: true, reusable: true });
  const { state, unmount } = mountSetup(advancedSource, () => ({
    protocol: "rdp",
    component: "razor",
    connectOptions: options.value,
    "onUpdate:connectOptions": (value: typeof options.value) => {
      options.value = value;
    }
  }));
  try {
    state.advancedOptionOpen.value = true;
    for (const resolution of ["1600x900", "1920x1080", "auto"]) {
      state.selectedResolution.value = resolution;
      await Vue.nextTick();
      expect(state.selectedResolution.value).toBe(resolution);
      expect(options.value).toEqual({ resolution, remote_microphone: true, reusable: true });
      expect(state.advancedOptionOpen.value).toBe(true);
    }
  } finally {
    unmount();
  }
});

function mountFields(
  getPreferences: () => Promise<unknown>,
  options: Record<string, unknown> = {},
  local = "auto",
  license = false
) {
  const draft = Vue.ref({ protocol: "rdp", connectMethod: "mstsc", account: "Administrator", connectOptions: options });
  const mounted = mountSetup(
    fieldsSource,
    () => ({
      asset: { id: "asset", permedAccounts: [] },
      submitLabel: "Connect",
      draft: draft.value,
      "onUpdate:draft": (value: typeof draft.value) => {
        draft.value = value;
      }
    }),
    {
      useSettingManager: () => ({ modernIsland: Vue.ref(false), rdpResolution: Vue.ref(local) }),
      useConnectMethods: () => ({ getMethodsForProtocol: async () => [{ value: "mstsc", component: "razor" }] }),
      parseLocalApplicationConnectMethod: (value: string) => ({ connectMethod: value }),
      getPublicSettings: async () => ({ XPACK_LICENSE_IS_VALID: license }),
      getLunaPreferences: getPreferences
    }
  );
  return { ...mounted, draft };
}

it.each([
  [undefined, "1600x900", "1920x1080", "1600x900"],
  [undefined, "auto", "1920x1080", "auto"],
  ["auto", "1600x900", "1920x1080", "auto"],
  ["1024x768", "1600x900", "1920x1080", "1024x768"],
  [undefined, undefined, "1366x768", "1366x768"]
])(
  "initializes the RDP form from selection=%s, server=%s, local=%s without requiring XPack",
  async (selected, server, local, expected) => {
    const preference = vi.fn().mockResolvedValue({ graphics: { rdp_resolution: server } });
    const { draft, unmount } = mountFields(preference, { resolution: selected, reusable: true }, local);
    try {
      await vi.waitFor(() => expect(draft.value.connectOptions.resolution).toBe(expected));
      expect(draft.value.connectOptions.reusable).toBe(true);
      expect(draft.value.connectOptions).not.toHaveProperty("rdp_resolution");
      expect(preference).toHaveBeenCalledTimes(selected ? 0 : 1);
    } finally {
      unmount();
    }
  }
);

it("initializes resolution and microphone together using one preference request", async () => {
  const preference = vi
    .fn()
    .mockResolvedValue({ graphics: { rdp_resolution: "1600x900", rdp_client_option: ["remote_microphone"] } });
  const { draft, unmount } = mountFields(preference, { reusable: true }, "auto", true);
  try {
    await vi.waitFor(() =>
      expect(draft.value.connectOptions).toEqual({ resolution: "1600x900", remote_microphone: true, reusable: true })
    );
    expect(preference).toHaveBeenCalledOnce();
  } finally {
    unmount();
  }
});

it("falls back to the local form preference when the server cannot be read", async () => {
  const { draft, unmount } = mountFields(
    vi.fn().mockRejectedValue(new Error("Preference unavailable")),
    {},
    "1366x768"
  );
  try {
    await vi.waitFor(() => expect(draft.value.connectOptions.resolution).toBe("1366x768"));
  } finally {
    unmount();
  }
});

it.each(["selection", "protocol"])("ignores a late preference response after a %s change", async (change) => {
  let resolve!: (value: unknown) => void;
  const preference = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const { draft, unmount } = mountFields(preference);
  try {
    if (change === "selection") draft.value.connectOptions = { resolution: "auto" };
    else draft.value.protocol = "ssh";
    await Vue.nextTick();
    resolve({ graphics: { rdp_resolution: "1600x900" } });
    await Vue.nextTick();
    await Vue.nextTick();
    expect(draft.value.connectOptions).toEqual(change === "selection" ? { resolution: "auto" } : {});
  } finally {
    unmount();
  }
});
