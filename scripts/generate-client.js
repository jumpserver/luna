import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const nuxtPackagePath = require.resolve("nuxt/package.json");
const nuxtPackage = require(nuxtPackagePath);
const nuxtCliPath = path.join(path.dirname(nuxtPackagePath), nuxtPackage.bin.nuxt);
const result = spawnSync(process.execPath, [nuxtCliPath, "generate"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NUXT_APP_BASE_URL: "/"
  }
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
