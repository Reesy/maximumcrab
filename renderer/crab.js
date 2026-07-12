// Procedural pixel-art crab. Draws into a small (W x H) canvas context;
// the app scales it up with image smoothing off for a crisp pixel look.
(function () {
  const W = 36;
  const H = 28;
  const ERASE = "__erase__";

  const C = {
    body: "#ff6250",
    light: "#ff8d78",
    dark: "#e04a3c",
    outline: "#5f1d18",
    white: "#ffffff",
    pupil: "#2b2b33",
    blush: "#ffaab4"
  };

  function makeGrid(w, h) {
    return Array.from({ length: h }, () => new Array(w).fill(null));
  }

  function px(g, x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= g[0].length || y < 0 || y >= g.length) return;
    g[y][x] = c === ERASE ? null : c;
  }

  function disc(g, cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) px(g, x, y, c);
      }
    }
  }

  // Draw a disc only over pixels that already hold `onlyOn` (used for the
  // shell highlight so it never spills outside the body).
  function discClip(g, cx, cy, rx, ry, c, onlyOn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1 && g[y] && g[y][x] === onlyOn) g[y][x] = c;
      }
    }
  }

  function line(g, x0, y0, x1, y1, c, thick) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      px(g, x0, y0, c);
      if (thick > 1) px(g, x0 + 1, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  // 1px dark outline around every silhouette.
  function outlinePass(g, color) {
    const h = g.length;
    const w = g[0].length;
    const marks = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (g[y][x]) continue;
        const n =
          (y > 0 && g[y - 1][x]) ||
          (y < h - 1 && g[y + 1][x]) ||
          (x > 0 && g[y][x - 1]) ||
          (x < w - 1 && g[y][x + 1]);
        if (n && n !== color) marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) g[y][x] = color;
  }

  function paint(ctx, g) {
    ctx.clearRect(0, 0, g[0].length, g.length);
    for (let y = 0; y < g.length; y++) {
      for (let x = 0; x < g[0].length; x++) {
        if (!g[y][x]) continue;
        ctx.fillStyle = g[y][x];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function drawEye(g, cx, cy, look, blink) {
    if (blink) {
      // closed eye: keep the bulge silhouette, happy arc for the lid
      disc(g, cx, cy, 3.1, 3.0, C.outline);
      disc(g, cx, cy, 2.3, 2.2, C.body);
      px(g, cx - 1.5, cy + 0.5, C.outline);
      px(g, cx - 0.5, cy + 1, C.outline);
      px(g, cx + 0.5, cy + 1, C.outline);
      px(g, cx + 1.5, cy + 0.5, C.outline);
      return;
    }
    disc(g, cx, cy, 3.1, 3.0, C.outline);
    disc(g, cx, cy, 2.3, 2.2, C.white);
    const pxc = cx + look * 1.2;
    px(g, pxc - 0.5, cy, C.pupil);
    px(g, pxc + 0.5, cy, C.pupil);
    px(g, pxc - 0.5, cy + 1, C.pupil);
    px(g, pxc + 0.5, cy + 1, C.pupil);
    px(g, pxc - 0.5, cy, C.white); // sparkle
  }

  function drawClaw(g, cx, cy) {
    disc(g, cx, cy, 3.0, 2.7, C.body);
    // pincer notch
    const side = cx < W / 2 ? -1 : 1;
    disc(g, cx + side * 2.4, cy - 2.2, 1.5, 1.4, ERASE);
  }

  /**
   * opts: {
   *   t: seconds (animation clock)
   *   walking: bool
   *   blink: bool
   *   look: -1 | 0 | 1  (direction of travel; pupils follow)
   *   wave: bool  (idle claw wave)
   *   frenzy: bool  (post-nap zoomies: legs go wild)
   *   climb: bool  (on a wall or ceiling: hand-over-hand claw reach)
   * }
   */
  function draw(ctx, opts) {
    const { t = 0, walking = false, blink = false, look = 0, wave = false, frenzy = false, climb = false } = opts || {};
    const g = makeGrid(W, H);

    const phase = Math.sin(t * (frenzy ? 26 : 9));
    const bob = walking ? (phase > 0 ? -1 : 0) : 0;
    const groundY = 26;

    // --- legs (behind body) ---
    const anchors = [
      [10, 18, 4],
      [13, 19.5, 9],
      [16, 20.5, 14]
    ];
    anchors.forEach(([ax, ay, fx], i) => {
      const s = walking ? Math.round(phase * 1.5) * (i % 2 === 0 ? 1 : -1) : 0;
      // left leg
      line(g, ax, ay + bob, fx + s, groundY, C.dark, 1);
      // right leg (mirrored, opposite swing)
      line(g, W - 1 - ax, ay + bob, W - 1 - fx - s, groundY, C.dark, 1);
    });

    // --- arms + claws ---
    const clawBob = walking ? Math.round(Math.sin(t * 9 + Math.PI / 2)) : 0;
    const waveLift = wave ? -3 + Math.round(Math.sin(t * 12) * 1.5) : 0;
    let liftL = clawBob + waveLift;
    let liftR = clawBob;
    if (climb && walking) {
      // hand-over-hand: claws alternate reaching
      liftL = Math.round(Math.sin(t * 8) * 2) - 1;
      liftR = Math.round(Math.sin(t * 8 + Math.PI) * 2) - 1;
    }
    line(g, 8.5, 14 + bob, 6, 12 + bob + liftL, C.dark, 2);
    line(g, W - 1 - 8.5, 14 + bob, W - 1 - 6, 12 + bob + liftR, C.dark, 2);
    drawClaw(g, 4.5, 10.5 + bob + liftL);
    drawClaw(g, W - 1 - 4.5, 10.5 + bob + liftR);

    // --- shell ---
    disc(g, 17.5, 15.5 + bob, 9.5, 6.5, C.body);
    discClip(g, 14.5, 12.5 + bob, 5.5, 3.2, C.light, C.body);
    discClip(g, 17.5, 21 + bob, 8, 2.2, C.dark, C.body);

    // --- face ---
    px(g, 10, 13 + bob, C.blush);
    px(g, 11, 13 + bob, C.blush);
    px(g, 24, 13 + bob, C.blush);
    px(g, 25, 13 + bob, C.blush);
    // smile
    px(g, 16, 15 + bob, C.outline);
    px(g, 17, 16 + bob, C.outline);
    px(g, 18, 16 + bob, C.outline);
    px(g, 19, 15 + bob, C.outline);

    // --- eyes (bulging above the shell) ---
    drawEye(g, 13.5, 8 + bob, look, blink);
    drawEye(g, 21.5, 8 + bob, look, blink);

    outlinePass(g, C.outline);
    paint(ctx, g);
  }

  // --- the seashell the crab sleeps in ---
  const SHELL_W = 18;
  const SHELL_H = 13;
  const SC = {
    base: "#ffd9bd",
    ridge: "#f5a98f",
    deep: "#e08a70",
    outline: "#7a4636"
  };

  function drawShell(ctx) {
    const g = makeGrid(SHELL_W, SHELL_H);
    // fan body
    disc(g, 9, 7, 7, 5.5, SC.base);
    // ridges fanning out from the hinge
    line(g, 9, 11, 3.5, 3.5, SC.ridge, 1);
    line(g, 9, 11, 7, 2.5, SC.ridge, 1);
    line(g, 9, 11, 11, 2.5, SC.ridge, 1);
    line(g, 9, 11, 14.5, 3.5, SC.ridge, 1);
    // lower shading
    discClip(g, 9, 10.5, 6, 2, SC.deep, SC.base);
    // hinge tab
    px(g, 8, 12, SC.deep);
    px(g, 9, 12, SC.deep);
    px(g, 10, 12, SC.deep);
    outlinePass(g, SC.outline);
    paint(ctx, g);
  }

  const api = { W, H, draw, SHELL_W, SHELL_H, drawShell };
  if (typeof window !== "undefined") window.CRAB = api;
  if (typeof module !== "undefined") module.exports = api;
})();
