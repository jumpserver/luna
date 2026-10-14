import { compile as compileTailwind } from "tailwindcss";
import preflight from "tailwindcss/preflight.css?raw";
import theme from "tailwindcss/theme.css?raw";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import * as faceLive from "~/utils/faceLive";
import captureSource from "../Face/FaceTokenCapture.vue?raw";
import overlay from "./connectionProgressOverlay.vue?raw";

function compileComponent(source: string, scope: Record<string, unknown>) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "connection-face-layout-test", inlineTemplate: true });
  const { outputText } = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
  return new Function("require", ...Object.keys(scope), `const exports = {};\n${outputText}\nreturn exports.default;`)(
    (name: string) => (name === "vue" ? Vue : faceLive),
    ...Object.values(scope)
  );
}

const labels: Record<string, string> = {
  "Common.Cancel": "取消",
  "Face.Remote.AuthTitle": "人脸身份认证",
  "Face.Remote.CameraReady": "摄像头已就绪",
  "Face.Remote.LookStraight": "请正视摄像头，并将面部保持在引导框内"
};
const i18n = () => ({ t: (key: string) => labels[key] || key });
const captureState = () => ({
  video: Vue.shallowRef(null),
  overlay: Vue.ref(null),
  cameras: Vue.ref([{ label: "MacBook Pro 相机", deviceId: "test-camera" }]),
  selectedDeviceId: Vue.ref("test-camera"),
  starting: Vue.ref(false),
  switchCamera: vi.fn(),
  latest: Vue.ref(null),
  serverMode: Vue.ref("auth"),
  clientState: Vue.ref("active"),
  errorCode: Vue.ref(""),
  errorMessage: Vue.ref(""),
  retryable: Vue.ref(false),
  start: vi.fn()
});
const button = Vue.defineComponent({
  props: ["as", "square"],
  setup:
    (props, { slots }) =>
    () =>
      Vue.h(
        props.as || "button",
        {
          style: props.square
            ? "display:inline-flex;width:44px;height:44px;align-items:center;justify-content:center"
            : "padding:8px 12px;font-size:14px;line-height:20px;border-radius:6px;background:#3d3838;color:white"
        },
        slots.default?.()
      )
});

