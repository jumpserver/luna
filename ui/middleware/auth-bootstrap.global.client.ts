export default defineNuxtRouteMiddleware(async (to) => {
  // 进入离线播放器和转码不需要登录验证
  if (to.query.tool_window === "1") return;

  await useAuthSession().bootstrapPersistedSession();
});
