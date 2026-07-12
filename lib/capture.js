// crabcap: draggable screen-region GIF recorder.
// The capture window is a transparent frame — toolbar on top, dashed border
// around a click-through inner region. The inner region is what gets recorded.
const { BrowserWindow, screen, desktopCapturer, ipcMain, app, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const BORDER = 4; // dashed border thickness (left/right/bottom insets)
const TOP = 44; // toolbar (40) + top border (4)
const MIN_W = 240;
const MIN_H = 180;
const MAX_FRAMES = 450;

let win = null;
let recording = false;

function innerFromBounds(b) {
  return { x: b.x + BORDER, y: b.y + TOP, width: b.width - 2 * BORDER, height: b.height - TOP - BORDER };
}

function boundsFromInner(r) {
  return {
    x: Math.round(r.x - BORDER),
    y: Math.round(r.y - TOP),
    width: Math.round(r.width + 2 * BORDER),
    height: Math.round(r.height + TOP + BORDER)
  };
}

function clampBounds(b) {
  return { ...b, width: Math.max(MIN_W, b.width), height: Math.max(MIN_H, b.height) };
}

function getState() {
  const alive = win && !win.isDestroyed();
  return {
    visible: !!(alive && win.isVisible()),
    recording,
    frame: alive ? innerFromBounds(win.getBounds()) : null
  };
}

function sendState() {
  if (win && !win.isDestroyed()) win.webContents.send("cap-state", getState());
}

function ensureWindow() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    width: 800 + 2 * BORDER,
    height: 450 + TOP + BORDER,
    transparent: true,
    frame: false,
    resizable: false, // transparent windows can't edge-resize on Windows; we use a custom grip
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload-capture.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.loadFile(path.join(__dirname, "..", "renderer", "capture.html"));
  win.setIgnoreMouseEvents(true, { forward: true });
  win.on("moved", sendState);
  win.on("resized", sendState);
  win.on("closed", () => { win = null; });
  return win;
}

function whenLoaded(w) {
  if (!w.webContents.isLoading()) return Promise.resolve();
  return new Promise((r) => w.webContents.once("did-finish-load", r));
}

function showFrame(rect) {
  const w = ensureWindow();
  if (rect) w.setBounds(clampBounds(boundsFromInner(rect)));
  w.showInactive();
  sendState();
  return getState();
}

function hideFrame() {
  if (win && !win.isDestroyed()) win.hide();
  return getState();
}

function setFrame(partial) {
  const w = ensureWindow();
  const current = innerFromBounds(w.getBounds());
  w.setBounds(clampBounds(boundsFromInner({ ...current, ...partial })));
  sendState();
  return getState();
}

function defaultOutPath() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return path.join(app.getPath("videos"), "crabcap", `crabcap-${stamp}.gif`);
}

async function recordGif(opts = {}) {
  if (recording) throw new Error("already recording");
  const seconds = Math.min(30, Math.max(0.5, Number(opts.seconds) || 5));
  const fps = Math.min(30, Math.max(1, Number(opts.fps) || 15));
  const w = ensureWindow();
  await whenLoaded(w);

  const rect = opts.rect || getState().frame;
  if (!rect || rect.width < 16 || rect.height < 16) throw new Error("no capture rectangle");

  const display = screen.getDisplayMatching({
    x: Math.round(rect.x), y: Math.round(rect.y),
    width: Math.round(rect.width), height: Math.round(rect.height)
  });
  const sf = display.scaleFactor;
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!source) throw new Error("no screen source available");

  const crop = {
    x: Math.round((rect.x - display.bounds.x) * sf),
    y: Math.round((rect.y - display.bounds.y) * sf),
    width: Math.round(rect.width * sf),
    height: Math.round(rect.height * sf)
  };
  const frameCount = Math.min(MAX_FRAMES, Math.max(1, Math.round(seconds * fps)));

  recording = true;
  sendState();
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ipcMain.removeAllListeners("record-result");
        reject(new Error("recording timed out"));
      }, seconds * 1000 + 60000);
      ipcMain.once("record-result", (_e, res) => {
        clearTimeout(timeout);
        if (res.error) reject(new Error(res.error));
        else resolve(res);
      });
      w.webContents.send("do-record", {
        sourceId: source.id,
        crop,
        fps,
        frameCount,
        screenW: Math.round(display.bounds.width * sf),
        screenH: Math.round(display.bounds.height * sf)
      });
    });
    const outPath = path.resolve(opts.out || defaultOutPath());
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(result.data));
    return { path: outPath, frames: result.frames, width: crop.width, height: crop.height, bytes: result.data.byteLength };
  } finally {
    recording = false;
    sendState();
  }
}

function registerIpc() {
  ipcMain.handle("cap-record", async (_e, opts) => {
    const result = await recordGif(opts || {});
    return result;
  });
  ipcMain.on("cap-hide", () => hideFrame());
  ipcMain.on("cap-interactive", (_e, interactive) => {
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.on("cap-resize", (_e, { w: width, h: height }) => {
    if (!win || win.isDestroyed()) return;
    const b = win.getBounds();
    win.setBounds(clampBounds({ ...b, width: Math.round(width), height: Math.round(height) }));
  });
  ipcMain.on("cap-reveal", (_e, p) => {
    if (typeof p === "string" && fs.existsSync(p)) shell.showItemInFolder(p);
  });
  ipcMain.on("cap-request-state", sendState);
}
registerIpc();

module.exports = { showFrame, hideFrame, setFrame, getState, recordGif };
