import { mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import runtimePackage from "../package.json";
import { isCertificateInspectionWorker, runCertificateInspectionWorker } from "./shared/certificate-inspection";
import { findClientProtocolUrl, registerClientProtocol } from "./shared/client-protocol";

async function start() {
  if (isCertificateInspectionWorker()) {
    await runCertificateInspectionWorker();
    return;
  }
  const productName = runtimePackage.productName || "JumpServer";
  const isDevelopment = process.env.JMS_ELECTRON_DEV === "1" || !app.isPackaged;
  app.setName(isDevelopment ? `${productName} Dev` : productName);
  // Isolate the single-instance lock and Chromium storage before either is initialized.
  if (isDevelopment) {
    const userData = path.join(app.getPath("appData"), app.getName());
    mkdirSync(userData, { recursive: true });
    app.setPath("userData", userData);
    app.setPath("sessionData", userData);
  }
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
