import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';

import { resolve } from 'path';
import { defineConfig } from 'vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';

const pathResolve = (dir: string): string => {
  return resolve(__dirname, '.', dir);
};

export default defineConfig({
  plugins: [vue(), Components({ dts: true, resolvers: [NaiveUiResolver()] })],
  resolve: {
    extensions: ['.ts', '.tsx', '.vue', '.js', '.json'],
    alias: {
      '@': pathResolve('src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 4200,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://192.168.200.29:8080',
        changeOrigin: true
      }
    }
  }
});
