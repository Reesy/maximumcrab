---
name: crabcap
description: Record a GIF of a screen region via the local crabcap API. Use when asked to record, capture, or make a GIF of the screen, a window, or a region. Requires the maximumcrab app to be running.
---

# crabcap — record screen GIFs

Everything is one curl away, against `http://127.0.0.1:43117`. If a request
fails to connect, maximumcrab isn't running — ask the user to start it
(`npm start` in the maximumcrab repo), don't try to start it yourself.

## Recipes

**Record a region directly** (when you know the coordinates — fastest path):

```sh
curl -sX POST http://127.0.0.1:43117/record \
  -d '{"x":100,"y":200,"width":800,"height":450,"seconds":5,"fps":15}'
```

Blocks until done. Returns `{"path": "...", "frames": N, "bytes": N}`. Report
the `path` to the user.

**Let the user aim the frame** (when you don't know what to point at):

```sh
curl -sX POST http://127.0.0.1:43117/show   # draggable frame appears
```

Tell the user to drag/resize the frame over what they want, wait for them to
confirm, then record whatever it frames:

```sh
curl -sX POST http://127.0.0.1:43117/record -d '{"seconds":5}'
```

**Other commands:**

```sh
curl -s http://127.0.0.1:43117/state        # where is the frame, is it recording
curl -sX POST http://127.0.0.1:43117/frame -d '{"x":0,"y":0,"width":1280,"height":720}'
curl -sX POST http://127.0.0.1:43117/hide
curl -s http://127.0.0.1:43117/             # full API help text
```

## Notes

- Defaults: `seconds=5` (max 30), `fps=15` (max 30). Save location defaults to
  `~/Videos/crabcap/`; pass `"out": "C:\\path\\to\\file.gif"` to choose.
- Coordinates are device-independent pixels, origin at the primary display's
  top-left.
- Only one recording at a time; a second `/record` while busy returns an error.
