const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("crabAPI", {
  onState: (cb) => ipcRenderer.on("state", (_e, state) => cb(state)),
  onPaused: (cb) => ipcRenderer.on("paused", (_e, paused) => cb(paused)),
  onGoHome: (cb) => ipcRenderer.on("go-home", () => cb()),
  onWake: (cb) => ipcRenderer.on("wake-up", () => cb()),
  onShellInTray: (cb) => ipcRenderer.on("shell-in-tray", (_e, v) => cb(v)),
  sendSleepState: (sleeping) => ipcRenderer.send("sleep-state", sleeping),
  sendShellIcons: (urls) => ipcRenderer.send("shell-icons", urls),
  sendTrayFrame: (i) => ipcRenderer.send("tray-frame", i),
  setInteractive: (interactive) => ipcRenderer.send("set-interactive", interactive),
  showMenu: () => ipcRenderer.send("show-menu"),
  sendTrayIcon: (dataUrl) => ipcRenderer.send("tray-icon", dataUrl)
});
