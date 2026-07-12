const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("crabAPI", {
  onState: (cb) => ipcRenderer.on("state", (_e, state) => cb(state)),
  onPaused: (cb) => ipcRenderer.on("paused", (_e, paused) => cb(paused)),
  onGoHome: (cb) => ipcRenderer.on("go-home", () => cb()),
  onWake: (cb) => ipcRenderer.on("wake-up", () => cb()),
  sendSleepState: (sleeping) => ipcRenderer.send("sleep-state", sleeping),
  setInteractive: (interactive) => ipcRenderer.send("set-interactive", interactive),
  showMenu: () => ipcRenderer.send("show-menu"),
  sendTrayIcon: (dataUrl) => ipcRenderer.send("tray-icon", dataUrl)
});
