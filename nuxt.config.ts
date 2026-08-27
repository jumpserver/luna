const jumpServerTarget = process.env.JMS_CORE_DEV_URL || "http://localhost:8080";
const kokoTarget = process.env.JMS_KOKO_DEV_URL || "http://localhost:5050";
// JMS_LION_DEV_URL remains a compatibility override; Lion is served by Koko by default.
const lionTarget = process.env.JMS_LION_DEV_URL || kokoTarget;
const chenTarget = process.env.JMS_CHEN_DEV_URL || "http://localhost:8082";
const faceliveTarget = process.env.JMS_FACELIVE_DEV_URL || "http://localhost:5173";
const kaelTarget = process.env.JMS_KAEL_DEV_URL || "http://localhost:5172";
const uiTarget = process.env.JMS_UI_DEV_URL || "http://localhost:9528";
const appBaseURL = process.env.NUXT_APP_BASE_URL || "/luna/";
const buildTime = new Date().toLocaleString("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour12: false
});

const getProxyOrigin = (target: string) => new URL(target).origin;
const rewriteProxyOrigin = (target: string) => (proxy: any) => {
  const origin = getProxyOrigin(target);
  proxy.on("proxyReq", (proxyReq: any) => {
    proxyReq.setHeader("Origin", origin);
  });
};
const bindProxyErrorHandler = (name: string) => (proxy: any) => {
  proxy.on("error", (error: Error) => {
    // ponytail: keep dev server alive on transient ws resets; escalate to backend health checks if resets persist.
    console.warn(`[proxy:${name}]`, error?.message || error);
  });
};
const configureHttpProxy = (name: string, target: string) => (proxy: any) => {
  rewriteProxyOrigin(target)(proxy);
  bindProxyErrorHandler(name)(proxy);
};

export default defineNuxtConfig({
  extends: ["@jumpserver/koko/nuxt", "@jumpserver/online-player/nuxt"],
  runtimeConfig: {
    public: {
      buildTime
    }
  },
  typescript: {
    tsConfig: {
      include: ["../packages/koko/app/**/*", "../packages/online-player/app/**/*"],
      exclude: ["../electron/**/*"]
    }
  },
  srcDir: "ui/",
  modules: [
    "@nuxt/ui",
    "@pinia/nuxt",
    "@nuxt/icon",
    "@nuxt/eslint",
    "@vueuse/nuxt",
    "@nuxtjs/i18n",
    "reka-ui/nuxt",
    "pinia-plugin-persistedstate/nuxt"
  ],
  ui: {
    fonts: false
  },
  i18n: {
    locales: [
      { code: "zh", name: "简体中文", file: "zh.json" },
      { code: "en", name: "English", file: "en.json" }
    ],
    defaultLocale: "zh",
    strategy: "no_prefix"
  },
  app: {
    baseURL: appBaseURL,
    head: {
      title: "JumpServer",
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
  icon: {
    provider: "none",
    fallbackToApi: false,
    mode: "svg",
    collections: ["mingcute", "lucide", "line-md", "proicons", "fluent", "solar", "tabler", "si"],
    clientBundle: {
      scan: {
        globInclude: [
          "ui/**/*.{vue,ts,js}",
          "packages/koko/**/*.{vue,ts,js}",
          "packages/online-player/**/*.{vue,ts,js}"
        ]
      }
    }
  },
  ssr: false,
  dir: {
    modules: "ui/modules"
  },
  vite: {
    clearScreen: false,
    envPrefix: ["VITE_"],
    // Chen is loaded lazily. Pre-bundle its exclusive dependencies at startup
    // so Vite does not discover them on first entry and reload the whole app.
    optimizeDeps: {
      include: ["ag-grid-community", "ag-grid-vue3", "sql-formatter"]
    },
    server: {
      strictPort: true,
      hmr: {
        protocol: "ws",
        host: "0.0.0.0",
        port: Number(process.env.JMS_HMR_PORT || 3001)
      },
      proxy: {
        "/luna/koko/ws/": {
          target: kokoTarget.replace(/^http/i, "ws"),
          secure: false,
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/luna/, ""),
          configure: bindProxyErrorHandler("luna-koko-ws")
        },
        "/koko/ws/": {
          target: kokoTarget.replace(/^http/i, "ws"),
          secure: false,
          ws: true,
          changeOrigin: true,
          configure: bindProxyErrorHandler("koko-ws")
        },
        "/koko/": {
          target: kokoTarget,
          secure: false,
          ws: true,
          changeOrigin: true,
          configure: bindProxyErrorHandler("koko-http")
        },
        "/media/": {
          target: jumpServerTarget,
          secure: false,
          changeOrigin: true,
          configure: rewriteProxyOrigin(jumpServerTarget)
        },
        "/api/": {
          target: jumpServerTarget,
          secure: false,
          changeOrigin: true,
          configure: rewriteProxyOrigin(jumpServerTarget)
        },
        "/ws/": {
          target: jumpServerTarget.replace(/^http/, "ws"),
          secure: false,
          ws: true,
          changeOrigin: true
        },
        "/core": {
          target: jumpServerTarget,
          secure: false,
          changeOrigin: true,
          configure: rewriteProxyOrigin(jumpServerTarget)
        },
        "/static": {
          target: jumpServerTarget,
          secure: false,
          changeOrigin: true,
          configure: rewriteProxyOrigin(jumpServerTarget)
        },
        "/lion/ws/": {
          target: lionTarget.replace(/^http/i, "ws"),
          secure: false,
          ws: true,
          changeOrigin: true,
          configure: bindProxyErrorHandler("lion-ws")
        },
        "/lion/api/": {
          target: lionTarget,
          secure: false,
          changeOrigin: true,
          configure: configureHttpProxy("lion-api", lionTarget)
        },
        "/lion/token/": {
          target: lionTarget,
          secure: false,
          changeOrigin: true,
          configure: bindProxyErrorHandler("lion-token")
        },
        "/lion/health/": {
          target: lionTarget,
          secure: false,
          changeOrigin: true,
          configure: bindProxyErrorHandler("lion-health")
        },
        "/chen/ws/": {
          target: chenTarget.replace(/^http/i, "ws"),
          secure: false,
          ws: true,
          changeOrigin: true,
          configure: bindProxyErrorHandler("chen-ws")
        },
        "/chen": {
          target: chenTarget,
          secure: false,
          ws: true,
          changeOrigin: true,
          configure: bindProxyErrorHandler("chen-http")
        },
        "/facelive": {
          target: faceliveTarget,
          secure: false,
          ws: true,
          changeOrigin: true
        },
        "/kael": {
          target: kaelTarget,
          secure: false,
          ws: true,
          changeOrigin: true
        },
        "/ui/": {
          target: uiTarget,
          secure: false,
          changeOrigin: true
        }
      }
    },
    build: {
      sourcemap: false,
      modulePreload: false
    }
  },
  devServer: {
    host: "localhost"
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
    enabled: true
  },
  experimental: {
    typedPages: true,
    defaults: {
      nuxtLink: {
        prefetch: false,
        prefetchOn: {
          visibility: false
        }
      }
    }
  },
  hooks: {
    "build:manifest": function (manifest) {
      for (const item of Object.values(manifest)) {
        if (!item || typeof item !== "object") continue;
        item.dynamicImports = [];
      }
    }
  },
  compatibilityDate: "2025-07-01"
});
