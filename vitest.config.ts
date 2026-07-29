import { fileURLToPath } from "node:url";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#koko": fileURLToPath(new URL("./packages/koko/app", import.meta.url))
    }
  },
  test: {
    include: ["packages/koko/app/composables/{sftp,terminal,kubernetes}/**/*.browser.spec.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }]
    }
  }
});
