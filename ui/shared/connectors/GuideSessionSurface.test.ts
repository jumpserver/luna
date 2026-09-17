import type { Ref } from "vue";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import * as directGuide from "./directGuide";
import * as guideCommand from "./guideCommand";
import guideSource from "./GuideSessionSurface.vue?raw";
import * as tokenReuse from "./tokenReuse";

const { descriptor } = parse(guideSource);
const script = compileScript(descriptor, { id: "connection-guide" });
const { outputText } = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
});
const unmounts: Array<() => void> = [];
afterEach(() => unmounts.splice(0).forEach((unmount) => unmount()));

function mountGuide(
  options: {
    protocol?: string;
    account?: string;
    inputUsername?: string;
    asset?: Record<string, unknown>;
    detail?: Record<string, unknown>;
    error?: Error;
    orgId?: string;
  } = {}
) {
  const token = {
    id: "token-id",
    value: "secret",
    protocol: options.protocol || "mongodb",
    asset: { id: "asset-id", name: "MongoDB", ...options.asset },
    org_id: options.orgId,
    account: options.account || "account",
    input_username: options.inputUsername || ""
  };
  const getAssetDetailRequest = options.error
    ? vi.fn().mockRejectedValue(options.error)
    : vi.fn().mockResolvedValue(options.detail ?? { spec_info: { db_name: "app" } });
  const writeText = vi.fn().mockResolvedValue(undefined);
  const toast = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue,
    "clipboard-polyfill": { writeText },
    "~/composables/useApiRequest": {
      getAssetDetailRequest,
      getPublicSettings: async () => ({}),
      getUserProfile: async () => ({ username: "user" }),
      setConnectionTokenReusable: vi.fn()
    },
    "./guideCommand": guideCommand,
    "./directGuide": directGuide,
    "./tokenReuse": tokenReuse
  };
  const globals = {
    computed: Vue.computed,
    ref: Vue.ref,
    watch: Vue.watch,
    onMounted: Vue.onMounted,
    useI18n: () => ({ t: (key: string) => key }),
    useToast: () => ({ add: toast }),
    getSmartEndpoint: async () => ({ host: "gateway.example.com", magnus_port: 5525 })
  };
  const component = new Function(
    "require",
    ...Object.keys(globals),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )((name: string) => modules[name], ...Object.values(globals));
  let state!: {
    loading: Ref<boolean>;
    database: Ref<string>;
    rows: Ref<Array<{ name: string; value: unknown }>>;
    commands: Ref<Array<{ value: string }>>;
    copy: (value: unknown) => Promise<void>;
  };
  const setup = component.setup;
  component.setup = (props: unknown, context: unknown) => {
    state = setup(props, context);
    return () => null;
  };
  // Exercise the actual guide setup and mounted requests without a browser or Nuxt UI.
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
  const app = renderer.createApp(component, {
    tab: { assetId: "asset-id", orgId: "tab-org", protocol: token.protocol, payload: { token } }
  });
  app.mount({});
  unmounts.push(() => app.unmount());
  return { state, token, getAssetDetailRequest, toast, writeText };
}

it("loads MongoDB's default database from asset details for display, copy and mongosh", async () => {
  const { state, token, getAssetDetailRequest, writeText } = mountGuide({ orgId: "asset-org" });
  await vi.waitFor(() => expect(state.loading.value).toBe(false));

  expect(getAssetDetailRequest).toHaveBeenCalledExactlyOnceWith("asset-id", "asset-org");
  expect(state.database.value).toBe("app");
  const databaseRow = state.rows.value.find((row) => row.name === "database");
  expect(databaseRow?.value).toBe("app");
  await state.copy(databaseRow?.value);
  expect(writeText).toHaveBeenCalledExactlyOnceWith("app");
  expect(state.commands.value.map((command) => command.value)).toEqual([
    'mongosh "mongodb://token-id:secret@gateway.example.com:5525/app?authSource=admin&loadBalanced=true&retryWrites=false"'
  ]);
  expect(token.asset).toEqual({ id: "asset-id", name: "MongoDB" });
});

it.each(["mysql", "mariadb", "postgresql", "sqlserver", "redis"])(
  "also loads the default database for %s using the tab's organization",
  async (protocol) => {
    const { state, getAssetDetailRequest } = mountGuide({ protocol, detail: { spec_info: { db_name: "0" } } });
    await vi.waitFor(() => expect(state.loading.value).toBe(false));
    expect(state.database.value).toBe("0");
    expect(getAssetDetailRequest).toHaveBeenCalledExactlyOnceWith("asset-id", "tab-org");
  }
);

it.each([{ spec_info: { db_name: "existing" } }, { specInfo: { dbName: "existing" } }])(
  "keeps database details already included in the token without another request",
  async (asset) => {
    const { state, getAssetDetailRequest } = mountGuide({ asset });
    await vi.waitFor(() => expect(state.loading.value).toBe(false));
    expect(state.database.value).toBe("existing");
    expect(getAssetDetailRequest).not.toHaveBeenCalled();
  }
);

it.each([{}, { spec_info: { db_name: "" } }])(
  "does not invent a default database when none is configured",
  async (detail) => {
    const { state } = mountGuide({ detail });
    await vi.waitFor(() => expect(state.loading.value).toBe(false));
    expect(state.database.value).toBe("");
  }
);

it("reports failed asset loading and still finishes loading the guide", async () => {
  const { state, toast } = mountGuide({ error: new Error("Asset unavailable") });
  await vi.waitFor(() => expect(state.loading.value).toBe(false));
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Asset.GetAssetFailed", color: "error" }));
  expect(state.database.value).toBe("");
});

it.each(["oracle", "ssh", "vnc"])("does not fetch database details for %s", async (protocol) => {
  const { state, getAssetDetailRequest } = mountGuide({ protocol });
  await vi.waitFor(() => expect(state.loading.value).toBe(false));
  expect(getAssetDetailRequest).not.toHaveBeenCalled();
  expect(state.database.value).toBe(protocol === "oracle" ? "token-id" : "");
});

it("keeps manually entered VNC connections token-only", async () => {
  const { state } = mountGuide({ protocol: "vnc", account: "@INPUT", inputUsername: "operator" });
  await vi.waitFor(() => expect(state.loading.value).toBe(false));
  expect(state.commands.value.map((command) => command.value)).toEqual([
    "vncviewer -UserName=token-id gateway.example.com:5900"
  ]);
});
