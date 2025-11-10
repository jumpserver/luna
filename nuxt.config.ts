export default defineNuxtConfig({
  srcDir: "ui/",
  modules: [
    "@nuxt/ui",
    "@pinia/nuxt",
    "@nuxt/icon",
    "@nuxt/fonts",
    "@nuxt/eslint",
    "@vueuse/nuxt",
    "@nuxtjs/i18n",
    "reka-ui/nuxt",
    "pinia-plugin-persistedstate/nuxt",
  ],
  i18n: {
    locales: [
      { code: "zh", name: "简体中文", file: "zh.json" },
      { code: "en", name: "English", file: "en.json" }
    ],
    defaultLocale: "zh"
  },
  app: {
    head: {
      title: "JumpServer Client",
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
      meta: [{ name: "format-detection", content: "no" }]
    },
    pageTransition: {
      name: "page",
      mode: "out-in"
    },
    layoutTransition: {
      name: "layout",
      mode: "out-in"
    }
  },
  css: ["@/assets/css/main.css"],
  fonts: {
    providers: {
      google: false,
      googleicons: false
    },
    priority: ["bunny"]
  },
  icon: {
    mode: "css",
    cssLayer: "base",
    serverBundle: {
      collections: [
        "mingcute",
        "lucide",
        "line-md",
        "proicons",
        "lets-icons",
        "fluent",
        "gravity-ui",
        "solar",
        "akar-icons"
      ]
    }
  },
  ssr: false,
  dir: {
    modules: "ui/modules"
  },
  vite: {
    clearScreen: false,
    envPrefix: ["VITE_", "TAURI_"],
    server: {
      strictPort: true,
      hmr: {
        protocol: "ws",
        host: "0.0.0.0",
        port: 3001
      },
      watch: {
        ignored: ["**/src-tauri/**"]
      }
    }
  },
  devServer: {
    host: "127.0.0.1"
  },
  router: {
    options: {
      scrollBehaviorType: "smooth"
    }
  },
  eslint: {
    config: {
      standalone: false
    }
  },
  devtools: {
    enabled: false
  },
  experimental: {
    typedPages: true
  },
  compatibilityDate: "2025-07-01"
});
