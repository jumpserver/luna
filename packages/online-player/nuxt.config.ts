import { fileURLToPath } from "node:url";

const layerRoot = fileURLToPath(new URL(".", import.meta.url));
const appRoot = fileURLToPath(new URL("./app", import.meta.url));

export default defineNuxtConfig({
  $meta: { name: "jumpserver-online-player" },
  alias: {
    "#online-player": appRoot
  },
  css: [`${layerRoot}app/assets/replay.css`],
  imports: {
    dirs: [`${layerRoot}app/composables`]
  }
});
