(function () {
  const SCALE = 5;
  const CRAB_W = CRAB.W * SCALE;
  const CRAB_H = CRAB.H * SCALE;
  const M = CRAB_W / 2; // crab-center margin along floor/ceiling
  const FOOT = 60; // distance from crab center to its feet plane
  const WALK_SPEED = 42; // px/s
  const ZOOM_SPEED = 340; // px/s, post-nap zoomies
  const IDLE_CHATTER_EVERY_MS = 22000;
  const IDLE_CHATTER_SHOW_MS = 8000;
  const SHELL_W = 72;
  const SHELL_RIGHT = 20;
  const SHELL_FADED_OPACITY = 0.2;

  const crabEl = document.getElementById("crab");
  const canvas = document.getElementById("crab-canvas");
  const shadowEl = document.getElementById("shadow");
  const shellEl = document.getElementById("shell");
  const shellCanvas = document.getElementById("shell-canvas");
  const bubbleEl = document.getElementById("bubble");
  const tailEl = bubbleEl.querySelector(".bubble-tail");
  const titleEl = document.getElementById("bubble-title");
  const bodyEl = document.getElementById("bubble-body");
  const footEl = document.getElementById("bubble-foot");
  const spinnerEl = document.getElementById("bubble-spinner");

  canvas.width = CRAB.W;
  canvas.height = CRAB.H;
  const ctx = canvas.getContext("2d");
  shellCanvas.width = CRAB.SHELL_W;
  shellCanvas.height = CRAB.SHELL_H;
  CRAB.drawShell(shellCanvas.getContext("2d"));

  // ---------- the perimeter ----------
  // The crab lives on a 1D loop around the screen edges, clockwise:
  // floor (left->right), right wall (up), ceiling (right->left), left wall (down).
  function geom() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const L1 = Math.max(1, W - 2 * M); // floor & ceiling length
    const L2 = Math.max(1, H - 2 * M); // wall length
    return { W, H, L1, L2, P: 2 * L1 + 2 * L2 };
  }

  function posFromS(sRaw) {
    const { W, H, L1, L2, P } = geom();
    const s = ((sRaw % P) + P) % P;
    if (s < L1) {
      return { cx: M + s, cy: H - CRAB_H / 2, angle: 0, surface: "floor", s };
    }
    if (s < L1 + L2) {
      return { cx: W - FOOT, cy: H - M - (s - L1), angle: -90, surface: "right", s };
    }
    if (s < 2 * L1 + L2) {
      return { cx: W - M - (s - L1 - L2), cy: FOOT, angle: 180, surface: "ceiling", s };
    }
    return { cx: FOOT, cy: M + (s - 2 * L1 - L2), angle: 90, surface: "left", s };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // nearest perimeter coordinate to a free point (drag release)
  function sFromPoint(x, y) {
    const { W, H, L1, L2 } = geom();
    const d = { floor: H - y, right: W - x, ceiling: y, left: x };
    const nearest = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
    if (nearest === "floor") return clamp(x - M, 0, L1);
    if (nearest === "right") return L1 + clamp(H - M - y, 0, L2);
    if (nearest === "ceiling") return L1 + L2 + clamp(W - M - x, 0, L1);
    return 2 * L1 + L2 + clamp(y - M, 0, L2);
  }

  function surfaceS(surface, frac) {
    const { L1, L2 } = geom();
    const f = clamp(Number(frac) || 0.5, 0, 1);
    if (surface === "right") return L1 + f * L2;
    if (surface === "ceiling") return L1 + L2 + f * L1;
    if (surface === "left") return 2 * L1 + L2 + f * L2;
    return f * L1;
  }

  // ---------- crab state ----------
  // modes: walk | pause  (free-roaming, full perimeter)
  //        going-home | asleep | zoomies | return-home  (shell transitions)
  //        home-stand | stroll-out | stroll-pause | stroll-back  (home-body)
  //        dragged  (in your hand)
  let sPos = 60;
  let dir = 1;
  let mode = "walk";
  let modeUntil = 0;
  let strollTarget = 0;
  let zoomiesUntil = 0;
  let nextZoomFlip = 0;
  let homebody = false;
  let paused = false;
  let waving = false;
  let blinkUntil = 0;
  let nextBlink = performance.now() + 2500;
  let hopVy = 0;
  let hopY = 0;
  let lastFrame = performance.now();

  // ---------- drag state ----------
  let pointerDownAt = null;
  let dragMoved = false;
  let dragPos = { x: 0, y: 0 };
  let dragAngle = 0;
  let lastDragX = 0;

  // ---------- shell / activity state ----------
  let busySinceSleep = 0;
  let eventTimes = [];
  let rattleEnergy = 0;
  let lastActivitySig = null;
  let shellShownAt = 0;
  let shellOpacity = 1;
  let hoverShell = false;
  let shellInTray = false;
  let lastTrayFrame = -1;

  // ---------- world state ----------
  let claudeSessions = [];
  let gitRepos = [];
  let bubbleMode = "auto";
  let idleLineUntil = 0;
  let nextIdleLine = performance.now() + 6000;
  let idleLineIndex = 0;

  function hideShellEl() {
    shellEl.classList.add("hidden");
    shellEl.style.opacity = "";
    shellEl.style.transform = "";
  }

  function showShellEl() {
    shellEl.classList.remove("hidden");
    shellShownAt = performance.now();
    shellOpacity = 1;
    shellEl.style.opacity = "1";
  }

  function shellX() {
    return window.innerWidth - SHELL_W - SHELL_RIGHT;
  }

  function homeS() {
    // standing spot on the floor just left of where the shell spawns
    return clamp(shellX() - CRAB_W + 24 + CRAB_W / 2 - M, 0, geom().L1);
  }

  function shellEntryS() {
    // crab centered over the shell
    return clamp(shellX() + SHELL_W / 2 - M, 0, geom().L1);
  }

  function asleep() {
    return mode === "asleep" || mode === "going-home";
  }

  function setMode(next, durMs) {
    mode = next;
    modeUntil = performance.now() + (durMs || 0);
    waving = next === "pause" || next === "home-stand" ? Math.random() < 0.35 : false;
  }

  // ---------- sleep / wake ----------
  function goHome() {
    if (asleep()) return;
    busySinceSleep = 0;
    eventTimes = [];
    bubbleEl.classList.add("hidden");
    setMode("going-home");
    window.crabAPI.sendSleepState(true);
  }

  function tuckIn() {
    crabEl.classList.add("hidden");
    if (shellInTray) hideShellEl();
    else showShellEl();
    setMode("asleep");
  }

  function wake() {
    if (mode !== "asleep") return;
    hideShellEl();
    crabEl.classList.remove("hidden");
    homebody = true;
    const seconds = Math.min(6, 1.2 + busySinceSleep * 0.35);
    zoomiesUntil = performance.now() + seconds * 1000;
    nextZoomFlip = performance.now() + 500;
    sPos = shellEntryS();
    dir = -1;
    setMode("zoomies");
    busySinceSleep = 0;
    rattleEnergy = 0;
    window.crabAPI.sendSleepState(false);
  }

  // ---------- activity events (rattle fuel) ----------
  function activitySignature(state) {
    const s = (state.claude.sessions || []).map((v) => `${v.project}|${v.text}|${v.tool}|${v.working}`);
    const g = (state.git.repos || []).map((r) => `${r.name}|${r.dirty}|${r.ahead}|${r.behind}`);
    return s.join(";") + "#" + g.join(";");
  }

  function registerActivity() {
    const now = performance.now();
    eventTimes.push(now);
    eventTimes = eventTimes.filter((t) => now - t < 30000);
    if (mode === "asleep") {
      busySinceSleep++;
      rattleEnergy = Math.min(1, 0.35 + eventTimes.length * 0.09);
    }
  }

  function idleLines(surface) {
    const lines = [];
    if (surface === "ceiling") {
      lines.push(
        "\u{1F643} the view from up here!",
        "don't worry, crabs can't fall",
        "\u{1F643} everything's a taskbar if you're upside down"
      );
    }
    for (const r of gitRepos) {
      if (r.dirty > 0) {
        lines.push(`\u{1F342} ${r.name}: ${r.dirty} uncommitted file${r.dirty === 1 ? "" : "s"} on ${r.branch}`);
      }
      if (r.ahead > 0) {
        lines.push(`\u{2B06}\u{FE0F} ${r.name} is ${r.ahead} commit${r.ahead === 1 ? "" : "s"} ahead \u{2014} push it!`);
      }
      if (r.behind > 0) {
        lines.push(`\u{2B07}\u{FE0F} ${r.name} is ${r.behind} behind \u{2014} time to pull`);
      }
    }
    if (lines.length === 0) {
      lines.push(
        "just crabbin' along \u{1F980}",
        "all repos clean! *clacks approvingly*",
        "it's quiet\u{2026} suspiciously quiet",
        "have you committed today?",
        "\u{1F9BE} scuttle scuttle"
      );
    }
    return lines;
  }

  function updateBubble(now, surface) {
    if (asleep() || mode === "zoomies" || mode === "dragged" || bubbleMode === "muted") {
      bubbleEl.classList.add("hidden");
      return;
    }
    const session = claudeSessions[0];
    if (session) {
      titleEl.textContent = session.title || session.project;
      bodyEl.textContent = session.text || (session.working ? "thinking\u{2026}" : "");
      if (session.tool || session.project) {
        footEl.textContent = [session.working ? session.tool : null, session.project]
          .filter(Boolean)
          .join(" \u{00B7} ");
        footEl.classList.remove("hidden");
      } else {
        footEl.classList.add("hidden");
      }
      spinnerEl.classList.toggle("hidden", !session.working);
      bubbleEl.classList.remove("hidden");
      return;
    }
    spinnerEl.classList.add("hidden");
    footEl.classList.add("hidden");
    if (now < idleLineUntil) {
      bubbleEl.classList.remove("hidden");
      return;
    }
    bubbleEl.classList.add("hidden");
    if (now >= nextIdleLine) {
      const lines = idleLines(surface);
      titleEl.textContent = "maximumcrab";
      bodyEl.textContent = lines[idleLineIndex % lines.length];
      idleLineIndex++;
      idleLineUntil = now + IDLE_CHATTER_SHOW_MS;
      nextIdleLine = now + IDLE_CHATTER_EVERY_MS + Math.random() * 8000;
      bubbleEl.classList.remove("hidden");
    }
  }

  function positionBubble(pos) {
    const { W, H } = geom();
    const bw = bubbleEl.offsetWidth || 220;
    const bh = bubbleEl.offsetHeight || 90;
    bubbleEl.classList.remove("tail-top", "tail-none");
    let left;
    let top;
    if (pos.surface === "ceiling") {
      left = clamp(pos.cx - 54, 8, W - bw - 8);
      top = pos.cy + CRAB_H / 2 + 10;
      bubbleEl.classList.add("tail-top");
      tailEl.style.left = `${clamp(pos.cx - left - 7, 16, bw - 30)}px`;
    } else if (pos.surface === "right") {
      left = pos.cx - CRAB_H / 2 - bw - 12;
      top = clamp(pos.cy - bh / 2, 8, H - bh - 8);
      bubbleEl.classList.add("tail-none");
    } else if (pos.surface === "left") {
      left = pos.cx + CRAB_H / 2 + 12;
      top = clamp(pos.cy - bh / 2, 8, H - bh - 8);
      bubbleEl.classList.add("tail-none");
    } else {
      left = clamp(pos.cx - 54, 8, W - bw - 8);
      top = pos.cy - CRAB_H / 2 - bh - 10;
      tailEl.style.left = `${clamp(pos.cx - left - 7, 16, bw - 30)}px`;
    }
    bubbleEl.style.left = `${left}px`;
    bubbleEl.style.top = `${top}px`;
  }

  // move along the perimeter toward a target s (shortest way); true when there
  function moveTowardS(target, dt, speed) {
    const { P } = geom();
    const delta = ((((target - sPos) % P) + P + P / 2) % P) - P / 2;
    const step = speed * dt;
    if (Math.abs(delta) <= step) {
      sPos = target;
      return true;
    }
    dir = delta > 0 ? 1 : -1;
    sPos += dir * step;
    return false;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (now >= nextBlink) {
      blinkUntil = now + 140;
      nextBlink = now + 2200 + Math.random() * 3500;
    }

    let walking = false;

    if (!paused) {
      switch (mode) {
        case "walk":
          walking = hopY === 0;
          if (walking) sPos += dir * WALK_SPEED * dt;
          if (now >= modeUntil) setMode("pause", 2000 + Math.random() * 3500);
          break;
        case "pause":
          if (now >= modeUntil) {
            if (homebody) setMode("stroll-back");
            else {
              if (Math.random() < 0.3) dir = -dir;
              setMode("walk", 3500 + Math.random() * 5000);
            }
          }
          break;
        case "going-home":
          walking = true;
          if (moveTowardS(shellEntryS(), dt, ZOOM_SPEED)) tuckIn();
          break;
        case "asleep":
          break;
        case "zoomies":
          walking = true;
          sPos += dir * ZOOM_SPEED * dt;
          if (now >= nextZoomFlip) {
            dir = -dir;
            nextZoomFlip = now + 400 + Math.random() * 900;
          }
          if (now >= zoomiesUntil) setMode("return-home");
          break;
        case "return-home":
        case "stroll-back":
          walking = true;
          if (moveTowardS(homeS(), dt, WALK_SPEED * 1.5)) {
            setMode("home-stand", 20000 + Math.random() * 35000);
          }
          break;
        case "home-stand":
          if (now >= modeUntil) {
            if (Math.random() < 0.45) {
              strollTarget = Math.max(0, homeS() - (200 + Math.random() * 600));
              setMode("stroll-out");
            } else {
              setMode("home-stand", 20000 + Math.random() * 35000);
            }
          }
          break;
        case "stroll-out":
          walking = true;
          if (moveTowardS(strollTarget, dt, WALK_SPEED)) {
            setMode("stroll-pause", 2000 + Math.random() * 4000);
          }
          break;
        case "stroll-pause":
          if (now >= modeUntil) setMode("stroll-back");
          break;
        case "dragged":
          break;
      }
    }

    // hop physics (along the surface normal)
    if (hopVy !== 0 || hopY > 0) {
      hopVy -= 900 * dt;
      hopY = Math.max(0, hopY + hopVy * dt);
      if (hopY === 0) hopVy = 0;
    }

    const pos =
      mode === "dragged"
        ? { cx: dragPos.x, cy: dragPos.y, angle: dragAngle, surface: "air" }
        : posFromS(sPos);

    const normal = { floor: [0, -1], right: [-1, 0], ceiling: [0, 1], left: [1, 0], air: [0, -1] }[pos.surface];
    const px = pos.cx - CRAB_W / 2 + normal[0] * hopY;
    const py = pos.cy - CRAB_H / 2 + normal[1] * hopY;
    crabEl.style.transform = `translate(${px}px, ${py}px) rotate(${pos.angle}deg)`;
    shadowEl.style.display = pos.surface === "floor" ? "" : "none";

    // shell rattle + fade
    if (mode === "asleep") {
      const rate = eventTimes.length;
      if (rattleEnergy > 0.01) rattleEnergy *= Math.exp(-dt * 1.4);
      if (!shellEl.classList.contains("hidden")) {
        if (rattleEnergy > 0.05) {
          const wobble = Math.sin((now / 1000) * (16 + rate * 3)) * 9 * rattleEnergy;
          const jitter = Math.sin((now / 1000) * (23 + rate * 4)) * 1.5 * rattleEnergy;
          shellEl.style.transform = `rotate(${wobble}deg) translateX(${jitter}px)`;
        } else {
          shellEl.style.transform = "";
        }
        const wantVisible = hoverShell || now - shellShownAt < 4000;
        const target = wantVisible ? 1 : SHELL_FADED_OPACITY;
        const ease = target > shellOpacity ? 5 : 0.3;
        shellOpacity += Math.max(-ease * dt, Math.min(ease * dt, target - shellOpacity));
        shellEl.style.opacity = shellOpacity.toFixed(3);
      } else if (shellInTray) {
        let trayFrame = 0;
        if (rattleEnergy > 0.05) {
          const sWave = Math.sin((now / 1000) * (16 + rate * 3));
          trayFrame = sWave > 0.3 ? 1 : sWave < -0.3 ? 2 : 0;
        }
        if (trayFrame !== lastTrayFrame) {
          lastTrayFrame = trayFrame;
          window.crabAPI.sendTrayFrame(trayFrame);
        }
      }
    }

    if (mode !== "asleep") {
      CRAB.draw(ctx, {
        t: now / 1000,
        walking: walking || mode === "dragged",
        blink: now < blinkUntil,
        look: walking ? dir : 0,
        wave: waving && (mode === "pause" || mode === "home-stand"),
        frenzy: mode === "zoomies" || mode === "going-home" || mode === "dragged",
        climb: walking && pos.surface !== "floor" && pos.surface !== "air"
      });
    }

    updateBubble(now, pos.surface);
    positionBubble(pos);
    requestAnimationFrame(frame);
  }

  // ---------- interactivity ----------
  function pointOver(el, cx, cy) {
    const r = el.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }

  let interactive = false;
  document.addEventListener("mousemove", (e) => {
    hoverShell = !shellEl.classList.contains("hidden") && pointOver(shellEl, e.clientX, e.clientY);
    const over =
      mode === "dragged" ||
      (!crabEl.classList.contains("hidden") && pointOver(crabEl, e.clientX, e.clientY)) ||
      hoverShell ||
      (!bubbleEl.classList.contains("hidden") && pointOver(bubbleEl, e.clientX, e.clientY));
    if (over !== interactive) {
      interactive = over;
      window.crabAPI.setInteractive(over);
    }
  });

  // ---------- drag the crab anywhere ----------
  crabEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || asleep()) return;
    pointerDownAt = { x: e.clientX, y: e.clientY };
    dragMoved = false;
    lastDragX = e.clientX;
    crabEl.setPointerCapture(e.pointerId);
  });

  crabEl.addEventListener("pointermove", (e) => {
    if (!pointerDownAt) return;
    const dx = e.clientX - pointerDownAt.x;
    const dy = e.clientY - pointerDownAt.y;
    if (!dragMoved && dx * dx + dy * dy > 64) {
      dragMoved = true;
      setMode("dragged");
      bubbleEl.classList.add("hidden");
    }
    if (dragMoved) {
      const { W, H } = geom();
      dragPos = { x: clamp(e.clientX, 20, W - 20), y: clamp(e.clientY, 20, H - 20) };
      // dangle with drag velocity
      const vx = e.clientX - lastDragX;
      dragAngle = clamp(dragAngle * 0.85 + vx * 1.6, -30, 30);
      lastDragX = e.clientX;
    }
  });

  crabEl.addEventListener("pointerup", (e) => {
    if (!pointerDownAt) return;
    crabEl.releasePointerCapture(e.pointerId);
    pointerDownAt = null;
    if (dragMoved) {
      // set him down on the nearest edge
      sPos = sFromPoint(dragPos.x, dragPos.y);
      dragAngle = 0;
      homebody = false; // dragging somewhere new means "explore here"
      setMode("pause", 1200 + Math.random() * 1500);
    } else {
      if (hopY === 0) { hopVy = 260; hopY = 0.01; }
      bubbleMode = bubbleMode === "muted" ? "auto" : "muted";
      if (bubbleMode === "auto") nextIdleLine = performance.now();
    }
  });

  crabEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    window.crabAPI.showMenu();
  });

  shellEl.addEventListener("click", wake);
  shellEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    window.crabAPI.showMenu();
  });

  // ---------- state from main ----------
  window.crabAPI.onState((state) => {
    claudeSessions = (state.claude && state.claude.sessions) || [];
    gitRepos = (state.git && state.git.repos) || [];
    paused = state.paused;
    const sig = activitySignature(state);
    if (lastActivitySig !== null && sig !== lastActivitySig) registerActivity();
    lastActivitySig = sig;
  });
  window.crabAPI.onPaused((p) => { paused = p; });
  window.crabAPI.onGoHome(goHome);
  window.crabAPI.onWake(wake);
  window.crabAPI.onWarp((params) => {
    if (asleep() || mode === "dragged") return;
    sPos = surfaceS(params.surface || "floor", params.frac);
    setMode("pause", 1500);
  });
  window.crabAPI.onShellInTray((inTray) => {
    shellInTray = inTray;
    lastTrayFrame = -1;
    if (inTray) {
      if (!asleep()) {
        busySinceSleep = 0;
        eventTimes = [];
        window.crabAPI.sendSleepState(true);
      }
      crabEl.classList.add("hidden");
      bubbleEl.classList.add("hidden");
      hideShellEl();
      setMode("asleep");
    } else if (mode === "asleep") {
      // unchecking "hide in tray" means "bring him back"
      wake();
    }
  });

  // ---------- tray icons ----------
  function sendTrayIcon() {
    const c = document.createElement("canvas");
    c.width = 36;
    c.height = 36;
    const tctx = c.getContext("2d");
    tctx.translate(0, 4);
    CRAB.draw(tctx, { t: 0, walking: false, blink: false, look: 0, wave: false });
    window.crabAPI.sendTrayIcon(c.toDataURL("image/png"));
  }

  function sendShellIcons() {
    const off = document.createElement("canvas");
    off.width = CRAB.SHELL_W;
    off.height = CRAB.SHELL_H;
    CRAB.drawShell(off.getContext("2d"));
    const urls = [0, -0.28, 0.28].map((angle) => {
      const c = document.createElement("canvas");
      c.width = 24;
      c.height = 20;
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.translate(12, 10);
      g.rotate(angle);
      g.drawImage(off, -CRAB.SHELL_W / 2, -CRAB.SHELL_H / 2);
      return c.toDataURL("image/png");
    });
    window.crabAPI.sendShellIcons(urls);
  }

  setMode("walk", 4000);
  sendTrayIcon();
  sendShellIcons();
  requestAnimationFrame(frame);
})();
