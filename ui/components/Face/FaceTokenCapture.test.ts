import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import { localizeFaceLiveDetail } from "~/utils/faceLive";
import source from "./FaceTokenCapture.vue?raw";

function mountCapture(width: number, height: number, flow: unknown = null) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "face-capture-test", inlineTemplate: true });
  const { outputText } = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
  const capture = {
    video: Vue.shallowRef(null),
    overlay: Vue.ref(null),
    cameras: Vue.ref([]),
    latest: Vue.ref(flow ? { flow } : null),
    serverMode: Vue.ref("auth"),
    clientState: Vue.ref("idle"),
    errorCode: Vue.ref(""),
    errorMessage: Vue.ref(""),
    retryable: Vue.ref(false),
    start: vi.fn()
  };
  const scope = {
    ...Vue,
    useI18n: () => ({ t: (key: string) => key }),
    useRemoteFaceCapture: () => capture
  };
  const component = new Function(
    "require",
    ...Object.keys(scope),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )((name: string) => (name === "vue" ? Vue : { localizeFaceLiveDetail }), ...Object.values(scope));
  const host = document.createElement("div");
  host.style.cssText = `width:${width}px;height:${height}px;overflow:auto`;
  const style = document.createElement("style");
  style.textContent = `* { box-sizing: border-box; } h1,p { margin:0; } ${descriptor.styles[0]!.content}`;
  document.head.append(style);
  document.body.append(host);
  const app = Vue.createApp(component, { token: "a".repeat(32), mode: "capture" });
  app.component("UIcon", { render: () => Vue.h("svg", { width: 16, height: 16 }) });
  app.component("USelect", { render: () => null });
  app.component("UButton", { render: () => null });
  app.mount(host);
  return {
    host,
    capture,
    cleanup: () => {
      app.unmount();
      host.remove();
      style.remove();
    }
  };
}

it.skipIf(typeof document === "undefined").each([
  [570, 300],
  [570, 480],
  [320, 300],
  [320, 480]
])("keeps the face guide complete in a %s x %s capture frame", async (width, height) => {
  const { host, cleanup } = mountCapture(width, height);
  try {
    await Vue.nextTick();
    const stage = host.querySelector(".face-token-capture__stage")!.getBoundingClientRect();
    const guide = host.querySelector(".face-token-capture__guide")!.getBoundingClientRect();
    expect(guide.top).toBeGreaterThanOrEqual(stage.top);
    expect(guide.bottom).toBeLessThanOrEqual(stage.bottom);
    host.scrollTop = host.scrollHeight;
    const footer = host.querySelector(".face-token-capture__footer")!.getBoundingClientRect();
    expect(footer.bottom).toBeLessThanOrEqual(host.getBoundingClientRect().bottom);
  } finally {
    cleanup();
  }
});

it.skipIf(typeof document === "undefined")(
  "shows the translated terminal error instead of requesting an expired action",
  async () => {
    const { host, cleanup } = mountCapture(570, 480, {
      mode: "auth",
      status: "auth_failed",
      detail: "The liveness action was not completed in time",
      finished: true,
      challenge: { type: "open_mouth", passed: false, calibrated: true, score: 0 }
    });
    try {
      await Vue.nextTick();
      expect(host.querySelector(".face-token-capture__message")!.textContent).toBe("Face.Remote.LivenessTimedOut");
    } finally {
      cleanup();
    }
  }
);

it.skipIf(typeof document === "undefined").each([
  ["browser_unsupported", "Camera access is unavailable"],
  ["camera_denied", "Permission denied"],
  ["camera_not_found", "Requested device not found"],
  ["camera_failed", "Could not start video source"]
])("shows localized help instead of browser details for %s", async (code, message) => {
  const { host, capture, cleanup } = mountCapture(570, 480);
  try {
    capture.clientState.value = "error";
    capture.errorCode.value = code;
    capture.errorMessage.value = message;
    await Vue.nextTick();
    expect(host.querySelector(".face-token-capture__message")!.textContent).toBe(`Face.Remote.ErrorHint.${code}`);
    expect(host.textContent).not.toContain(message);
  } finally {
    cleanup();
  }
});

it.skipIf(typeof document === "undefined")(
  "prioritizes camera failure help over an active liveness action",
  async () => {
    const { host, capture, cleanup } = mountCapture(570, 480, {
      mode: "auth",
      status: "authenticating",
      finished: false,
      challenge: { type: "open_mouth", passed: false, calibrated: true, score: 0 }
    });
    try {
      capture.clientState.value = "error";
      capture.errorCode.value = "camera_failed";
      capture.errorMessage.value = "Could not start video source";
      await Vue.nextTick();
      expect(host.querySelector(".face-token-capture__message")!.textContent).toBe(
        "Face.Remote.ErrorHint.camera_failed"
      );
      expect(host.textContent).not.toContain("Could not start video source");
      expect(host.textContent).not.toContain("Face.Remote.Challenge.open_mouth");
    } finally {
      cleanup();
    }
  }
);
