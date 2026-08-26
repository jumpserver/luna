export default defineNuxtPlugin(() => {
  const { buildTime } = useRuntimeConfig().public;

  console.info(
    `%c 🚀 Luna %c Build Time: ${buildTime} %c`,
    "background:#409eff;color:#fff;padding:4px 8px;border-radius:4px 0 0 4px;font-weight:bold",
    "background:#1f2d3d;color:#67c23a;padding:4px 8px;border-radius:0 4px 4px 0;font-weight:bold",
    "background:transparent"
  );
});
