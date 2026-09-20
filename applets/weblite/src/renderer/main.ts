import { createApp } from "vue";
import { createI18n } from "vue-i18n";
import { normalizeLanguageCode } from "../../../../i18n/language";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import "./style.css";
const i18n = createI18n({ legacy: false, locale: normalizeLanguageCode(navigator.language), fallbackLocale: "en" });
createApp(App).use(i18n).use(ui).mount("#app");
