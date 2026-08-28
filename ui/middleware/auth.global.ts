export default defineNuxtRouteMiddleware((to) => {
  if (!import.meta.client) return;
  if (to.path.includes("/auth")) return;
  void useAuthSession().bootstrapPersistedSession();
});
