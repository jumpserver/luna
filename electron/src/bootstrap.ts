import squirrelStartup from "electron-squirrel-startup";

async function start() {
  if (squirrelStartup) {
    process.exit(0);
    return;
  }
  await import("./desktop/main");
}

void start();
