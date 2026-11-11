import { isChenSingleRoute } from "~/chen/v1/standalone";
import { isLocalAgentRoute } from "~/shared/agents/route";

export default defineNuxtRouteMiddleware((to) => {
  if (!import.meta.client) return;
  if (
    isLocalAgentRoute(to.path) ||
    isChenSingleRoute(to.path) ||
    to.path.includes("/auth") ||
    to.path.startsWith("/facelive/")
  )
    return;
  void useAuthSession().bootstrapPersistedSession();
});
