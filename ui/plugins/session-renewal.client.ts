import { isChenSingleRoute } from "~/chen/v1/standalone";
import { apiRequest } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute();
  const userInfoStore = useUserInfoStore();
  const controller = new AbortController();
  let lastActivitySentAt = -Infinity;
  let inFlight = false;

  function onActivity(event: Event) {
    if (isChenSingleRoute(route.path) || !event.isTrusted || !userInfoStore.loggedIn) return;

    const desktop = isDesktopRuntime();
    // Only idle expiry needs input reports; the desktop main process also monitors login validity.
    if (desktop && (userInfoStore.currentUser?.clientLoginPolicy?.max_idle_time ?? 0) <= 0) return;

    const now = performance.now();
    // Desktop only limits input IPC noise here; the main process owns the shared 10-second network budget.
    const activityInterval = desktop ? 1_000 : 10_000;
    if (inFlight || now - lastActivitySentAt < activityInterval) return;

    // Only real activity triggers renewal; idle time never schedules a request.
    lastActivitySentAt = now;
    inFlight = true;
    void apiRequest({
      method: desktop ? "POST" : "GET",
      path: desktop ? "/api/v1/authentication/client-login-session/activity/" : "/api/v1/health/",
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
