import { isChenSingleRoute } from "~/chen/v1/standalone";

export default defineNuxtRouteMiddleware((to) => {
  if (!import.meta.client) return;
  if (isChenSingleRoute(to.path) || to.path.includes("/auth") || to.path.startsWith("/facelive/")) return;
  void useAuthSession().bootstrapPersistedSession();
});
