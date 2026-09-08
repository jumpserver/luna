import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
await build({
  configFile: false,
  root: path.join(root, "src/renderer"),
  base: "./",
  plugins: [
    vue(),
    ui({
      root,
      dts: false,
      router: false,
      colorMode: false,
      scanPackages: ["@jumpserver/web-proxy"],
      icon: {
        clientBundle: {
          icons: [
            "lucide:arrow-left",
            "lucide:arrow-right",
            "lucide:rotate-cw",
            "lucide:lock-keyhole",
            "lucide:info",
            "lucide:loader-circle",
            "lucide:circle-alert",
            "lucide:panels-top-left"
          ]
        }
      }
    })
  ],
  build: { outDir: path.join(root, "dist/renderer"), emptyOutDir: true }
});
for (const entry of ["main", "preload"]) {
  await build({
    configFile: false,
    root,
    build: {
      outDir: path.join(root, "dist"),
      emptyOutDir: false,
      minify: false,
      lib: { entry: path.join(root, `src/${entry}.ts`), formats: ["cjs"], fileName: () => `${entry}.cjs` },
      rollupOptions: { external: (id) => id === "electron" || id.startsWith("node:") }
    }
  });
}
