import { GIFEncoder, quantize, applyPalette } from "../node_modules/gifenc/dist/gifenc.esm.js";

const recBtn = document.getElementById("rec");
const closeBtn = document.getElementById("close");
const statusEl = document.getElementById("status");
const sizeEl = document.getElementById("size");
const secsSel = document.getElementById("secs");
const fpsSel = document.getElementById("fps");
const grip = document.getElementById("grip");
const toolbar = document.getElementById("toolbar");

function setStatus(text) {
  statusEl.textContent = text;
}

function showSavedPath(p) {
  statusEl.textContent = "saved ";
  const link = document.createElement("span");
  link.className = "path";
  link.textContent = p.split(/[\\/]/).pop();
  link.title = `${p} — click to reveal`;
  link.addEventListener("click", () => window.capAPI.reveal(p));
  statusEl.appendChild(link);
}

// ---------- state from main ----------
window.capAPI.onState((s) => {
  if (s.frame) sizeEl.textContent = `${s.frame.width}×${s.frame.height}`;
  document.body.classList.toggle("recording", s.recording);
  recBtn.disabled = s.recording;
});
window.capAPI.requestState();

// ---------- toolbar actions ----------
recBtn.addEventListener("click", async () => {
  recBtn.disabled = true;
  try {
    const result = await window.capAPI.record({
      seconds: Number(secsSel.value),
      fps: Number(fpsSel.value)
    });
    showSavedPath(result.path);
  } catch (e) {
    setStatus(String(e.message || e).replace(/^.*Error(?: invoking remote method '.*?')?:\s*/, ""));
  } finally {
    recBtn.disabled = false;
  }
});

closeBtn.addEventListener("click", () => window.capAPI.hide());

// ---------- click-through management ----------
// The window ignores mouse events except when the cursor is over the
// toolbar or the resize grip, so the framed content stays interactive.
let interactive = false;
let resizing = false;

function pointOver(el, x, y) {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

document.addEventListener("mousemove", (e) => {
  if (resizing) return;
  const over = pointOver(toolbar, e.clientX, e.clientY) || pointOver(grip, e.clientX, e.clientY);
  if (over !== interactive) {
    interactive = over;
    window.capAPI.setInteractive(over);
  }
});

// ---------- custom resize grip ----------
grip.addEventListener("pointerdown", (e) => {
  resizing = true;
  grip.setPointerCapture(e.pointerId);
  e.preventDefault();
});
grip.addEventListener("pointermove", (e) => {
  if (!resizing) return;
  window.capAPI.resizeTo(e.screenX - window.screenX + 6, e.screenY - window.screenY + 6);
});
grip.addEventListener("pointerup", (e) => {
  resizing = false;
  grip.releasePointerCapture(e.pointerId);
});

// ---------- recording engine ----------
window.capAPI.onRecord(async (job) => {
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: job.sourceId,
          minWidth: job.screenW,
          maxWidth: job.screenW,
          minHeight: job.screenH,
          maxHeight: job.screenH,
          maxFrameRate: 30
        }
      }
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();

    const W = job.crop.width;
    const H = job.crop.height;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const frames = [];
    await new Promise((resolve, reject) => {
      const interval = 1000 / job.fps;
      let count = 0;
      const timer = setInterval(() => {
        try {
          ctx.drawImage(video, job.crop.x, job.crop.y, W, H, 0, 0, W, H);
          frames.push(ctx.getImageData(0, 0, W, H).data);
          const remaining = Math.ceil((job.frameCount - count) / job.fps);
          setStatus(`recording… ${remaining}s`);
          if (++count >= job.frameCount) {
            clearInterval(timer);
            resolve();
          }
        } catch (err) {
          clearInterval(timer);
          reject(err);
        }
      }, interval);
    });
    stream.getTracks().forEach((t) => t.stop());
    stream = null;

    setStatus("encoding…");
    // yield so the status paints before the encode blocks the thread
    await new Promise((r) => setTimeout(r, 30));

    const sampleCount = Math.min(5, frames.length);
    const sample = new Uint8Array(sampleCount * W * H * 4);
    for (let k = 0; k < sampleCount; k++) {
      const fi = Math.floor((k * (frames.length - 1)) / Math.max(1, sampleCount - 1));
      sample.set(frames[fi], k * W * H * 4);
    }
    const palette = quantize(sample, 256);

    const gif = GIFEncoder();
    const delay = Math.round(1000 / job.fps);
    frames.forEach((f, i) => {
      const index = applyPalette(new Uint8Array(f.buffer), palette);
      gif.writeFrame(index, W, H, { palette: i === 0 ? palette : undefined, delay, repeat: 0 });
    });
    gif.finish();

    setStatus("");
    window.capAPI.recordResult({ data: gif.bytes(), frames: frames.length });
  } catch (e) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setStatus("");
    window.capAPI.recordResult({ error: e.message || String(e) });
  }
});
