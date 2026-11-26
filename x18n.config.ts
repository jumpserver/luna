import { defineConfig } from "@x18n/core";

// Detected presets: nuxt-i18n, vue-i18n. They apply automatically.
export default defineConfig({
  sourceLocale: "en",
  ignoreLocales: ["zh_Hant"],
  projects: [".", "packages/web-proxy"],
  usage: {
    exclude: [
      "packages/web-proxy/**",
      "ui/components/Settings/localCodex/**",
      "ui/components/Settings/localCodex.vue",
      "ui/composables/useLocalCodex.ts",
      "ui/utils/frenchComponents.test.ts"
    ]
  },
  resources: [
    {
      pattern: "i18n/locales/{locale}.{ext}"
    },
    {
      pattern: "ui/lion/locales/modules/zh_Hant.json",
      locale: "zh_hant"
    },
    {
      pattern: "ui/lion/locales/modules/{locale}.json"
    }
  ]
});
