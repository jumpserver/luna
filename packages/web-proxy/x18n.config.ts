import { defineConfig } from "@x18n/core";

export default defineConfig({
  resources: [
    {
      pattern: "src/locales/{locale}.json"
    }
  ]
});
