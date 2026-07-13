import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const files = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if ([".js", ".mjs"].includes(extname(entry.name))) {
      files.push(fullPath);
    }
  }
}

function check(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "pipe" });
    let output = "";

    child.stderr.on("data", (chunk) => {
      output += chunk;
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${file}\n${output}`));
    });
  });
}

await walk(root);
await Promise.all(files.map(check));
process.stdout.write("Typecheck passed.\n");
