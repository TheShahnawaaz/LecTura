import { mkdirSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.error(
    "This Keychain launcher requires macOS. Use server.mjs interactively on other systems.",
  );
  process.exit(1);
}
const action = process.argv[2] || "serve";
if (!["status", "create", "configure", "check", "serve"].includes(action)) {
  console.error("Use status, create, configure, check or serve.");
  process.exit(1);
}
const source = fileURLToPath(
  new URL("./macos-keychain.swift", import.meta.url),
);
const directory = fileURLToPath(new URL("./.macos-bin/", import.meta.url));
const executable = directory + "keychain-helper";
mkdirSync(directory, { recursive: true, mode: 0o700 });
let build = true;
try {
  build = statSync(source).mtimeMs > statSync(executable).mtimeMs;
} catch {}
if (build) {
  const result = spawnSync(
    "/usr/bin/swiftc",
    [
      "-module-cache-path",
      directory + "module-cache",
      source,
      "-o",
      executable,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(1);
}
const child = spawn(executable, [action, process.execPath], {
  stdio: "inherit",
});
child.once("error", () => {
  console.error("Could not start the Keychain helper.");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
