export default defineNuxtRouteMiddleware(async () => {
  if (!import.meta.client) return;
  await useAuthSession().bootstrapPersistedSession();
});
