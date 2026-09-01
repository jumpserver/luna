import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, ["web:generate"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NUXT_APP_BASE_URL: "/"
  }
});

process.exit(result.status ?? 1);
