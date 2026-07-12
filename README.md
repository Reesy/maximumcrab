# maximumcrab 🦀

A cute pixel crab that walks along the top of your taskbar and narrates what
Claude Code and your git repos are up to.

![maximumcrab walking across the taskbar, narrating a live Claude Code session](assets/demo.gif)

*(Actual footage of the crab narrating the recording of this very GIF.)*

## What it does

- **Walks across your screen** in a transparent, click-through, always-on-top
  strip pinned just above the taskbar. It scuttles, pauses, blinks, and
  occasionally waves a claw.
- **Reads Claude Code state** from `~/.claude/projects/*/*.jsonl`. When a
  session is active, a speech bubble shows the session title, Claude's latest
  message, the tool it's currently running, and a spinner while it works.
- **Reads git state** from repos in `~/Documents/workspace` and `~/repos`.
  When Claude is idle, the crab chats about uncommitted files, unpushed
  commits, and branches that are behind.

## Run it

```sh
npm install
npm start
```

## Interacting

- The window is click-through except over the crab, its bubble, and the shell.
- **Click the crab** — it hops, and toggles the speech bubble on/off.
- **Right-click the crab** (or the tray icon) — send him home, pause walking,
  open the GIF capture frame, or quit.

## Sending him home 🐚

Right-click → **Send him home** and the crab sprints to the far right and
tucks into a small seashell. While he sleeps:

- After a few seconds the shell **fades to barely-there** (20% opacity) and
  stays that way; only hovering over it brings it back into focus.
- The shell **rattles** when Claude or git activity comes in — even while
  faded — it never shows the content, and the faster the updates arrive, the
  harder it rattles.
- Prefer a totally clear screen? Toggle **Hide in tray**: everything on
  screen vanishes instantly — the tray icon becomes the shell, rattles
  there when activity arrives, and clicking it wakes him. The crabcap
  recorder keeps working the whole time.
- **Click the shell** to wake him: he bursts out with zoomies proportional to
  how much he missed, then settles down standing beside his shell spot.
- Once woken, he's a home-body: he mostly stands at the far right, takes the
  occasional stroll, and always wanders back home.

Agents can do it too: `POST /crab/sleep` and `POST /crab/wake` on the control
API.

## crabcap 🎥 — built-in GIF recorder

Right-click the crab → **GIF capture frame** to summon a draggable, resizable
frame. Park it over anything (the framed content stays fully clickable — only
the toolbar and corner grip take the mouse), pick a length and fps, hit
**● rec**. The GIF lands in `~/Videos/crabcap/`.

![crabcap recording the crab walking through its own capture frame](assets/crabcap-demo.gif)

*(A GIF of crabcap taking a GIF of the crab. The crab's GIF also came out
great.)*

### Driving it from an agent

The app listens on `http://127.0.0.1:43117` (loopback only) so any tool that
can `curl` can record GIFs — no vision or reasoning required, which makes it
perfect for a thin skill on a small model:

```sh
curl -sX POST http://127.0.0.1:43117/record \
  -d '{"x":100,"y":200,"width":800,"height":450,"seconds":5,"fps":15}'
# → {"path":"C:\\Users\\you\\Videos\\crabcap\\crabcap-20260712-031500.gif",...}
```

`GET /` returns the full API help text. A ready-made Claude Code skill lives in
[`skills/crabcap/SKILL.md`](skills/crabcap/SKILL.md) — copy the `crabcap`
folder into `~/.claude/skills/` and Claude can take GIFs of your screen on
request.

## How it works

| Piece | Role |
| --- | --- |
| `main.js` | Transparent always-on-top window, tray, polls state every 3s |
| `lib/claude-state.js` | Tails recent session JSONL files, extracts latest assistant text + tool |
| `lib/git-state.js` | `git status --porcelain -b` across workspace repos |
| `renderer/crab.js` | Procedural pixel-art crab (walk / blink / wave frames) |
| `renderer/app.js` | Walking behavior, hop physics, speech bubble |
| `lib/capture.js` | crabcap window + `desktopCapturer` recording orchestration |
| `lib/control-server.js` | Loopback HTTP API (`:43117`) for agent-driven capture |
| `renderer/capture.*` | Capture frame UI + gifenc GIF encoding |

`test/preview.html` renders the sprite poses in a plain browser for tweaking
the pixel art.
