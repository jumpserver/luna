import { app } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import runtimePackage from "../package.json";
import { CLIENT_PROTOCOL, findClientProtocolUrl, registerClientProtocol } from "./shared/client-protocol";

async function start() {
  if (squirrelStartup) {
    if (["--squirrel-install", "--squirrel-updated"].includes(process.argv[1])) {
      registerClientProtocol(app);
    } else if (process.argv[1] === "--squirrel-uninstall") {
      app.removeAsDefaultProtocolClient(CLIENT_PROTOCOL);
    }
    // electron-squirrel-startup quits after Update.exe finishes its shortcut work.
    return;
  }
  app.setName(runtimePackage.productName || "JumpServer");
  const protocolUrl = findClientProtocolUrl(process.argv);
  if (!app.requestSingleInstanceLock({ protocolUrl: protocolUrl || "" })) {
    app.quit();
    return;
  }
  // Capture protocol events before loading the desktop and its native modules.
  const pending: { url: string | undefined; quitAfterLaunch?: boolean }[] = [];
  let handleProtocolUrl = (url: string | undefined, quitAfterLaunch?: boolean) => {
    pending.push({ url, quitAfterLaunch });
  };
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });
  app.on("second-instance", (_event, argv, _workingDirectory, additionalData) => {
    handleProtocolUrl(findClientProtocolUrl(argv, additionalData), false);
  });
  registerClientProtocol(app);
  const desktop = await import("./desktop/main");
  handleProtocolUrl = desktop.handleIncomingProtocolUrl;
  for (const { url, quitAfterLaunch } of pending.splice(0)) handleProtocolUrl(url, quitAfterLaunch);
}

void start();
