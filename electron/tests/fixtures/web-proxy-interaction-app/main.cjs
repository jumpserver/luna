const { pathToFileURL } = require("node:url");
const { app } = require("electron");
// Keep the test app alive between the automatic and manual verification cases.
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  try {
    const { tsImport } = await import("tsx/esm/api");
    const { runProxyAuthChecks } = await tsImport("../../web-proxy-auth-check.ts", pathToFileURL(__filename).href);
    await runProxyAuthChecks();
    if (process.argv.includes("auth")) return app.exit(0);
    const { runThemeChecks } = await tsImport("../../web-proxy-theme-check.ts", pathToFileURL(__filename).href);
    await runThemeChecks();
    if (process.argv.includes("theme")) return app.exit(0);
    const { run } = await tsImport("../../web-proxy-interaction-check.ts", pathToFileURL(__filename).href);
    await run();
    const { runScriptChecks } = await tsImport("../../web-proxy-script-check.ts", pathToFileURL(__filename).href);
    await runScriptChecks();
    console.log("Web Proxy interactive verification: passed");
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
