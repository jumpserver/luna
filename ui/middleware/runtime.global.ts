import { isTauriRuntime } from "~/utils/runtime";

function isReplayRoute(path: string) {
  return /(?:^|\/)replay(?:\/|$)/.test(path);
}

export default defineNuxtRouteMiddleware((to) => {
  if (!isReplayRoute(to.path)) return;

  to.meta.replayWebOnly = true;
  to.meta.replayBlocked = isTauriRuntime();
});
