const { pathToFileURL } = require("node:url");
const { app } = require("electron");

app.whenReady().then(async () => {
  const { tsImport } = await import("tsx/esm/api");
  await tsImport("../../replay-transcoder.test.ts", pathToFileURL(__filename).href);
});
