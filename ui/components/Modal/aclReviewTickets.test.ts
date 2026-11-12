import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import { getAclReviewTickets, useAclDialogPresentation } from "~/composables/useAclDialog";
import * as acl from "~/composables/useAclDialog";
import zh from "../../../i18n/locales/zh.json";
import source from "./aclDialogContent.vue?raw";

it.skipIf(typeof document === "undefined")(
  "shows plain text for one ticket and keeps multiple tickets selectable",
  async () => {
    const t = (key: string, params: Record<string, unknown> = {}) => {
      const label = key.startsWith("AclDialog.")
        ? key
            .slice(10)
            .split(".")
            .reduce((value: any, name) => value?.[name], zh.AclDialog)
        : key;
      return String(label || key).replace(/\{(\w+)\}/g, (_match, name) => String(params[name]));
    };
    const item = (id: string, ticket: string) => ({
      id,
      assetName: id,
      status: "pending",
      resolve: vi.fn(),
      token: { id, from_ticket: ticket, acl: { requirements: { review: "pending" }, review_status: "pending" } }
    });
    const group = Vue.reactive<any>({
      code: "acl_controls",
      submitted: true,
      items: [item("server-a", "ticket-one"), item("server-b", "ticket-one")]
    });
    const services = {
      ...Vue,
      useI18n: () => ({ t }),
      useAclDialogPresentation,
      useAclDialog: () => ({ selectItem: vi.fn() })
    };
    vi.stubGlobal("useI18n", services.useI18n);
    const { descriptor } = parse(source);
    const script = compileScript(descriptor, { id: "review-ticket-test", inlineTemplate: true });
    const { outputText } = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    const component = new Function(
      "require",
      ...Object.keys(services),
      `const exports = {};\n${outputText}\nreturn exports.default;`
    )((name: string) => (name === "vue" ? Vue : name.includes("useAclDialog") ? acl : {}), ...Object.values(services));
    const app = Vue.createApp(component, { group });
    for (const name of [
      "UFormField",
      "UBadge",
      "UButton",
      "UStepper",
      "UPopover",
      "UAlert",
      "UTextarea",
      "UCheckbox",
      "UInput",
      "UProgress"
    ]) {
      app.component(name, {
        setup:
          (_props: any, { slots }: any) =>
          () =>
            Vue.h("div", slots.default?.())
      });
    }
    app.component(
      "USelect",
      Vue.defineComponent({
        props: ["modelValue", "items"],
        emits: ["update:modelValue"],
        setup:
          (props, { emit }) =>
          () =>
            Vue.h(
              "select",
              {
                value: props.modelValue,
                onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value)
              },
              props.items.map((item: any) => Vue.h("option", { value: item.value }, item.label))
            )
      })
    );
    const host = document.createElement("div");
    document.body.append(host);
    app.mount(host);
    try {
      expect(getAclReviewTickets(group.items)).toHaveLength(1);
      expect(host.querySelector("select")).toBeNull();
      expect(host.textContent).toContain("工单 · 审批中 · 2 个资产");
      expect(host.textContent).not.toContain("工单 1");
      group.items.push(item("server-c", "ticket-two"));
      await Vue.nextTick();
      const select = host.querySelector("select")!;
      expect([...select.options].map((option) => option.text)).toEqual([
        "工单 1 · 审批中 · 2 个资产",
        "工单 2 · 审批中 · 1 个资产"
      ]);
      select.value = "ticket:ticket-two";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Vue.nextTick();
      expect(host.querySelector("ul")?.textContent).toContain("server-c");
      expect(host.querySelector("ul")?.textContent).not.toContain("server-a");
      group.items.pop();
      await Vue.nextTick();
      expect(host.querySelector("select")).toBeNull();
      expect(host.textContent).toContain("工单 · 审批中 · 2 个资产");
      expect(host.querySelector("ul")?.textContent).toContain("server-a");
    } finally {
      app.unmount();
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);
