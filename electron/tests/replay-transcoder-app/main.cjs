const { app } = require("electron");

app.whenReady().then(() => import("../../replay-transcoder.test.mjs"));
