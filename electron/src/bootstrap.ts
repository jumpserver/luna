import squirrelStartup from "electron-squirrel-startup";
import { run } from "./apps/ssh-helper";

const helperIndex = process.argv.indexOf("--ssh-helper");

async function start() {
  if (squirrelStartup) {
    process.exit(0);
    return;
  }
  if (helperIndex >= 0) {
    const status = await run(process.argv.slice(helperIndex + 1));
    process.exit(status);
    return;
  }
  await import("./desktop/main");
}

void start();
