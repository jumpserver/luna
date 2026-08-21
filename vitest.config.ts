import { fileURLToPath } from "node:url";

import { playwright } from "@vitest/browser-playwright";
import AutoImport from "unplugin-auto-import/vite";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [
    AutoImport({
      imports: ["vue"],
      dts: false
    })
  ],
  resolve: {
    alias: {
      "#koko": fileURLToPath(new URL("./packages/koko/app", import.meta.url)),
      "#online-player": fileURLToPath(new URL("./packages/online-player/app", import.meta.url)),
      "~": fileURLToPath(new URL("./ui", import.meta.url))
    }
  },
  test: {
    dir: rootDir,
    include: ["packages/koko/app/tests/**/*.test.ts", "packages/online-player/**/*.test.ts", "ui/**/*.test.ts"],
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
