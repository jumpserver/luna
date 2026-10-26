import type { Ref } from "vue";
import type { GoEvent, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc";
import * as dialect from "~/chen/utils/sqlDialect";
import * as apiModule from "./api";
import * as editing from "./dataEditing";
import surfaceSource from "./GoDatabaseSessionSurface.vue?raw";
import * as requestId from "./requestId";
import * as workspace from "./workspace";

const { descriptor } = parse(surfaceSource);
const script = compileScript(descriptor, { id: "chen-reconnect" });
const template = compileTemplate({
  source: descriptor.template!.content,
  filename: "GoDatabaseSessionSurface.vue",
  id: "chen-reconnect",
  compilerOptions: { bindingMetadata: script.bindings }
});
function evaluate(source: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  return new Function("require", ...Object.keys(globals), `const exports = {};\n${outputText}\nreturn exports;`)(
    (name: string) => modules[name],
    ...Object.values(globals)
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
interface Node {
  parent?: Node;
  children: Node[];
  style?: Record<string, string>;
}
const renderer = Vue.createRenderer<Node, Node>({
  insert(node, parent, anchor) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
  },
  remove(node) {
    node.parent?.children.splice(node.parent.children.indexOf(node), 1);
  },
  patchProp() {},
  createElement: () => ({ children: [], style: {} }),
  createText: () => ({ children: [] }),
  createComment: () => ({ children: [] }),
  setText() {},
  setElementText() {},
  parentNode: (node) => node.parent || null,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] || null
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const makeSession = (id: string): GoSession =>
  ({
    id,
    state: "ready",
    dialect: "postgresql",
    asset: "test",
    permissions: { can_copy: true, can_paste: true }
  }) as GoSession;

function mountSurface(firstToken = "old") {
  const calls: { path: string; origin: string; method: string; bearer: string | null; body: Record<string, string> }[] =
    [];
  const blocked = new Map<string, ReturnType<typeof deferred<Response>>>();
  const eventReaders: { callback: (event: GoEvent) => void; signal: AbortSignal }[] = [];
  const panes: { query: QueryWorkspaceTab; sessionId: string; unmounted: boolean }[] = [];
  const markSessionConnected = vi.fn();
  const markSessionDisconnected = vi.fn();
  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, "http://chen.test").pathname.replace("/chen/api/v1", "");
    const method = init.method || "GET";
    const body = JSON.parse(String(init.body || "{}"));
    const bearer = new Headers(init.headers).get("token");
    calls.push({ path, origin: new URL(url, "http://chen.test").origin, method, bearer, body });
    const wait = blocked.get(`${method} ${path}${path === "/sessions" ? ` ${body.connect_token}` : ""}`);
    if (wait) return wait.promise;
    if (path === "/sessions" && method === "POST")
      return json({ token: `bearer-${body.connect_token}`, session: makeSession(body.connect_token) });
    if (path.endsWith("/consoles") && method === "POST")
      return json({
        id: `console-${path.split("/")[2]}-${calls.length}`,
        state: "ready",
        database: "app",
        schema: "public"
      });
    if (path.endsWith("/events"))
      return new Response(new ReadableStream(), { headers: { "Content-Type": "text/event-stream" } });
    if (method === "DELETE") return new Response(null, { status: 204 });
    return json({});
  });
  vi.stubGlobal("window", {
    location: { origin: "http://chen.test" },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubGlobal("getWebApiHeaders", () => ({}));
  vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
  vi.stubGlobal("isElectronRuntime", () => false);
  vi.stubGlobal("withWebSitePrefix", (path: string) => path);
  const empty = Vue.defineComponent({ render: () => null });
  const queryPane = Vue.defineComponent({
    props: ["query", "session"],
    setup(props) {
      const record = { query: props.query, sessionId: props.session.id, unmounted: false };
      panes.push(record);
      Vue.onBeforeUnmount(() => {
        record.unmounted = true;
      });
      return () => null;
    }
  });
  const modules: Record<string, unknown> = {
    vue: Vue,
    "vue-i18n": { useI18n: () => ({ t: (key: string) => key }) },
    "@vueuse/core": {
      useElementSize: () => ({ width: Vue.ref(1200) }),
      useLocalStorage: (_key: string, value: unknown) => Vue.ref(value)
    },
    "#koko/composables/agent/types": { parseKokoMcpFrame: vi.fn() },
    "~/chen/composables/useChenSqlAiSessions": {
      getChenSqlAiSession: () => undefined,
      unregisterChenSqlAiSession: vi.fn(),
      registerChenSqlAiSession: vi.fn(),
      handleChenSqlAiWireMessage: () => true,
      handleChenSqlAiError: vi.fn()
    },
    "~/chen/utils/sqlDialect": dialect,
    "~/composables/useWorkspaceTabs": { registerWorkspaceSessionCloseGuard: () => vi.fn() },
    "~/store/modules/userInfo": { useUserInfoStore: () => ({}) },
    "./api": apiModule,
    "./dataEditing": editing,
    "./requestId": requestId,
    "./workspace": workspace,
    "./events": {
      readChenEvents: (_stream: unknown, callback: (event: GoEvent) => void, signal: AbortSignal) => {
        eventReaders.push({ callback, signal });
        return new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      }
    },
    "./sqlAi": { prepareGoSqlProposal: vi.fn() },
    "./usePaneResize": { usePaneResize: () => ({ dragging: Vue.ref(false) }) },
    "./GoQueryPane.vue": queryPane,
    "./GoCatalogTree.vue": empty,
    "./GoObjectPane.vue": empty,
    "./GoSchemaEditor.vue": empty
  };
  const component = evaluate(script.content, modules, {
    useToast: () => ({ add: vi.fn() }),
    useAiPanel: () => ({}),
    useWorkspaceTabs: () => ({ markSessionConnected, markSessionDisconnected }),
    isDesktopRuntime: () => false
  }).default;
  component.render = evaluate(template.code, { vue: Vue }).render;
  let state!: {
    session: Ref<GoSession | null>;
    tabs: Ref<QueryWorkspaceTab[]>;
    busy: Ref<boolean>;
    authenticationUnknown: Ref<boolean>;
    eventConnected: Ref<boolean>;
    error: Ref<string>;
    closeDialog: Ref<unknown>;
    startSession: () => Promise<void>;
    closeSession: () => Promise<void>;
    closeTab: (query: QueryWorkspaceTab) => Promise<void>;
    connectQuery: (query: QueryWorkspaceTab) => Promise<void>;
    loadRows: (query: QueryWorkspaceTab, id: string) => Promise<void>;
    finishClose: (approved: boolean) => void;
  };
  const setup = component.setup;
  component.setup = (props: unknown, context: unknown) => {
    state = setup(props, context);
    return state;
  };
  const tab = Vue.reactive({
    id: "workspace",
    protocol: "postgresql",
    payload: { token: { id: firstToken }, endpointUrl: "http://chen.test" }
  });
  const app = renderer.createApp(component, { tab });
  const passthrough = Vue.defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        Vue.h("div", slots.default?.())
  });
  for (const name of new Set(Array.from(surfaceSource.matchAll(/<(U\w+)/g), (match) => match[1]!)))
    app.component(name, passthrough);
  app.mount({ children: [] });
  cleanups.push(() => app.unmount());
  return { state, tab, calls, blocked, eventReaders, panes, markSessionConnected, markSessionDisconnected };
}
async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
  await Vue.nextTick();
}
async function waitReady(mounted: ReturnType<typeof mountSurface>, id: string) {
  await vi.waitFor(() => {
    expect(mounted.state.session.value?.id, mounted.state.error.value).toBe(id);
    expect(mounted.state.busy.value).toBe(false);
  });
}
function exchange(mounted: ReturnType<typeof mountSurface>, token: string) {
  mounted.tab.payload = { ...mounted.tab.payload, token: { id: token } };
}

