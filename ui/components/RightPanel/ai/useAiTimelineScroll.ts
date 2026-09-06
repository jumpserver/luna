import type { Ref, WatchSource } from "vue";
import { useEventListener, useResizeObserver } from "@vueuse/core";
import { nextTick, onActivated, watch } from "vue";

export function useAiTimelineScroll(
  messagesElement: Readonly<Ref<HTMLElement | null>>,
  contentElement: Readonly<Ref<HTMLElement | null>>,
  revision: WatchSource<unknown>,
  session: WatchSource<unknown>,
  request?: WatchSource<unknown>
) {
  let followingLatest = true;
  let lastScrollTop = 0;

  function scrollToBottom() {
    const element = messagesElement.value;
    if (element && followingLatest) {
      element.scrollTop = element.scrollHeight;
      lastScrollTop = element.scrollTop;
    }
  }

  function resumeFollowing() {
    followingLatest = true;
    void nextTick(scrollToBottom);
  }

  useEventListener(
    messagesElement,
    "scroll",
    () => {
      const element = messagesElement.value;
      if (!element) return;
      const top = element.scrollTop;
      // A queued automatic scroll can arrive after new output has moved the bottom.
      // Only actual movement changes whether the user is following or reading history.
      if (top !== lastScrollTop) {
        const atBottom = element.scrollHeight - element.clientHeight - top <= 24;
        if (top < lastScrollTop || atBottom) followingLatest = atBottom;
        lastScrollTop = top;
      }
    },
    { passive: true }
  );

  // Reading a disclosure should keep its trigger in view, including when it was at the bottom.
  useEventListener(contentElement, "click", (event) => {
    if (event.target instanceof Element && event.target.closest("button[aria-expanded]")) followingLatest = false;
  });

  // Tool results and async renderers can grow after the message revision has settled.
  useResizeObserver([messagesElement, contentElement], scrollToBottom);
  watch(revision, scrollToBottom, { flush: "post" });
  watch(session, resumeFollowing, { flush: "post" });
  if (request) watch(request, resumeFollowing, { flush: "post" });
  onActivated(resumeFollowing);
}