async function mountFaceOverlay(width: number, height: number) {
  const { page } = await import("vitest/browser");
  await page.viewport(width, height);
  const close = vi.fn();
  const group = Vue.ref({
    id: "asset",
    code: "acl_face_verify",
    submitted: true,
    faceUrl: "about:blank",
    items: [{ status: "verifying", settled: false }]
  });
  const component = compileComponent(overlay, {
    ...Vue,
    useI18n: i18n,
    useAclDialog: () => ({
      close,
      failFace: vi.fn(),
      findScopeGroup: () => group.value,
      markFacePageReady: vi.fn(),
      retryFace: vi.fn(),
      submit: vi.fn()
    }),
    useAclDialogPresentation: () => ({
      description: Vue.ref("请完成人脸验证。"),
      isReview: Vue.ref(false)
    })
  });
  const capture = compileComponent(captureSource, {
    ...Vue,
    useI18n: i18n,
    useRemoteFaceCapture: captureState
  });
  // Compile production utilities from the real templates rather than recreating the layout in the fixture.
  const tailwind = await compileTailwind(`${theme}\n${preflight}\n@tailwind utilities;`);
  const candidates = `${overlay}\n${captureSource}\nh-dvh overflow-y-auto`.match(/[A-Za-z0-9_:!\-/.\[\](,%#)]+/g) || [];
  const utilities = tailwind.build(candidates);
  const base = `:root{--app-bg:#242020;--app-fg:#eee;--app-border:#514949;--app-muted:#c5b8b8;--theme-accent:#2acba0;--workspace-surface-background:#242020} html{font-size:16px} body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#242020;color:#eee} *,::before,::after{box-sizing:border-box} .error-copy{animation:none!important}`;
  const outerStyle = document.createElement("style");
  outerStyle.textContent = `${base}\n${utilities}\n${parse(overlay)
    .descriptor.styles.map((style) => style.content)
    .join("\n")}`;
  document.head.append(outerStyle);
  const host = document.createElement("div");
  host.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden`;
  document.body.append(host);
  const cancel = vi.fn();
  const app = Vue.createApp(component, { paneId: "asset", stage: "token", onCancel: cancel });
  app.component("UButton", button);
  app.mount(host);
  await Vue.nextTick();
  const iframe = host.querySelector("iframe")!;
  // A same-origin inert document exercises the real capture styles without camera or API access.
  const frameDocument = iframe.contentDocument!;
  frameDocument.open();
  frameDocument.write(
    `<html><head><style>${base}\n${utilities}\n${parse(captureSource)
      .descriptor.styles.map((style) => style.content)
      .join("\n")}</style></head><body><main class="h-dvh overflow-y-auto"></main></body></html>`
  );
  frameDocument.close();
  const captureApp = Vue.createApp(capture, { token: "a".repeat(32), mode: "capture" });
  captureApp.component("UIcon", { render: () => Vue.h("svg", { width: 16, height: 16 }) });
  captureApp.component("USelect", {
    render: () =>
      Vue.h(
        "button",
        {
          style:
            "display:flex;min-width:0;height:32px;padding:4px 8px;font-size:12px;border:1px solid #665e5e;border-radius:6px;background:transparent;color:inherit"
        },
        Vue.h("span", { class: "truncate" }, "MacBook Pro 相机")
      )
  });
  captureApp.component("UButton", button);
  captureApp.mount(frameDocument.querySelector("main")!);
  await Vue.nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return {
    host,
    page,
    iframe,
    frameDocument,
    close,
    cancel,
    cleanup: () => {
      captureApp.unmount();
      app.unmount();
      host.remove();
      outerStyle.remove();
    }
  };
}

function expectWithin(inner: DOMRect, outer: DOMRect) {
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - 1);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 1);
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - 1);
  expect(inner.right).toBeLessThanOrEqual(outer.right + 1);
}

describe("workspace connection progress overlay", () => {
  it("allows post-connection failures to reveal the underlying connector output", () => {
    expect(overlay).toContain("dismissible?: boolean");
    expect(overlay).toContain('v-show="!dismissed"');
    expect(overlay).toContain('v-if="failed && dismissible"');
    expect(overlay).toContain('class="absolute top-6 right-6 z-10"');
    expect(overlay).toContain('@click="dismiss"');
  });

  it("preserves normalized diagnostic line breaks", () => {
    expect(overlay).toContain("whitespace-pre-wrap");
    expect(overlay).toContain("wrap-break-word");
  });

  it.skipIf(typeof document === "undefined").each([
    [1000, 680],
    [800, 500],
    [500, 360],
    [320, 480]
  ])("keeps face content and cancellation reachable in a %s x %s asset pane", async (width, height) => {
    const fixture = await mountFaceOverlay(width, height);
    try {
      const { host, iframe, frameDocument, page } = fixture;
      const root = host.firstElementChild as HTMLElement;
      const cancelButton = [...host.querySelectorAll("button")].find((element) => element.textContent === "取消")!;
      expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
      const capturePage = frameDocument.querySelector("main")!;
      expect(capturePage.scrollWidth).toBeLessThanOrEqual(capturePage.clientWidth + 1);
      const guide = frameDocument.querySelector(".face-token-capture__guide")!.getBoundingClientRect();
      const stage = frameDocument.querySelector(".face-token-capture__stage")!.getBoundingClientRect();
      expectWithin(guide, stage);
      const footer = frameDocument.querySelector(".face-token-capture__footer")!.getBoundingClientRect();
      expect(footer.bottom).toBeLessThanOrEqual(iframe.clientHeight + 1);
      if (height >= 680) {
        expectWithin(iframe.getBoundingClientRect(), host.getBoundingClientRect());
        expectWithin(cancelButton.getBoundingClientRect(), host.getBoundingClientRect());
      }
      // Smaller workspaces may scroll the card, but both endpoints must remain reachable.
      for (
        let ancestor = cancelButton.parentElement;
        ancestor && ancestor !== host;
        ancestor = ancestor.parentElement
      ) {
        ancestor.scrollTop = ancestor.scrollHeight;
      }
      await Vue.nextTick();
      expectWithin(cancelButton.getBoundingClientRect(), host.getBoundingClientRect());
      await page.elementLocator(cancelButton).click();
      await Vue.nextTick();
      expect(fixture.close).toHaveBeenCalledOnce();
      expect(fixture.cancel).toHaveBeenCalledOnce();
    } finally {
      fixture.cleanup();
    }
  });
});
