(function () {
  const SCALE = 5;
  const CRAB_W = CRAB.W * SCALE;
  const WALK_SPEED = 42; // px/s
  const IDLE_CHATTER_EVERY_MS = 22000;
  const IDLE_CHATTER_SHOW_MS = 8000;

  const crabEl = document.getElementById("crab");
  const canvas = document.getElementById("crab-canvas");
  const bubbleEl = document.getElementById("bubble");
  const titleEl = document.getElementById("bubble-title");
  const bodyEl = document.getElementById("bubble-body");
  const footEl = document.getElementById("bubble-foot");
  const spinnerEl = document.getElementById("bubble-spinner");

  canvas.width = CRAB.W;
  canvas.height = CRAB.H;
  const ctx = canvas.getContext("2d");

  // ---------- crab state ----------
  let x = 60;
  let dir = 1;
  let mode = "walk"; // walk | pause
  let modeUntil = 0;
  let paused = false;
  let waving = false;
  let blinkUntil = 0;
  let nextBlink = performance.now() + 2500;
  let hopVy = 0;
  let hopY = 0;
  let lastFrame = performance.now();

  // ---------- world state ----------
  let claudeSessions = [];
  let gitRepos = [];
  let bubbleMode = "auto"; // auto | muted
  let idleLineUntil = 0;
  let nextIdleLine = performance.now() + 6000;
  let idleLineIndex = 0;

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function setMode(next, durMs) {
    mode = next;
    modeUntil = performance.now() + durMs;
    if (next === "pause") waving = Math.random() < 0.4;
    else waving = false;
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
    const session = claudeSessions[0];

    if (bubbleMode === "muted") {
      bubbleEl.classList.add("hidden");
      return;
    }

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

    // no active session: occasional idle chatter
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

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    // blink scheduling
    if (now >= nextBlink) {
      blinkUntil = now + 140;
      nextBlink = now + 2200 + Math.random() * 3500;
    }

    // mode switching
    if (!paused && now >= modeUntil) {
      if (mode === "walk") setMode("pause", 2000 + Math.random() * 3500);
      else setMode("walk", 3500 + Math.random() * 5000);
    }

    const walking = !paused && mode === "walk" && hopY === 0;
    if (walking) {
      x += dir * WALK_SPEED * dt;
      const maxX = window.innerWidth - CRAB_W - 12;
      if (x <= 12) { x = 12; dir = 1; }
      if (x >= maxX) { x = maxX; dir = -1; }
    }

    // hop physics
    if (hopVy !== 0 || hopY > 0) {
      hopVy -= 900 * dt;
      hopY = Math.max(0, hopY + hopVy * dt);
      if (hopY === 0) hopVy = 0;
    }

    crabEl.style.transform = `translate(${x}px, ${-hopY}px)`;

    CRAB.draw(ctx, {
      t: now / 1000,
      walking,
      blink: now < blinkUntil,
      look: paused || mode === "pause" ? 0 : dir,
      wave: waving && mode === "pause"
    });

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
    const over =
      pointOver(crabEl, e.clientX, e.clientY) ||
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

  // ---------- state from main ----------
  window.crabAPI.onState((state) => {
    claudeSessions = (state.claude && state.claude.sessions) || [];
    gitRepos = (state.git && state.git.repos) || [];
    paused = state.paused;
  });
  window.crabAPI.onPaused((p) => { paused = p; });

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

  setMode("walk", 4000);
  sendTrayIcon();
  requestAnimationFrame(frame);
})();
