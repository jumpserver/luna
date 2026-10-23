import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { playwright } from "@vitest/browser-playwright";
import AutoImport from "unplugin-auto-import/vite";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

execFileSync(process.execPath, [fileURLToPath(new URL("./packages/guacamole/scripts/build.mjs", import.meta.url))], {
  stdio: "inherit"
});

export default defineConfig({
  root: rootDir,
  plugins: [
    AutoImport({
      imports: ["vue"],
      dts: false
    })
  ],
  resolve: {
    dedupe: ["vue"],
    alias: {
      "#koko": fileURLToPath(new URL("./ui/koko", import.meta.url)),
      "#online-player": fileURLToPath(new URL("./packages/online-player/app", import.meta.url)),
      "~": fileURLToPath(new URL("./ui", import.meta.url)),
      "@": fileURLToPath(new URL("./ui", import.meta.url))
    }
  },
  optimizeDeps: {
    include: ["vue", "vue/compiler-sfc"]
  },
  test: {
    dir: rootDir,
    include: ["packages/online-player/**/*.test.ts", "ui/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.nuxt/**"],
    css: {
      include: [/sftp-(?:transfer-center|file-management)\.scss/]
    },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }]
    }
  }
});
