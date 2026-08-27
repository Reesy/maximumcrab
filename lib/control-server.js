// Loopback HTTP API so agents (or anything with curl) can drive crabcap.
const http = require("http");

const PORT = 43117;

const HELP = `crabcap control API (loopback only)

GET  /state                     -> { visible, recording, frame: {x,y,width,height} }
POST /show                      -> show the capture frame (optional body: {x,y,width,height})
POST /hide                      -> hide the capture frame
POST /frame  {x,y,width,height} -> move/resize the frame (any subset of keys; DIP screen coords)
POST /record {seconds?,fps?,out?,x?,y?,width?,height?}
     -> record a GIF and block until done. Uses the frame's rectangle unless
        x/y/width/height are given. Returns { path, frames, width, height, bytes }.
     defaults: seconds=5 (max 30), fps=15 (max 30), out=<Videos>/crabcap/crabcap-<ts>.gif
POST /crab/sleep                -> send the crab home to its seashell
POST /crab/wake                 -> wake the crab (zoomies proportional to missed activity)

All bodies are JSON. Coordinates are in device-independent pixels, origin at the
primary display's top-left (same as the OS reports them).
`;

function hasRect(p) {
  return ["x", "y", "width", "height"].every((k) => typeof p[k] === "number");
}

function pickRect(p) {
  const rect = {};
  for (const k of ["x", "y", "width", "height"]) {
    if (typeof p[k] === "number") rect[k] = p[k];
  }
  return rect;
}

function startControlServer(capture, crab) {
  const server = http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end(HELP);
      }
      if (req.method === "GET" && url.pathname === "/state") return send(200, capture.getState());

      let body = "";
      for await (const chunk of req) body += chunk;
      let params = {};
      if (body) {
        try {
          params = JSON.parse(body);
        } catch {
          return send(400, { error: "body must be JSON" });
        }
      }

      if (req.method === "POST" && url.pathname === "/show") {
        return send(200, capture.showFrame(hasRect(params) ? pickRect(params) : undefined));
      }
      if (req.method === "POST" && url.pathname === "/hide") return send(200, capture.hideFrame());
      if (req.method === "POST" && url.pathname === "/frame") {
        const rect = pickRect(params);
        if (Object.keys(rect).length === 0) return send(400, { error: "provide x, y, width and/or height" });
        return send(200, capture.setFrame(rect));
      }
      if (crab && req.method === "POST" && url.pathname === "/crab/sleep") {
        crab.sleep();
        return send(200, { ok: true, asleep: true });
      }
      if (crab && req.method === "POST" && url.pathname === "/crab/wake") {
        crab.wake();
        return send(200, { ok: true, asleep: false });
      }
      if (crab && req.method === "POST" && url.pathname === "/crab/tray") {
        crab.setTray(!!params.inTray);
        return send(200, { ok: true, inTray: crab.isInTray() });
      }
      if (crab && req.method === "GET" && url.pathname === "/crab/state") {
        return send(200, { asleep: crab.isAsleep(), inTray: crab.isInTray() });
      }
      if (req.method === "POST" && url.pathname === "/record") {
        const result = await capture.recordGif({
          seconds: params.seconds,
          fps: params.fps,
          out: params.out,
          rect: hasRect(params) ? pickRect(params) : undefined
        });
        return send(200, result);
      }
      send(404, { error: "unknown endpoint; GET / for help" });
    } catch (e) {
      send(500, { error: e.message });
    }
  });
  server.listen(PORT, "127.0.0.1");
  server.on("error", (e) => console.error("crabcap control server:", e.message));
  return server;
}

module.exports = { startControlServer, PORT };
