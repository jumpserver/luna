import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("webApplet", {
  invoke: (command, args) => ipcRenderer.invoke("web-proxy:invoke", command, args),
  listen: (name, handler) => {
    const listener = (_event, event) => {
      if (event.name === name) handler({ payload: event.payload });
    };
    ipcRenderer.on("web-proxy:event", listener);
    return () => ipcRenderer.removeListener("web-proxy:event", listener);
  }
});
