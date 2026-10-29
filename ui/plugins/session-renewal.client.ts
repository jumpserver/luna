import { isChenSingleRoute } from "~/chen/v1/standalone";
import { apiRequest } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";

export default defineNuxtPlugin((nuxtApp) => {
  // Desktop input is observed in the main process across its managed windows and views.
  if (isDesktopRuntime()) return;
  const route = useRoute();
  const userInfoStore = useUserInfoStore();
  const controller = new AbortController();
  let lastActivitySentAt = -Infinity;
  let inFlight = false;

  function onActivity(event: Event) {
    if (isChenSingleRoute(route.path) || !event.isTrusted || !userInfoStore.loggedIn) return;

    const now = performance.now();
    if (inFlight || now - lastActivitySentAt < 10_000) return;

    // Only real activity triggers renewal; idle time never schedules a request.
    lastActivitySentAt = now;
    inFlight = true;
    void apiRequest({
      method: "GET",
      path: "/api/v1/health/",
      headers: { "Cache-Control": "no-cache" },
      timeoutMs: 10_000
    })
      .catch(() => {
        // Authentication failures use the API wrapper's existing login flow.
        // Other failures wait for the next user action instead of retrying while idle.
      })
      .finally(() => {
        inFlight = false;
      });
  }

  for (const type of ["keydown", "pointerdown", "pointermove", "wheel"]) {
    document.addEventListener(type, onActivity, { capture: true, passive: true, signal: controller.signal });
  }

  const dispose = () => controller.abort();
  nuxtApp.vueApp.onUnmount(dispose);
  import.meta.hot?.dispose(dispose);
});
