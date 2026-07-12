const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("capAPI", {
  onRecord: (cb) => ipcRenderer.on("do-record", (_e, job) => cb(job)),
  onState: (cb) => ipcRenderer.on("cap-state", (_e, s) => cb(s)),
  requestState: () => ipcRenderer.send("cap-request-state"),
  recordResult: (res) => ipcRenderer.send("record-result", res),
  record: (opts) => ipcRenderer.invoke("cap-record", opts),
  hide: () => ipcRenderer.send("cap-hide"),
  setInteractive: (b) => ipcRenderer.send("cap-interactive", b),
  resizeTo: (w, h) => ipcRenderer.send("cap-resize", { w, h }),
  reveal: (p) => ipcRenderer.send("cap-reveal", p)
});
