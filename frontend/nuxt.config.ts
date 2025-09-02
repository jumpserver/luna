import { includes } from 'zod';

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxt/icon',
    '@nuxt/fonts',
    '@nuxt/eslint',
    '@vueuse/nuxt',
    '@nuxtjs/i18n',
    'reka-ui/nuxt',
    'pinia-plugin-persistedstate/nuxt',
    './app/modules/tauri.ts',
  ],
  i18n: {
    locales: [
      { code: 'zh', name: '简体中文', file: 'zh.json' },
      { code: 'en', name: 'English', file: 'en.json' },
    ],
    defaultLocale: 'zh',
  },
  app: {
    head: {
      title: 'JumpServer Client',
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      meta: [{ name: 'format-detection', content: 'no' }],
    },
    pageTransition: {
      name: 'page',
      mode: 'out-in',
    },
    layoutTransition: {
      name: 'layout',
      mode: 'out-in',
    },
  },
  css: ['@/assets/css/main.css'],
  icon: {
    mode: 'css',
    cssLayer: 'base',
    serverBundle: {
      collections: ['mingcute'],
    },
  },
  ssr: false,
  dir: {
    modules: 'app/modules',
  },
  imports: {
    presets: [
      {
        from: 'zod',
        imports: [
          'z',
          {
            name: 'infer',
            as: 'zInfer',
            type: true,
          },
        ],
      },
    ],
  },
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      strictPort: true,
      hmr: {
        protocol: 'ws',
        host: '0.0.0.0',
        port: 3001,
      },
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  },
  devServer: {
    host: '0.0.0.0',
  },
  router: {
    options: {
      scrollBehaviorType: 'smooth',
    },
  },
  eslint: {
    config: {
      standalone: false,
    },
  },
  devtools: {
    enabled: true,
  },
  experimental: {
    typedPages: true,
  },
  compatibilityDate: '2025-07-01',
});
