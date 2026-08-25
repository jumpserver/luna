import WatermarkDesign from "@watermark-design/vue";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(WatermarkDesign);
});
