import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: true
  },
  plugins: [
    {
      name: "preload-code-splitting",
      config(config) {
        // ponytail: adapt Forge 7's preload defaults for Vite 8; remove when Forge emits codeSplitting.
        const output = config.build?.rolldownOptions?.output;
        if (output && !Array.isArray(output)) {
          delete output.inlineDynamicImports;
          output.codeSplitting = false;
        }
      }
    }
  ]
});
