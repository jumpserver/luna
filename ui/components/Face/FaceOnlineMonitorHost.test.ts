import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import { useConnectionSetupDrag } from "~/components/Workspace/useConnectionSetupDrag";
import { collectActiveFaceMonitorTokens, localizeFaceLiveDetail } from "~/utils/faceLive";
import source from "./FaceOnlineMonitorHost.vue?raw";

it.skipIf(typeof document === "undefined")(
  "keeps one monitor alert per state and translates initialization failures",
  async () => {
    const toast = { add: vi.fn(), remove: vi.fn() };
    let flowEvent: (event: string, detail?: string) => void;
    const capture = Vue.defineComponent({
      emits: ["flowEvent"],
      setup(_props, { emit }) {
        flowEvent = (event, detail = "") => emit("flowEvent", { event, flow: { detail } });
        return () => Vue.h("div");
      }
    });
    const services = {
      ...Vue,
      useI18n: () => ({ t: (key: string) => key }),
      useToast: () => toast,
      useWorkspaceTabs: () => ({
        tabs: Vue.ref([{ panes: [{ status: "connected", payload: { face_monitor_token: "a".repeat(32) } }] }])
      })
    };
    const { descriptor } = parse(source);
    const script = compileScript(descriptor, { id: "face-monitor-test", inlineTemplate: true });
    const { outputText } = ts.transpileModule(script.content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS }
    });
    const component = new Function(
      "require",
      ...Object.keys(services),
      `const exports = {};\n${outputText}\nreturn exports.default;`
    )(
      (name: string) => {
        if (name === "vue") return Vue;
        if (name.endsWith("FaceTokenCapture.vue")) return { __esModule: true, default: capture };
        return { useConnectionSetupDrag, collectActiveFaceMonitorTokens, localizeFaceLiveDetail };
      },
      ...Object.values(services)
    );
    const host = document.createElement("div");
    document.body.append(host);
    const app = Vue.createApp(component);
    app.component("UIcon", { render: () => Vue.h("svg") });
    for (const name of ["UBadge", "UButton"]) app.component(name, { render: () => null });
    app.mount(host);
    try {
      flowEvent!("monitor_away_warning");
      flowEvent!("monitor_away_warning");
      expect(toast.add).toHaveBeenCalledTimes(1);
      flowEvent!("monitor_away_timeout");
      flowEvent!("monitor_away_timeout");
      expect(toast.add).toHaveBeenCalledTimes(2);
      expect(toast.add.mock.calls.map(([value]) => value.id)).toEqual(["face-monitor-state", "face-monitor-state"]);
      flowEvent!("monitor_returned");
      expect(toast.remove).toHaveBeenCalledWith("face-monitor-state");
      flowEvent!("monitor_init_failed", "The liveness action was not completed in time");
      expect(toast.add).toHaveBeenLastCalledWith(
        expect.objectContaining({ description: "Face.Remote.LivenessTimedOut" })
      );
    } finally {
      app.unmount();
      host.remove();
    }
  }
);
