import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = process.cwd();
const checkedExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".txt", ".webmanifest"]);
const blocked = [
  ["T", "O", "D", "O"].join(""),
  ["F", "I", "X", "M", "E"].join(""),
  ["H", "A", "C", "K"].join(""),
  ["X", "X", "X"].join(""),
  ["c", "o", "n", "s", "o", "l", "e", ".", "l", "o", "g"].join(""),
  ["p", "l", "a", "c", "e", "h", "o", "l", "d", "e", "r"].join(""),
  ["s", "t", "u", "b"].join(""),
  ["f", "a", "k", "e"].join(""),
  ["m", "o", "c", "k"].join("")
];
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);

const failures = [];

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

    if (!checkedExtensions.has(extname(entry.name))) {
      continue;
    }

    const content = await readFile(fullPath, "utf8");

    for (const term of blocked) {
      if (content.toLowerCase().includes(term.toLowerCase())) {
        failures.push(`${fullPath} contains blocked term ${term}`);
      }
    }

    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (/[ \t]+$/.test(line)) {
        failures.push(`${fullPath}:${index + 1} has trailing whitespace`);
      }
    });

    if (!content.endsWith("\n")) {
      failures.push(`${fullPath} is missing final newline`);
    }
  }
}

await walk(root);

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Lint passed.\n");
