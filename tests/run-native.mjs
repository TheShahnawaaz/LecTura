import { spawnSync } from "node:child_process";
const env = {
  ...process.env,
  CARGO_PROFILE_DEV_DEBUG: "0",
  CARGO_PROFILE_TEST_DEBUG: "0",
  CARGO_INCREMENTAL: "0",
  TAURI_CONFIG: JSON.stringify({ tauri: { bundle: { externalBin: [] } } }),
  LECTURA_SYNC_ORIGIN: "",
  LECTURA_SYNC_RECIPIENT: "Synthetic test administrator",
};
for (const args of [
  [
    "+stable",
    "check",
    "--locked",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--no-default-features",
  ],
  [
    "+stable",
    "test",
    "--locked",
    "--lib",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--no-default-features",
  ],
]) {
  const result = spawnSync("cargo", args, { env, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status) process.exit(result.status);
}
