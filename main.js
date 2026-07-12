const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require("electron");
const path = require("path");
const { getClaudeState } = require("./lib/claude-state");
const { getGitState } = require("./lib/git-state");
const capture = require("./lib/capture");
const { startControlServer } = require("./lib/control-server");

const WINDOW_HEIGHT = 340;

let win = null;
let tray = null;
let paused = false;
let sleeping = false;
let shellInTray = false;
let crabIcon = null;
let shellIcons = [];

function updateTrayIcon(frame = 0) {
  if (!tray) return;
  if (sleeping && shellInTray && shellIcons.length) {
    tray.setImage(shellIcons[Math.min(frame, shellIcons.length - 1)]);
  } else if (crabIcon) {
    tray.setImage(crabIcon);
  }
}

function positionWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({
    x: workArea.x,
    y: workArea.y + workArea.height - WINDOW_HEIGHT,
    width: workArea.width,
    height: WINDOW_HEIGHT
  });
}

function createWindow() {
  win = new BrowserWindow({
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, "screen-saver");
  positionWindow();
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Click-through by default; renderer asks for interactivity when the
  // cursor is over the crab or its speech bubble.
  win.setIgnoreMouseEvents(true, { forward: true });

  screen.on("display-metrics-changed", positionWindow);
  screen.on("display-added", positionWindow);
  screen.on("display-removed", positionWindow);
}

async function pollState() {
  if (!win || win.isDestroyed()) return;
  const [claude, git] = await Promise.all([
    getClaudeState().catch(() => ({ sessions: [] })),
    getGitState().catch(() => ({ repos: [] }))
  ]);
  win.webContents.send("state", { claude, git, paused });
}

const crabControl = {
  sleep: () => { if (win && !win.isDestroyed()) win.webContents.send("go-home"); },
  wake: () => { if (win && !win.isDestroyed()) win.webContents.send("wake-up"); },
  isAsleep: () => sleeping
};

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: sleeping ? "Wake him up 🐚" : "Send him home 🐚",
      click: () => (sleeping ? crabControl.wake() : crabControl.sleep())
    },
    {
      label: shellInTray ? "Show shell on screen" : "Hide shell in tray",
      type: "checkbox",
      checked: shellInTray,
      click: () => {
        shellInTray = !shellInTray;
        if (win && !win.isDestroyed()) win.webContents.send("shell-in-tray", shellInTray);
        updateTrayIcon();
        if (tray) tray.setContextMenu(buildMenu());
      }
    },
    {
      label: paused ? "Resume walking" : "Pause walking",
      click: () => {
        paused = !paused;
        if (win && !win.isDestroyed()) win.webContents.send("paused", paused);
        if (tray) tray.setContextMenu(buildMenu());
      }
    },
    {
      label: "GIF capture frame 🎥",
      click: () => {
        if (capture.getState().visible) capture.hideFrame();
        else capture.showFrame();
      }
    },
    { type: "separator" },
    { label: "Quit maximumcrab", click: () => app.quit() }
  ]);
}

ipcMain.on("sleep-state", (_e, isSleeping) => {
  sleeping = isSleeping;
  updateTrayIcon();
  if (tray) tray.setContextMenu(buildMenu());
});

ipcMain.on("shell-icons", (_e, urls) => {
  shellIcons = urls.map((u) => nativeImage.createFromDataURL(u).resize({ width: 16, height: 16 }));
});

ipcMain.on("tray-frame", (_e, frame) => {
  updateTrayIcon(frame);
});

ipcMain.on("set-interactive", (_e, interactive) => {
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(!interactive, { forward: true });
  }
});

ipcMain.on("show-menu", () => {
  buildMenu().popup({ window: win });
});

ipcMain.on("tray-icon", (_e, dataUrl) => {
  if (tray) return;
  crabIcon = nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
  tray = new Tray(crabIcon);
  tray.setToolTip("maximumcrab — your desk crab");
  tray.setContextMenu(buildMenu());
  // clicking the tray shell wakes him, same as clicking the on-screen shell
  tray.on("click", () => {
    if (sleeping) crabControl.wake();
  });
});

app.whenReady().then(() => {
  createWindow();
  win.webContents.on("did-finish-load", () => {
    pollState();
    setInterval(pollState, 3000);
  });
  startControlServer(capture, crabControl);
});

app.on("window-all-closed", () => app.quit());
