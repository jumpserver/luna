import { contextBridge, ipcRenderer } from "electron";

const callbacks = new Map();
let nextCallbackId = 1;

function transformCallback(callback, once = false) {
  const id = nextCallbackId++;
  callbacks.set(id, (...args) => {
    if (once) callbacks.delete(id);
    callback(...args);
  });
  return id;
}

function unregisterCallback(id) {
  callbacks.delete(id);
}

ipcRenderer.on("jms:callback", (_event, id, payload) => {
  callbacks.get(id)?.(payload);
});

const labelArgument = process.argv.find((value) => value.startsWith("--jms-window-label="));
const currentLabel = labelArgument?.slice("--jms-window-label=".length) || "main";
const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : process.platform;

contextBridge.exposeInMainWorld(
  "__JMS_DESKTOP__",
  Object.freeze({
    runtime: "electron",
    windowLabel: currentLabel,
    platform,
    invoke(command, args = {}, options) {
      return ipcRenderer.invoke("jms:invoke", { command, args, options });
    },
    async listen(event, handler) {
      const callbackId = transformCallback(handler);
      try {
        const eventId = await ipcRenderer.invoke("jms:invoke", {
          command: "plugin:event|listen",
          args: { event, handler: callbackId }
        });
        return { eventId, callbackId };
      } catch (error) {
        unregisterCallback(callbackId);
        throw error;
      }
    },
    async unlisten(subscription) {
      unregisterCallback(subscription.callbackId);
      await ipcRenderer.invoke("jms:invoke", {
        command: "plugin:event|unlisten",
        args: { eventId: subscription.eventId }
      });
    },
    emit(event, payload) {
      return ipcRenderer.invoke("jms:invoke", {
        command: "plugin:event|emit",
        args: { event, payload }
      });
    },
    convertFileSrc(filePath, protocol = "asset") {
      return `jms-${protocol}://localhost/${encodeURIComponent(filePath)}`;
    }
  })
);