describe("Go database connection replacement", () => {
  it("consumes a renewed token once, preserves SQL drafts and replaces child/session state without running SQL", async () => {
    const mounted = mountSurface();
    await waitReady(mounted, "old");
    const old = mounted.state.tabs.value[0]!;
    old.sql = "SELECT * FROM customers c;";
    old.title = "My draft";
    const baseline = old.baselineSql;
    mounted.eventReaders[0]!.callback({
      sequence: 1,
      type: "session.closed",
      data: { reason: "idle_disconnect" }
    } as GoEvent);
    exchange(mounted, "new");
    await waitReady(mounted, "new");
    const current = mounted.state.tabs.value[0]!;
    expect(current).not.toBe(old);
    expect(current).toMatchObject({
      id: old.id,
      sql: old.sql,
      title: old.title,
      baselineSql: baseline,
      context: old.context
    });
    expect(current.console?.id).not.toBe(old.console?.id);
    expect(current.rows).toBeNull();
    expect(old.closed).toBe(true);
    expect(mounted.panes[0]!.unmounted).toBe(true);
    expect(mounted.panes.at(-1)!.sessionId).toBe("new");
    expect(mounted.eventReaders[0]!.signal.aborted).toBe(true);
    mounted.eventReaders[0]!.callback({ sequence: 999, type: "session.closed", data: {} } as GoEvent);
    expect(mounted.state.session.value?.state).toBe("ready");
    exchange(mounted, "new");
    await mounted.state.startSession();
    await flush();
    expect(mounted.calls.filter((call) => call.path === "/sessions" && call.body.connect_token === "new")).toHaveLength(
      1
    );
    expect(mounted.calls.some((call) => call.path.includes("/executions"))).toBe(false);
    expect(mounted.markSessionConnected).toHaveBeenLastCalledWith("workspace");
  });

  it("isolates a late authentication response and closes it using its original bearer", async () => {
    const mounted = mountSurface("");
    const late = deferred<Response>();
    mounted.blocked.set("POST /sessions old", late);
    exchange(mounted, "old");
    await flush();
    exchange(mounted, "new");
    await waitReady(mounted, "new");
    late.resolve(json({ token: "bearer-old", session: makeSession("old") }));
    await flush();
    expect(mounted.state.session.value?.id).toBe("new");
    expect(mounted.calls.find((call) => call.path === "/sessions/old" && call.method === "DELETE")?.bearer).toBe(
      "bearer-old"
    );
    expect(mounted.calls.filter((call) => call.path === "/sessions/old/consoles")).toHaveLength(0);
    expect(mounted.state.busy.value).toBe(false);
  });

  it("keeps the same authentication request id on recovery but gives a new token its own id", async () => {
    const mounted = mountSurface("");
    const failed = deferred<Response>();
    mounted.blocked.set("POST /sessions old", failed);
    exchange(mounted, "old");
    await flush();
    void mounted.state.startSession();
    expect(mounted.calls.filter((call) => call.path === "/sessions")).toHaveLength(1);
    failed.resolve(new Response("{}", { status: 503 }));
    await vi.waitFor(() => expect(mounted.state.authenticationUnknown.value).toBe(true));
    mounted.blocked.delete("POST /sessions old");
    await mounted.state.startSession();
    await waitReady(mounted, "old");
    exchange(mounted, "new");
    await flush();
    mounted.state.finishClose(true);
    await waitReady(mounted, "new");
    const requests = mounted.calls.filter((call) => call.path === "/sessions");
    expect(requests[0]!.body.request_id).toBe(requests[1]!.body.request_id);
    expect(requests[2]!.body.request_id).not.toBe(requests[0]!.body.request_id);
  });

  it("keeps grid edits and restores parent status when reconnect discard is declined", async () => {
    const mounted = mountSurface();
    await waitReady(mounted, "old");
    const old = mounted.state.tabs.value[0]!;
    old.edit.inserts.push({ id: "draft", values: { 0: "do not lose this" } });
    exchange(mounted, "new");
    await flush();
    expect(mounted.state.closeDialog.value).toMatchObject({ dirty: true });
    mounted.state.finishClose(false);
    await flush();
    expect(mounted.state.tabs.value[0]).toBe(old);
    expect(old.edit.inserts).toHaveLength(1);
    expect(mounted.state.session.value?.id).toBe("old");
    expect(mounted.calls.filter((call) => call.path === "/sessions")).toHaveLength(1);
    expect(mounted.markSessionConnected).toHaveBeenCalledTimes(2);
    mounted.state.session.value!.state = "locked";
    exchange(mounted, "locked-new");
    await flush();
    mounted.state.finishClose(false);
    await flush();
    expect(mounted.markSessionConnected).toHaveBeenCalledTimes(3);
    expect(mounted.state.session.value?.state).toBe("locked");
    mounted.eventReaders[0]!.callback({ sequence: 1, type: "session.closed", data: {} } as GoEvent);
    exchange(mounted, "newer");
    await flush();
    mounted.state.finishClose(false);
    await flush();
    expect(mounted.markSessionDisconnected).toHaveBeenLastCalledWith("workspace", "Chen.GoV1SessionClosed");
  });

  it("discards confirmed old grid references and does not let late child work alter the new draft", async () => {
    const mounted = mountSurface();
    await waitReady(mounted, "old");
    const old = mounted.state.tabs.value[0]!;
    old.edit.inserts.push({ id: "draft", values: { 0: "value" } });
    exchange(mounted, "new");
    await flush();
    mounted.state.finishClose(true);
    await waitReady(mounted, "new");
    // The old child retains its original props, even if its outstanding preview settles now.
    mounted.panes[0]!.query.edit.plan = { plan_id: "old-plan" } as never;
    expect(mounted.panes[0]!.unmounted).toBe(true);
    expect(mounted.state.tabs.value[0]!.edit).toEqual(editing.createEditDraft());
  });

  it("uses the latest token and endpoint when they change during the discard confirmation", async () => {
    const mounted = mountSurface();
    await waitReady(mounted, "old");
    mounted.state.tabs.value[0]!.edit.inserts.push({ id: "draft", values: {} });
    exchange(mounted, "intermediate");
    await flush();
    mounted.tab.payload.endpointUrl = "http://new-chen.test";
    exchange(mounted, "newest");
    await flush();
    mounted.state.finishClose(true);
    await waitReady(mounted, "newest");
    expect(mounted.calls.filter((call) => call.path === "/sessions").map((call) => call.body.connect_token)).toEqual([
      "old",
      "newest"
    ]);
    expect(mounted.calls.find((call) => call.body.connect_token === "newest")?.origin).toBe("http://new-chen.test");
  });

  it.each(["session", "tab"])("ignores a late close-%s response after reconnect", async (target) => {
    const mounted = mountSurface();
    await waitReady(mounted, "old");
    const old = mounted.state.tabs.value[0]!;
    const late = deferred<Response>();
    mounted.blocked.set(target === "session" ? "DELETE /sessions/old" : `DELETE /consoles/${old.console!.id}`, late);
    const closing = target === "session" ? mounted.state.closeSession() : mounted.state.closeTab(old);
    await flush();
    mounted.state.finishClose(true);
    await flush();
    expect(mounted.calls.some((call) => call.method === "DELETE")).toBe(true);
    exchange(mounted, "new");
    await flush();
    if (mounted.state.closeDialog.value) mounted.state.finishClose(true);
    await waitReady(mounted, "new");
    late.resolve(new Response(null, { status: 204 }));
    await closing;
    expect(mounted.state.tabs.value).toHaveLength(1);
    expect(mounted.state.tabs.value[0]!.id).toBe(old.id);
    expect(mounted.state.session.value).toMatchObject({ id: "new", state: "ready" });
    expect(mounted.state.eventConnected.value).toBe(true);
  });

  it("cleans a late console with the old API and ignores old row responses", async () => {
    const mounted = mountSurface();
    await waitReady(mounted, "old");
    const old = mounted.state.tabs.value[0]!;
    old.execution = { id: "execution-old", console_id: old.console!.id, status: "succeeded" } as never;
    const rows = deferred<Response>();
    mounted.blocked.set("GET /results/old-result/rows", rows);
    const loading = mounted.state.loadRows(old, "old-result");
    const console = deferred<Response>();
    mounted.blocked.set("POST /sessions/old/consoles", console);
    const opening = mounted.state.connectQuery(old);
    await flush();
    exchange(mounted, "new");
    await flush();
    mounted.state.finishClose(true);
    await waitReady(mounted, "new");
    console.resolve(json({ id: "late-console", state: "ready", database: "app", schema: "public" }));
    rows.resolve(json({ id: "old-result", rows: [["old"]], columns: [] }));
    await Promise.all([loading, opening]);
    expect(
      mounted.calls.find((call) => call.path === "/consoles/late-console" && call.method === "DELETE")?.bearer
    ).toBe("bearer-old");
    expect(mounted.state.tabs.value[0]!.rows).toBeNull();
  });
});
