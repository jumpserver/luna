import type { VNodeChild } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineAsyncComponent, defineComponent, h, KeepAlive, nextTick, ref, shallowRef } from "vue";
import { useAiTimelineScroll } from "./useAiTimelineScroll";

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function mountTimeline(renderContent: () => VNodeChild) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const height = ref(120);
  const visible = ref(true);
  const revision = ref("pane-1:1:1:0");
  const session = ref("pane-1");
  const request = ref("request-1");
  const messages = shallowRef<HTMLElement | null>(null);
  const content = shallowRef<HTMLElement | null>(null);
  const Timeline = defineComponent({
    setup() {
      useAiTimelineScroll(
        messages,
        content,
        () => revision.value,
        () => session.value,
        () => request.value
      );
      return () =>
        h(
          "main",
          { ref: messages, style: { width: "320px", height: `${height.value}px`, overflowY: "auto", padding: "12px" } },
          h("div", { ref: content }, [renderContent()])
        );
    }
  });
  const app = createApp({
    setup: () => () => h(KeepAlive, null, { default: () => (visible.value ? h(Timeline) : null) })
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { messages, height, visible, revision, session, request };
}

function lines(count: number) {
  return h("pre", { style: { margin: "0", lineHeight: "20px" } }, "terminal output\n".repeat(count));
}

async function expectLatestVisible(element: HTMLElement) {
  expect(element.scrollHeight).toBeGreaterThan(element.clientHeight);
  await expect
    .poll(() => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))
    .toBeLessThanOrEqual(1);
}

describe.skipIf(typeof document === "undefined")("AI timeline scrolling", () => {
  it("opens an existing conversation at the latest message", async () => {
    const { messages } = mountTimeline(() => lines(20));
    await expectLatestVisible(messages.value!);
  });

  it("follows streamed text, tool results, and activity without a revision change", async () => {
    const textLines = ref(0);
    const resultLines = ref(0);
    const active = ref(false);
    const { messages } = mountTimeline(() => [
      lines(textLines.value),
      resultLines.value ? lines(resultLines.value) : null,
      active.value ? h("div", { style: { height: "40px" } }, "Running") : null
    ]);
    await nextTick();

    for (const count of [10, 20]) {
      textLines.value = count;
      await nextTick();
      await expectLatestVisible(messages.value!);
    }
    resultLines.value = 15;
    await nextTick();
    await expectLatestVisible(messages.value!);
    active.value = true;
    await nextTick();
    await expectLatestVisible(messages.value!);
  });

  it("follows content rendered after an asynchronous message component loads", async () => {
    let resolveRenderer!: (component: ReturnType<typeof defineComponent>) => void;
    const AsyncMessage = defineAsyncComponent(
      () => new Promise<ReturnType<typeof defineComponent>>((resolve) => (resolveRenderer = resolve))
    );
    const { messages } = mountTimeline(() => [lines(10), h(AsyncMessage)]);
    await expectLatestVisible(messages.value!);

    resolveRenderer(defineComponent({ setup: () => () => lines(20) }));
    await expect.poll(() => messages.value!.querySelectorAll("pre").length).toBe(2);
    await expectLatestVisible(messages.value!);
  });

  it("keeps the latest message visible after resizing, reactivation, and switching sessions", async () => {
    const { messages, height, visible, revision, session } = mountTimeline(() => lines(20));
    await expectLatestVisible(messages.value!);
    height.value = 80;
    await nextTick();
    await expectLatestVisible(messages.value!);

    messages.value!.scrollTop = 0;
    session.value = "pane-2";
    revision.value = "pane-2:1:1:0";
    await nextTick();
    await expectLatestVisible(messages.value!);

    messages.value!.scrollTop = 0;
    visible.value = false;
    await nextTick();
    visible.value = true;
    await nextTick();
    await expectLatestVisible(messages.value!);
  });

  it("preserves reading position during new output and resumes at the bottom", async () => {
    const count = ref(20);
    const { messages, revision } = mountTimeline(() => lines(count.value));
    const element = messages.value!;
    await expectLatestVisible(element);
    element.scrollTop = 40;
    element.dispatchEvent(new Event("scroll"));
    count.value = 30;
    revision.value = "pane-1:2:1:100";
    await nextTick();
    await new Promise(requestAnimationFrame);
    expect(element.scrollTop).toBe(40);
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
    count.value = 40;
    await nextTick();
    await expectLatestVisible(element);
  });

  it("keeps following when a queued scroll event arrives after the next stream update", async () => {
    const count = ref(20);
    const { messages } = mountTimeline(() => lines(count.value));
    const element = messages.value!;
    await expectLatestVisible(element);
    const previousTop = element.scrollTop;
    count.value = 30;
    await nextTick();
    // The browser can deliver the previous automatic scroll after the DOM has grown,
    // before ResizeObserver has moved the viewport to the new bottom.
    expect(element.scrollTop).toBe(previousTop);
    element.dispatchEvent(new Event("scroll"));
    await expectLatestVisible(element);
  });

  it("does not jump past details opened at the bottom of the conversation", async () => {
    const expanded = ref(false);
    const { messages } = mountTimeline(() => [
      lines(20),
      h("button", { "aria-expanded": expanded.value, onClick: () => (expanded.value = !expanded.value) }, "Details"),
      expanded.value ? lines(30) : null
    ]);
    const element = messages.value!;
    await expectLatestVisible(element);
    const previousTop = element.scrollTop;
    element.querySelector("button")!.click();
    await nextTick();
    await new Promise(requestAnimationFrame);
    expect(element.scrollTop).toBe(previousTop);
  });

  it("resumes following a new request after the user has opened older details", async () => {
    const count = ref(20);
    const expanded = ref(false);
    const { messages, request } = mountTimeline(() => [
      lines(count.value),
      h("button", { "aria-expanded": expanded.value, onClick: () => (expanded.value = !expanded.value) }, "Details"),
      expanded.value ? lines(30) : null
    ]);
    const element = messages.value!;
    await expectLatestVisible(element);
    element.querySelector("button")!.click();
    await nextTick();
    await new Promise(requestAnimationFrame);
    expect(element.scrollHeight - element.clientHeight - element.scrollTop).toBeGreaterThan(24);
    request.value = "request-2";
    await nextTick();
    await expectLatestVisible(element);
    count.value = 40;
    await nextTick();
    await expectLatestVisible(element);
  });
});
