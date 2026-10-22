import { spawnSync } from "node:child_process";
const files = [
  "cloud/worker/*.mjs",
  "admin-local/**/*.mjs",
  "admin-local/public/*",
  "tests/*.mjs",
  "src/components/StudySharingNotice.jsx",
  "src/lib/studyClock.mjs",
];
let result = spawnSync(
  process.execPath,
  ["tests/node_modules/prettier/bin/prettier.cjs", "--check", ...files],
  { stdio: "inherit" },
);
if (result.status) process.exit(result.status);
for (const file of [
  "cloud/worker/index.mjs",
  "cloud/worker/validation.mjs",
  "admin-local/server.mjs",
  "admin-local/public/app.js",
]) {
  result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status) process.exit(result.status);
}
result = spawnSync(
  "rustfmt",
  [
    "+stable",
    "--check",
    "--edition",
    "2021",
    "--config",
    "skip_children=true",
    "src-tauri/src/study_sync.rs",
    "src-tauri/src/lib.rs",
  ],
  { stdio: "inherit" },
);
process.exit(result.status || 0);
