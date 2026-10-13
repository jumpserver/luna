import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import source from "./FaceTokenCapture.vue?raw";

function mountCapture(width: number, height: number) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "face-capture-test", inlineTemplate: true });
  const { outputText } = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
  const capture = {
    video: Vue.shallowRef(null),
    overlay: Vue.ref(null),
    cameras: Vue.ref([]),
    latest: Vue.ref(null),
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
  )(() => Vue, ...Object.values(scope));
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
