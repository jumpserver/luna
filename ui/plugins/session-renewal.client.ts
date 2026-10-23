import { apiRequest } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";

export default defineNuxtPlugin((nuxtApp) => {
  const userInfoStore = useUserInfoStore();
  const controller = new AbortController();
  let lastRenewalAt = -Infinity;
  let inFlight = false;

  function onActivity(event: Event) {
    if (!event.isTrusted || !userInfoStore.loggedIn) return;

    const now = performance.now();
    if (inFlight || now - lastRenewalAt < 10_000) return;

    // All workspace panes share this limit; idle time never schedules a request.
    lastRenewalAt = now;
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
