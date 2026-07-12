(function () {
  const SCALE = 5;
  const CRAB_W = CRAB.W * SCALE;
  const WALK_SPEED = 42; // px/s
  const ZOOM_SPEED = 340; // px/s, post-nap zoomies
  const IDLE_CHATTER_EVERY_MS = 22000;
  const IDLE_CHATTER_SHOW_MS = 8000;
  const SHELL_W = 72;
  const SHELL_RIGHT = 20;
  const SHELL_FADED_OPACITY = 0.2;

  const crabEl = document.getElementById("crab");
  const canvas = document.getElementById("crab-canvas");
  const shellEl = document.getElementById("shell");
  const shellCanvas = document.getElementById("shell-canvas");
  const bubbleEl = document.getElementById("bubble");
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

  // ---------- crab state ----------
  // modes: walk | pause  (free-roaming)
  //        going-home | asleep | zoomies | return-home  (shell transitions)
  //        home-stand | stroll-out | stroll-pause | stroll-back  (home-body)
  let x = 60;
  let dir = 1;
  let mode = "walk";
  let modeUntil = 0;
  let strollTarget = 0;
  let zoomiesUntil = 0;
  let nextZoomFlip = 0;
  let homebody = false; // once woken from the shell, the crab stays near home
  let paused = false;
  let waving = false;
  let blinkUntil = 0;
  let nextBlink = performance.now() + 2500;
  let hopVy = 0;
  let hopY = 0;
  let lastFrame = performance.now();

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
  let bubbleMode = "auto"; // auto | muted
  let idleLineUntil = 0;
  let nextIdleLine = performance.now() + 6000;
  let idleLineIndex = 0;

  // The fade loop drives #shell's opacity inline, and inline styles override
  // the .hidden class — always clear them together or the shell stays visible.
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

  function homeX() {
    // standing spot just left of where the shell spawns
    return Math.max(12, shellX() - CRAB_W + 24);
  }

  function shellEntryX() {
    // crab centered over the shell
    return shellX() + SHELL_W / 2 - CRAB_W / 2;
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
    if (shellInTray) hideShellEl(); // tray mode renders nothing on screen
    else showShellEl();
    setMode("asleep");
  }

  function wake() {
    if (mode !== "asleep") return;
    hideShellEl();
    crabEl.classList.remove("hidden");
    homebody = true;
    // zoomies duration scales with how much it missed while sleeping
    const seconds = Math.min(6, 1.2 + busySinceSleep * 0.35);
    zoomiesUntil = performance.now() + seconds * 1000;
    nextZoomFlip = performance.now() + 500;
    x = shellEntryX();
    dir = -1;
    setMode("zoomies");
    busySinceSleep = 0;
    rattleEnergy = 0;
    shellEl.style.transform = "";
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
      // more updates per half-minute -> harder rattle
      rattleEnergy = Math.min(1, 0.35 + eventTimes.length * 0.09);
    }
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function idleLines() {
    const lines = [];
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

  function updateBubble(now) {
    if (asleep() || mode === "zoomies" || bubbleMode === "muted") {
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
      const lines = idleLines();
      titleEl.textContent = "maximumcrab";
      bodyEl.textContent = lines[idleLineIndex % lines.length];
      idleLineIndex++;
      idleLineUntil = now + IDLE_CHATTER_SHOW_MS;
      nextIdleLine = now + IDLE_CHATTER_EVERY_MS + Math.random() * 8000;
      bubbleEl.classList.remove("hidden");
    }
  }

  function positionBubble() {
    const bw = bubbleEl.offsetWidth || 220;
    const cx = x + CRAB_W / 2;
    const left = Math.max(8, Math.min(cx - 54, window.innerWidth - bw - 8));
    bubbleEl.style.left = `${left}px`;
    const tail = bubbleEl.querySelector(".bubble-tail");
    tail.style.marginLeft = `${Math.max(16, Math.min(cx - left - 7, bw - 30))}px`;
  }

  // walk toward a target x; returns true when arrived
  function walkToward(target, dt, speed) {
    const step = speed * dt;
    if (Math.abs(target - x) <= step) {
      x = target;
      return true;
    }
    dir = target > x ? 1 : -1;
    x += dir * step;
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
    const maxX = window.innerWidth - CRAB_W - 12;

    if (!paused) {
      switch (mode) {
        case "walk":
          walking = hopY === 0;
          if (walking) {
            x += dir * WALK_SPEED * dt;
            if (x <= 12) { x = 12; dir = 1; }
            if (x >= maxX) { x = maxX; dir = -1; }
          }
          if (now >= modeUntil) setMode("pause", 2000 + Math.random() * 3500);
          break;
        case "pause":
          if (now >= modeUntil) {
            if (homebody) setMode("stroll-back");
            else setMode("walk", 3500 + Math.random() * 5000);
          }
          break;
        case "going-home":
          walking = true;
          if (walkToward(shellEntryX(), dt, ZOOM_SPEED)) tuckIn();
          break;
        case "asleep":
          break;
        case "zoomies":
          walking = true;
          x += dir * ZOOM_SPEED * dt;
          if (x <= 12) { x = 12; dir = 1; }
          if (x >= maxX) { x = maxX; dir = -1; }
          if (now >= nextZoomFlip) {
            dir = -dir;
            nextZoomFlip = now + 400 + Math.random() * 900;
          }
          if (now >= zoomiesUntil) setMode("return-home");
          break;
        case "return-home":
        case "stroll-back":
          walking = true;
          if (walkToward(homeX(), dt, WALK_SPEED * 1.5)) {
            setMode("home-stand", 20000 + Math.random() * 35000);
          }
          break;
        case "home-stand":
          if (now >= modeUntil) {
            if (Math.random() < 0.45) {
              strollTarget = Math.max(12, homeX() - (200 + Math.random() * 600));
              setMode("stroll-out");
            } else {
              setMode("home-stand", 20000 + Math.random() * 35000);
            }
          }
          break;
        case "stroll-out":
          walking = true;
          if (walkToward(strollTarget, dt, WALK_SPEED)) {
            setMode("stroll-pause", 2000 + Math.random() * 4000);
          }
          break;
        case "stroll-pause":
          if (now >= modeUntil) setMode("stroll-back");
          break;
      }
    }

    // hop physics
    if (hopVy !== 0 || hopY > 0) {
      hopVy -= 900 * dt;
      hopY = Math.max(0, hopY + hopVy * dt);
      if (hopY === 0) hopVy = 0;
    }

    crabEl.style.transform = `translate(${x}px, ${-hopY}px)`;

    // shell rattle + fade
    if (mode === "asleep") {
      const rate = eventTimes.length;
      if (rattleEnergy > 0.01) {
        rattleEnergy *= Math.exp(-dt * 1.4);
      }
      if (!shellEl.classList.contains("hidden")) {
        if (rattleEnergy > 0.05) {
          const wobble = Math.sin((now / 1000) * (16 + rate * 3)) * 9 * rattleEnergy;
          const jitter = Math.sin((now / 1000) * (23 + rate * 4)) * 1.5 * rattleEnergy;
          shellEl.style.transform = `rotate(${wobble}deg) translateX(${jitter}px)`;
        } else {
          shellEl.style.transform = "";
        }
        // fully visible for a few seconds after tucking in or on hover;
        // otherwise barely-there — it keeps rattling, just transparently
        const wantVisible = hoverShell || now - shellShownAt < 4000;
        const target = wantVisible ? 1 : SHELL_FADED_OPACITY;
        const ease = target > shellOpacity ? 5 : 0.3; // quick to appear, slow to fade
        shellOpacity += Math.max(-ease * dt, Math.min(ease * dt, target - shellOpacity));
        shellEl.style.opacity = shellOpacity.toFixed(3);
      } else if (shellInTray) {
        // tucked into the tray: rattle by swapping tilt frames
        let frame = 0;
        if (rattleEnergy > 0.05) {
          const s = Math.sin((now / 1000) * (16 + rate * 3));
          frame = s > 0.3 ? 1 : s < -0.3 ? 2 : 0;
        }
        if (frame !== lastTrayFrame) {
          lastTrayFrame = frame;
          window.crabAPI.sendTrayFrame(frame);
        }
      }
    }

    if (mode !== "asleep") {
      CRAB.draw(ctx, {
        t: now / 1000,
        walking,
        blink: now < blinkUntil,
        look: walking ? dir : 0,
        wave: waving && (mode === "pause" || mode === "home-stand"),
        frenzy: mode === "zoomies" || mode === "going-home"
      });
    }

    updateBubble(now);
    positionBubble();
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
      (!crabEl.classList.contains("hidden") && pointOver(crabEl, e.clientX, e.clientY)) ||
      hoverShell ||
      (!bubbleEl.classList.contains("hidden") && pointOver(bubbleEl, e.clientX, e.clientY));
    if (over !== interactive) {
      interactive = over;
      window.crabAPI.setInteractive(over);
    }
  });

  crabEl.addEventListener("click", () => {
    if (hopY === 0) { hopVy = 260; hopY = 0.01; }
    bubbleMode = bubbleMode === "muted" ? "auto" : "muted";
    if (bubbleMode === "auto") nextIdleLine = performance.now();
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
  window.crabAPI.onShellInTray((inTray) => {
    shellInTray = inTray;
    lastTrayFrame = -1;
    if (inTray) {
      // render nothing: crab, bubble and shell all vanish instantly
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
      // coming back on screen as the regular shell
      showShellEl();
    }
  });

  // ---------- tray icon ----------
  function sendTrayIcon() {
    const c = document.createElement("canvas");
    c.width = 36;
    c.height = 36;
    const tctx = c.getContext("2d");
    tctx.translate(0, 4);
    CRAB.draw(tctx, { t: 0, walking: false, blink: false, look: 0, wave: false });
    window.crabAPI.sendTrayIcon(c.toDataURL("image/png"));
  }

  // shell tray icons: straight + two tilts, for rattling inside the tray
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
