const fs = require("fs/promises");
const path = require("path");
const os = require("os");

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const ACTIVE_WINDOW_MS = 3 * 60 * 1000; // session counts as "recent" for 3 min
const WORKING_WINDOW_MS = 20 * 1000; // file touched in last 20s => actively working
const TAIL_BYTES = 256 * 1024;
const MAX_SESSIONS = 3;

async function listRecentSessionFiles() {
  let dirents;
  try {
    dirents = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  await Promise.all(
    dirents
      .filter((d) => d.isDirectory())
      .map(async (d) => {
        const dir = path.join(PROJECTS_DIR, d.name);
        let entries;
        try {
          entries = await fs.readdir(dir);
        } catch {
          return;
        }
        await Promise.all(
          entries
            .filter((f) => f.endsWith(".jsonl"))
            .map(async (f) => {
              const filePath = path.join(dir, f);
              try {
                const st = await fs.stat(filePath);
                files.push({ filePath, mtimeMs: st.mtimeMs, size: st.size });
              } catch {
                // file may vanish between readdir and stat
              }
            })
        );
      })
  );
  const now = Date.now();
  return files
    .filter((f) => now - f.mtimeMs < ACTIVE_WINDOW_MS)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_SESSIONS);
}

async function readTail(filePath, size) {
  const handle = await fs.open(filePath, "r");
  try {
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    if (buf.length) await handle.read(buf, 0, buf.length, start);
    return { text: buf.toString("utf8"), truncated: start > 0 };
  } finally {
    await handle.close();
  }
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const texts = content.filter((c) => c.type === "text" && c.text).map((c) => c.text);
  return texts.length ? texts.join(" ") : null;
}

function extractTool(content) {
  if (!Array.isArray(content)) return null;
  const tool = content.find((c) => c.type === "tool_use");
  if (!tool) return null;
  const desc = tool.input && tool.input.description;
  return desc ? `${tool.name}: ${desc}` : tool.name;
}

function cleanSnippet(text, max = 200) {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1).trimEnd() + "…" : cleaned;
}

function humanizeSlug(slug) {
  return slug ? slug.replace(/-/g, " ") : null;
}

async function parseSession(file) {
  const { text, truncated } = await readTail(file.filePath, file.size);
  let lines = text.split("\n").filter(Boolean);
  if (truncated) lines = lines.slice(1); // drop partial first line

  let lastText = null;
  let lastTool = null;
  let summary = null;
  let cwd = null;
  let slug = null;

  // Walk from the end: the most recent assistant prose + tool use win.
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!cwd && entry.cwd) cwd = entry.cwd;
    if (!slug && entry.slug) slug = entry.slug;
    if (!summary && entry.type === "summary" && entry.summary) summary = entry.summary;
    if (entry.type === "assistant" && !entry.isSidechain && entry.message) {
      if (!lastTool) lastTool = extractTool(entry.message.content);
      if (!lastText) {
        const t = extractText(entry.message.content);
        if (t) lastText = t;
      }
    }
    if (lastText && lastTool && cwd && slug) break;
  }

  if (!lastText && !lastTool) return null;

  const now = Date.now();
  return {
    project: cwd ? path.basename(cwd) : path.basename(path.dirname(file.filePath)),
    title: summary || humanizeSlug(slug) || (cwd ? path.basename(cwd) : "claude session"),
    text: lastText ? cleanSnippet(lastText) : null,
    tool: lastTool ? cleanSnippet(lastTool, 80) : null,
    working: now - file.mtimeMs < WORKING_WINDOW_MS,
    ageMs: Math.round(now - file.mtimeMs)
  };
}

async function getClaudeState() {
  const files = await listRecentSessionFiles();
  const sessions = [];
  for (const file of files) {
    try {
      const session = await parseSession(file);
      if (session) sessions.push(session);
    } catch {
      // unreadable session file — skip
    }
  }
  return { sessions };
}

module.exports = { getClaudeState };
