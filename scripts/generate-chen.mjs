import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The standalone Go server owns /luna/. Keep exported assets on that base even
// when the developer's general Luna environment sets another application base.
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/nuxt/bin/nuxt.mjs", import.meta.url));
const result = spawnSync(process.execPath, [cli, "generate", ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, NUXT_APP_BASE_URL: "/luna/" },
  stdio: "inherit"
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
