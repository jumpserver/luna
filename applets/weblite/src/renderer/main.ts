import { createApp } from "vue";
import { createI18n } from "vue-i18n";
import { normalizeLanguageCode } from "../../../../i18n/language";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import "./style.css";
async function start() {
  // Resolve the launch language before mounting so no system-language frame flashes
  // when a client launches WebLite with a different language.
  const request = await (window as any).webApplet.invoke("bootstrap");
  const i18n = createI18n({
    legacy: false,
    locale: normalizeLanguageCode(request.language || navigator.language),
    fallbackLocale: "en"
  });
  createApp(App, { request }).use(i18n).use(ui).mount("#app");
}
void start();
