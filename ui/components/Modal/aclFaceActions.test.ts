import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import { useAclDialogPresentation } from "~/composables/useAclDialog";
import dialogSource from "./aclDialog.vue?raw";
import paneSource from "../Workspace/aclPaneHost.vue?raw";

it.skipIf(typeof document === "undefined").each([
  ["dialog", dialogSource],
  ["pane", paneSource]
])("only offers retry for actionable face verification in the %s", async (_name, source) => {
  const group = Vue.ref<any>({
    code: "acl_face_online_not_supported",
    submitted: true,
    items: [{ status: "failed", settled: false }]
  });
  const services = {
    ...Vue,
    useI18n: () => ({ t: (key: string) => key }),
    useAclDialogPresentation,
    useAclDialog: () => ({
      globalGroup: group,
      isOpen: Vue.ref(true),
      groupForScope: () => group,
      closeScope: vi.fn()
    }),
    useWorkspaceTabs: () => ({})
  };
  vi.stubGlobal("useI18n", services.useI18n);
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "face-acl-actions-test", inlineTemplate: true });
  const { outputText } = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
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
  const app = Vue.createApp(component, { scopeId: "asset" });
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
  for (const name of ["UAlert", "ModalAlertDialog"]) app.component(name, { render: () => null });
  app.mount(host);
  try {
    await Vue.nextTick();
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["ToolTips.Close"]);
    group.value.code = "acl_controls";
    group.value.items[0].token = {
      id: "face-token",
      is_active: false,
      acl: { requirements: { face: "pending" }, face_online: false, cancelled: false, mfa_methods: [] }
    };
    await Vue.nextTick();
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Common.Cancel",
      "Face.Remote.Retry"
    ]);
  } finally {
    app.unmount();
    host.remove();
    vi.unstubAllGlobals();
  }
});
