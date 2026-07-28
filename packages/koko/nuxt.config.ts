import { fileURLToPath } from "node:url";

const layerRoot = fileURLToPath(new URL(".", import.meta.url));
const appRoot = fileURLToPath(new URL("./app", import.meta.url));

export default defineNuxtConfig({
  $meta: { name: "jumpserver-koko" },
  alias: {
    "#koko": appRoot
  },
  imports: {
    dirs: [`${layerRoot}app/composables`, `${layerRoot}app/context`]
  }
});
