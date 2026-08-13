import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";

const layerRoot = fileURLToPath(new URL(".", import.meta.url));
const appRoot = fileURLToPath(new URL("./app", import.meta.url));

export default defineNuxtConfig({
  $meta: { name: "jumpserver-koko" },
  css: [
    "driver.js/dist/driver.css",
    `${appRoot}/assets/css/sftp-file-management.scss`,
    `${appRoot}/assets/css/sftp-transfer-center.scss`
  ],
  alias: {
    "#koko": appRoot
  },
  imports: {
    dirs: [`${layerRoot}app/composables`, `${layerRoot}app/context`]
  }
});
