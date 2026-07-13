import { cp, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const requiredFiles = [
  "index.html",
  "assets/app.js",
  "assets/styles.css",
  "package.json",
  "scripts/serve.mjs",
  "src/marketplace.mjs"
];

for (const file of requiredFiles) {
  await stat(join(root, file));
}

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "index.html"), join(dist, "index.html"));
await cp(join(root, "manifest.webmanifest"), join(dist, "manifest.webmanifest"));
await cp(join(root, "package.json"), join(dist, "package.json"));
await cp(join(root, "Dockerfile"), join(dist, "Dockerfile"));
await cp(join(root, "render.yaml"), join(dist, "render.yaml"));
await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });
await cp(join(root, "src"), join(dist, "src"), { recursive: true });
await cp(join(root, "scripts"), join(dist, "scripts"), { recursive: true });
await cp(join(root, "docs"), join(dist, "docs"), { recursive: true });

process.stdout.write("Build completed in dist.\n");
