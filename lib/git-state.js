const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

const ROOTS = [
  path.join(os.homedir(), "Documents", "workspace"),
  path.join(os.homedir(), "repos")
];
const MAX_REPOS = 12;
const GIT_TIMEOUT_MS = 5000;

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function findRepos() {
  const repos = [];
  for (const root of ROOTS) {
    let dirents;
    try {
      dirents = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    await Promise.all(
      dirents
        .filter((d) => d.isDirectory())
        .map(async (d) => {
          const dir = path.join(root, d.name);
          try {
            const st = await fs.stat(path.join(dir, ".git"));
            if (st.isDirectory()) {
              const dirStat = await fs.stat(dir);
              repos.push({ dir, name: d.name, mtimeMs: dirStat.mtimeMs });
            }
          } catch {
            // not a git repo
          }
        })
    );
  }
  return repos.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_REPOS);
}

function parseStatus(output) {
  const lines = output.split("\n").filter(Boolean);
  const header = lines[0] || "";
  let branch = null;
  let ahead = 0;
  let behind = 0;
  const m = header.match(/^## (\S+?)(?:\.\.\.\S+)?(?: \[(.*)\])?$/);
  if (m) {
    branch = m[1];
    if (m[2]) {
      const a = m[2].match(/ahead (\d+)/);
      const b = m[2].match(/behind (\d+)/);
      if (a) ahead = parseInt(a[1], 10);
      if (b) behind = parseInt(b[1], 10);
    }
  }
  return { branch, ahead, behind, dirty: lines.length - 1 };
}

async function getGitState() {
  const found = await findRepos();
  const repos = [];
  await Promise.all(
    found.map(async (repo) => {
      try {
        const status = await git(["status", "--porcelain=v1", "-b"], repo.dir);
        repos.push({ name: repo.name, ...parseStatus(status) });
      } catch {
        // git failed (rebase in progress, locked index, etc.) — skip
      }
    })
  );
  repos.sort((a, b) => b.dirty - a.dirty);
  return { repos };
}

module.exports = { getGitState };
