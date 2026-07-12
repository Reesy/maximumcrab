const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("crabAPI", {
  onState: (cb) => ipcRenderer.on("state", (_e, state) => cb(state)),
  onPaused: (cb) => ipcRenderer.on("paused", (_e, paused) => cb(paused)),
  setInteractive: (interactive) => ipcRenderer.send("set-interactive", interactive),
  showMenu: () => ipcRenderer.send("show-menu"),
  sendTrayIcon: (dataUrl) => ipcRenderer.send("tray-icon", dataUrl)
});
