import { spawn } from "node:child_process";

const commands = [
  [process.execPath, ["scripts/lint.mjs"]],
  [process.execPath, ["scripts/typecheck.mjs"]],
  [process.execPath, ["--test"]],
  [process.execPath, ["scripts/build.mjs"]],
  [process.execPath, ["scripts/watchdog.mjs"]]
];

for (const [command, args] of commands) {
  await run(command, args);
}

process.stdout.write("Validation passed.\n");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}`));
    });
  });
}
