import { resolve } from 'node:path';

import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import VueJSX from '@vitejs/plugin-vue-jsx';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [
      vue(),
      VueJSX(),
      tailwindcss(),
      AutoImport({
        imports: ['vue'],
      }),
      Components({
        resolvers: [NaiveUiResolver()],
      }),
      createSvgIconsPlugin({
        iconDirs: [resolve(process.cwd(), 'src/renderer/src/assets/icons')],
        symbolId: 'icon-[name]',
      }),
    ],
  },
});
