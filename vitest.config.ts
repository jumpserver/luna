import { fileURLToPath } from "node:url";

import { playwright } from "@vitest/browser-playwright";
import AutoImport from "unplugin-auto-import/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    AutoImport({
      imports: ["vue"],
      dts: false
    })
  ],
  resolve: {
    alias: {
      "#koko": fileURLToPath(new URL("./packages/koko/app", import.meta.url)),
      "~": fileURLToPath(new URL("./ui", import.meta.url))
    }
  },
  test: {
    include: ["packages/koko/app/tests/**/*.test.ts", "ui/**/*.test.ts"],
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
