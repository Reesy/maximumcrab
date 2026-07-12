# maximumcrab 🦀

A cute pixel crab that walks along the top of your taskbar and narrates what
Claude Code and your git repos are up to.

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

- The window is click-through except over the crab and its bubble.
- **Click the crab** — it hops, and toggles the speech bubble on/off.
- **Right-click the crab** (or the tray icon) — pause walking / quit.

## How it works

| Piece | Role |
| --- | --- |
| `main.js` | Transparent always-on-top window, tray, polls state every 3s |
| `lib/claude-state.js` | Tails recent session JSONL files, extracts latest assistant text + tool |
| `lib/git-state.js` | `git status --porcelain -b` across workspace repos |
| `renderer/crab.js` | Procedural pixel-art crab (walk / blink / wave frames) |
| `renderer/app.js` | Walking behavior, hop physics, speech bubble |

`test/preview.html` renders the sprite poses in a plain browser for tweaking
the pixel art.
