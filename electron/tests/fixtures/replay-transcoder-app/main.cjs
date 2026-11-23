const { pathToFileURL } = require("node:url");
const { app } = require("electron");
app.on("window-all-closed", () => {});
process.on("unhandledRejection", (error) => {
  console.error(error);
  app.exit(1);
});

app.whenReady().then(async () => {
  try {
    const { tsImport } = await import("tsx/esm/api");
    const { runTranscodeChecks } = await tsImport("../../replay-transcoder.test.ts", pathToFileURL(__filename).href);
    await runTranscodeChecks();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
