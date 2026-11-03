import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as Vue from "vue";
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc";
import { renderToString } from "vue/server-renderer";
import * as editing from "./dataEditing";
import * as workspace from "./workspace";
import { executionActive } from "./api";
import * as presentation from "~/chen/utils/executionPlanPresentation";
import * as selection from "~/chen/utils/dataGridSelection";
import { normalizeChenGridPreferences } from "~/chen/composables/useChenGridPreferences";
import * as resultGrid from "./resultGrid";
import browseSource from "./GoBrowsePanel.vue?raw";
import gridSource from "./GoResultGrid.client.vue?raw";
import treeSource from "~/chen/components/ExecutionPlanTree.vue?raw";
import nodeSource from "~/chen/components/ExecutionPlanNodeRow.vue?raw";

const empty = Vue.defineComponent({ render: () => null });
const control = Vue.defineComponent({
  props: ["label"],
  setup:
    (props, { slots }) =>
    () =>
      Vue.h("div", [props.label, slots.default?.()])
});
function compile(source: string) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "presentation" });
  const template = compileTemplate({
    source: descriptor.template!.content,
    filename: "Presentation.vue",
    id: "presentation",
    compilerOptions: { bindingMetadata: script.bindings }
  });
  function evaluate(code: string) {
    const modules: Record<string, unknown> = {
      vue: Vue,
      "vue-i18n": { useI18n: () => ({ t: (key: string) => key, locale: Vue.ref("en") }) },
      "./api": { executionActive },
      "./dataEditing": editing,
      "./workspace": workspace,
      "./GoBrowseCondition.vue": empty,
      "./GoResultCellEditor.vue": empty,
      "./GoResultValue.client.vue": empty,
      "./resultGrid": resultGrid,
      "ag-grid-community": {
        AllCommunityModule: {},
        ModuleRegistry: { registerModules: () => {} },
        isColumn: () => false
      },
      "ag-grid-vue3": { AgGridVue: empty },
      "~/chen/locales": { gridLocales: { en: {} } },
      "~/chen/composables/useChenGridPreferences": {
        useChenGridPreferences: () => Vue.ref(normalizeChenGridPreferences(null))
      },
      "~/chen/utils/dataGridSelection": selection,
      "~/utils/clipboard": { writeClipboardText: () => Promise.resolve() },
      "~/chen/utils/executionPlanPresentation": presentation,
      "~/chen/components/ExecutionPlanNodeRow.vue": empty
    };
    const globals = {
      ref: Vue.ref,
      computed: Vue.computed,
      watch: Vue.watch,
      useToast: () => ({ add: () => {} }),
      useI18n: () => ({ t: (key: string) => key, locale: Vue.ref("en") })
    };
    const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    return new Function("require", ...Object.keys(globals), `const exports={};\n${result.outputText}\nreturn exports;`)(
      (name: string) => modules[name],
      ...Object.values(globals)
    );
  }
  const component = evaluate(script.content).default;
  component.render = evaluate(template.code).render;
  return component;
}
const Browse = compile(browseSource);
const Grid = compile(gridSource);
const Tree = compile(treeSource);
const Node = compile(nodeSource);
async function render(component: ReturnType<typeof compile>, props: Record<string, unknown>) {
  const app = Vue.createSSRApp(component, props);
  for (const name of [
    "UButton",
    "UBadge",
    "UIcon",
    "UInput",
    "USelect",
    "UPopover",
    "UTooltip",
    "UDropdownMenu",
    "UContextMenu",
    "UModal"
  ])
    app.component(name, control);
  app.component("ExecutionPlanNodeRow", Node);
  return renderToString(app);
}
function query() {
  const q = workspace.createQueryTab("query", { database: "app", schema: "public" });
  q.console = { id: "console", state: "ready", database: "app", schema: "public" };
  q.browseObject = { database: "app", schema: "public", name: "items", kind: "table" };
  q.rows = {
    id: "r",
    columns: [],
    rows: [["2"]],
    offset: 0,
    total_rows: 1,
    truncated: false,
    browse: {
      supported: true,
      where: "id = 2",
      filter: undefined,
      sort: [],
      page_size: 200,
      offset: 0,
      full_sql: "SELECT * FROM items WHERE id = 2"
    }
  } as never;
  q.browseDraft = { where: "id = 2", sort: [], page_size: 200 };
  return q;
}
const session = { state: "ready", permissions: { can_copy: true, can_paste: true } };
const node = {
  id: "scan",
  nativeOperator: "range",
  nodeType: "INDEX_SCAN",
  relation: "items",
  rows: "12",
  cost: null,
  children: [],
  predicates: {},
  attributes: {}
};
function plan(hierarchy = false) {
  return {
    status: "SUCCESS",
    database: "mysql",
    serverVersion: "8.4",
    rawText: "raw plan",
    rawFormat: "TEXT",
    roots: [node],
    capabilities: { hierarchy },
    warnings: [{ code: "plan_flat_summary", message: "No hierarchy or costs" }],
    prerequisites: [],
    effects: { connectionDisposition: "REUSE", auxiliaryStorage: "NONE" }
  };
}

