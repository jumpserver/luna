export default defineNuxtRouteMiddleware(async (to) => {
  if (!import.meta.client) return;
  if (to.path.includes("/auth")) return;
  await useAuthSession().bootstrapPersistedSession();
});
