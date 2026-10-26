import type { ConnectionSessionPayload } from "~/composables/useAssetAction";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { TokenResponse } from "~/types";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import { createConnectionTokenWithAcl, useAclDialog, useAclDialogPresentation } from "~/composables/useAclDialog";
import { useWorkspaceTabMenu } from "~/composables/useWorkspaceTabMenu";
import globalSource from "../Modal/aclDialog.vue?raw";
import paneSource from "./aclPaneHost.vue?raw";

vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({ currentSite: "https://jumpserver.example", currentAccountId: "web" })
}));
vi.mock("~/composables/useApiRequest", async (original) => ({
  ...(await original<typeof import("~/composables/useApiRequest")>()),
  getAssetDetailRequest: async () => ({ permed_accounts: [], permed_protocols: [] })
}));

const pendingToken = {
  id: "pending-token",
  is_active: false,
  org_id: "org",
  acl: { requirements: { reason: "pending" }, mfa_methods: [], face_online: false, cancelled: false }
} as unknown as TokenResponse;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  const acl = useAclDialog();
  while (acl.activeGroup.value) await acl.close(acl.activeGroup.value);
  vi.unstubAllGlobals();
});

it.skipIf(typeof document === "undefined").each(["initial", "exchange", "fallback"])(
  "cancelling %s ACL closes only an initial empty pane",
  async (kind) => {
    const payload = { id: "old-token", token: { id: "old-token" }, connectMethod: { value: "web_db" } };
    const tabs = Vue.ref<WorkspaceSessionTab[]>([
      {
        id: "pane",
        assetId: "asset",
        protocol: "postgresql",
        account: "user",
        status: "connected",
        layoutMode: "single",
        panes: [
          {
            id: "pane",
            assetId: "asset",
            protocol: "postgresql",
            account: "user",
            status: "connected",
            mode: "session",
            ...(kind === "initial" ? {} : { payload })
          }
        ]
      } as WorkspaceSessionTab
    ]);
    const pane = tabs.value[0]!.panes[0]!;
    const originalPayload = pane.payload;
    let attempt = 0;
    const closePane = vi.fn(async () => {
      tabs.value = [];
    });
    const updateSessionPayload = vi.fn();
    const workspace = {
      tabs,
      closePane,
      updateSessionPayload,
      getSessionConnectionAttempt: () => attempt,
      markSessionConnecting: () => {
        attempt++;
        pane.status = "connecting";
      },
      markSessionConnected: () => {
        pane.status = "connected";
      },
      markSessionDisconnected: () => {
        pane.status = "disconnected";
      }
    };
    const handleAssetConnection = vi.fn(async (...args: unknown[]) => {
      const meta = args[5] as { tabId: string; onSessionReady: (payload: ConnectionSessionPayload) => void };
      const token = await createConnectionTokenWithAcl(
        { asset: "asset", account: "user", protocol: "postgresql", connect_method: "web_cli", connect_options: {} },
        { assetName: "PG", orgId: "org", scopeId: meta.tabId }
      );
      if (token) meta.onSessionReady(token as unknown as ConnectionSessionPayload);
    });
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
    vi.stubGlobal("useErrorToast", () => ({ addErrorToast: vi.fn() }));
    vi.stubGlobal("useWorkspaceTabs", () => workspace);
    vi.stubGlobal("useAssetAction", () => ({ handleAssetConnection }));
    vi.stubGlobal("useAclDialog", useAclDialog);
    vi.stubGlobal("createConnectionToken", vi.fn().mockResolvedValue(pendingToken));
    vi.stubGlobal(
      "advanceConnectionAcl",
      vi.fn().mockResolvedValue({ ...pendingToken, acl: { ...pendingToken.acl, cancelled: true } })
    );
    vi.stubGlobal(
      "exchangeConnectionToken",
      kind === "fallback"
        ? vi.fn().mockRejectedValue(new Error("token expired"))
        : vi.fn().mockResolvedValue(pendingToken)
    );
    const acl = useAclDialog();
    const operation =
      kind === "initial"
        ? acl.request(pendingToken, { assetName: "PG", scopeId: "pane", orgId: "org" })!
        : useWorkspaceTabMenu().reconnectSession({ ...pane, layoutMode: "single", panes: [pane] });
    await vi.waitFor(() => expect(acl.activeGroup.value).toBeDefined());
    const source = kind === "exchange" ? globalSource : paneSource;
    const { descriptor } = parse(source);
    const script = compileScript(descriptor, { id: "acl-cancel-integration", inlineTemplate: true });
    const { outputText } = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    const services = { ...Vue, useI18n, useAclDialog, useAclDialogPresentation, useWorkspaceTabs: () => workspace };
    const component = new Function(
      "require",
      ...Object.keys(services),
      `const exports = {};\n${outputText}\nreturn exports.default;`
    )(
      (name: string) => (name === "vue" ? Vue : { __esModule: true, default: { render: () => null } }),
      ...Object.values(services)
    );
    const host = document.createElement("div");
    document.body.append(host);
    const app = Vue.createApp(component, { scopeId: "pane" });
    app.component(
      "UModal",
      Vue.defineComponent({
        setup:
          (_props, { slots }) =>
          () =>
            Vue.h("section", [slots.body?.(), slots.footer?.()])
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
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    await Vue.nextTick();
    const cancel = [...host.querySelectorAll("button")].find((button) => button.textContent === "Common.Cancel");
    expect(cancel).toBeDefined();
    cancel!.click();
    await operation;
    await vi.waitFor(() => expect(acl.activeGroup.value).toBeUndefined());
    if (kind === "initial") {
      expect(closePane).toHaveBeenCalledWith("pane");
      expect(tabs.value).toHaveLength(0);
    } else {
      await vi.waitFor(() => expect(pane.status).toBe("connected"));
      expect(closePane).not.toHaveBeenCalled();
      expect(tabs.value).toHaveLength(1);
      expect(pane.payload).toBe(originalPayload);
      expect(updateSessionPayload).not.toHaveBeenCalled();
      expect(handleAssetConnection).toHaveBeenCalledTimes(kind === "fallback" ? 1 : 0);
    }
  }
);