describe("Go workspace presentation", () => {
  it("hides only local search in table mode and retains the other grid controls", async () => {
    const props = { rows: query().rows, canCopy: true };
    expect(await render(Grid, { ...props, displayMode: "query" })).toContain("Chen.GoResultSearch");
    const table = await render(Grid, { ...props, displayMode: "table" });
    expect(table).not.toContain("Chen.GoResultSearch");
    expect(table).toContain("Chen.GoV1GridColumns");
    expect(table).toContain("Chen.GoBrowseTableSettings");
  });
  it("shows the active condition alongside an unapplied draft", async () => {
    const q = query();
    q.browseDraft.where = "id > 10";
    const html = await render(Browse, { query: q, session });
    expect(html).toContain("data-browse-pending");
    expect(html).toContain("id = 2");
    expect(html).toContain("data-browse-applied");
    expect(q.rows?.rows).toEqual([["2"]]);
  });
  it("does not mark whitespace-only edits or empty builder groups as unapplied", async () => {
    const q = query();
    q.browseDraft.where = "  id = 2  ";
    q.browseDraft.filter = { op: "and", children: [] };
    expect(await render(Browse, { query: q, session })).not.toContain("data-browse-pending");
  });
  it("marks structured condition and server sort drafts without running them", async () => {
    const q = query();
    q.browseDraft.filter = { op: "and", children: [{ op: "gt", column: "id", values: ["10"] }] };
    expect(await render(Browse, { query: q, session })).toContain("data-browse-pending");
    q.browseDraft.filter = undefined;
    q.browseDraft.sort = [{ column: "id", desc: true }];
    expect(await render(Browse, { query: q, session })).toContain("data-browse-pending");
  });
  it("starts a flat plan in the summary, omits informational warnings and leaves missing costs empty", async () => {
    const html = await render(Tree, { plan: plan(), compact: true });
    expect(html).toContain("<table");
    expect(html).toContain("range");
    expect(html).toContain("—");
    expect(html).not.toContain("No hierarchy or costs");
    expect(html).not.toContain("8.4");
  });
  it("keeps actionable diagnostics and raw-only output visible", async () => {
    const p = {
      ...plan(),
      status: "RAW_ONLY",
      error: { message: "SQL failed" },
      warnings: [{ code: "plan_parse_failed", message: "Cannot parse plan" }]
    };
    const html = await render(Tree, { plan: p, compact: true });
    expect(html).toContain("raw plan");
    expect(html).toContain("SQL failed");
    expect(html).toContain("Cannot parse plan");
  });
  it("keeps the legacy metadata and warnings unless compact mode is requested", async () => {
    const html = await render(Tree, { plan: plan() });
    expect(html).toContain("8.4");
    expect(html).toContain("No hierarchy or costs");
  });
  it("does not invent a summary hierarchy for a hierarchical plan by default", async () => {
    expect(await render(Tree, { plan: plan(true), compact: true })).not.toContain("<table");
  });
});
