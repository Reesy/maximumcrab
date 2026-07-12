const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require("electron");
const path = require("path");
const { getClaudeState } = require("./lib/claude-state");
const { getGitState } = require("./lib/git-state");

const WINDOW_HEIGHT = 340;

let win = null;
let tray = null;
let paused = false;

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

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: paused ? "Resume walking" : "Pause walking",
      click: () => {
        paused = !paused;
        if (win && !win.isDestroyed()) win.webContents.send("paused", paused);
        if (tray) tray.setContextMenu(buildMenu());
      }
    },
    { type: "separator" },
    { label: "Quit maximumcrab", click: () => app.quit() }
  ]);
}

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
  const icon = nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("maximumcrab — your desk crab");
  tray.setContextMenu(buildMenu());
});

app.whenReady().then(() => {
  createWindow();
  win.webContents.on("did-finish-load", () => {
    pollState();
    setInterval(pollState, 3000);
  });
});

app.on("window-all-closed", () => app.quit());
