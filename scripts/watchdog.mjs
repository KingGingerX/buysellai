import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const checks = [
  ["Executable package scripts", "package.json", (text) => text.includes('"validate"') && text.includes('"watchdog"')],
  ["Marketplace shell", "index.html", (text) => text.includes("BuySellAI.store") && text.includes("seller-form")],
  ["Responsive styling", "assets/styles.css", (text) => text.includes("@media") && text.includes("--accent")],
  ["Client behavior", "assets/app.js", (text) => text.includes("addEventListener") && text.includes("/api/")],
  ["Domain validation", "src/marketplace.mjs", (text) => text.includes("createListing") && text.includes("searchListings")],
  ["Automated tests", "test/marketplace.test.mjs", (text) => text.includes("node:test")],
  ["Deployment guide", "docs/DEPLOYMENT.md", (text) => text.includes("dist") && text.includes("validate")],
  ["Security guide", "docs/SECURITY.md", (text) => text.includes("input") && text.includes("payment")]
];

const results = [];

for (const [name, relativePath, predicate] of checks) {
  const fullPath = join(root, relativePath);
  await stat(fullPath);
  const text = await readFile(fullPath, "utf8");
  results.push({ name, passed: predicate(text) });
}

const passed = results.filter((result) => result.passed).length;
const score = Math.round((passed / results.length) * 100);

process.stdout.write(`ProjectWatchdog score: ${score}\n`);
for (const result of results) {
  process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${result.name}\n`);
}

if (score < 90) {
  process.exit(1);
}
