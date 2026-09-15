export default defineNuxtRouteMiddleware((to) => {
  if (!import.meta.client) return;
  if (to.path.includes("/auth") || to.path.startsWith("/facelive/")) return;
  void useAuthSession().bootstrapPersistedSession();
});
