import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../admin-local/keychain-session.mjs", import.meta.url),
);
const synthetic = "a".repeat(64);
function run(origin, fail = false) {
  // Synthetic bearer only. No Keychain, network, Worker or persistent credential.
  const fixture = `globalThis.fetch = async (url, init) => {
    if (init.headers.Authorization !== 'Bearer ' + 'a'.repeat(64)) throw Error('bad fixture');
    if (${fail}) throw Error(init.headers.Authorization);
    const value = url.endsWith('/health') ? {controls:{window_expires_at:0},pending:{count:0}} : {items:[]};
    return new Response(JSON.stringify(value), {headers:{'content-type':'application/json'}});
  };`;
  return spawnSync(
    process.execPath,
    [
      "--import",
      "data:text/javascript," + encodeURIComponent(fixture),
      script,
      "check",
    ],
    {
      input: synthetic,
      encoding: "utf8",
      env: { ...process.env, LECTURA_ADMIN_ORIGIN: origin },
    },
  );
}
test("Keychain child authenticates via its private pipe and never echoes the credential", () => {
  const result = run("https://synthetic.example");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Authenticated remote checks passed/);
  assert.ok(!(result.stdout + result.stderr).includes(synthetic));
});
test("Keychain child rejects unsafe origins and redacts exceptions containing auth", () => {
  for (const origin of [
    "http://synthetic.example",
    "https://synthetic.example?",
    "https://synthetic.example#",
    "https://user@synthetic.example",
  ]) {
    const result = run(origin);
    assert.equal(result.status, 1);
    assert.ok(!(result.stdout + result.stderr).includes(synthetic));
  }
  const result = run("https://synthetic.example", true);
  assert.equal(result.status, 1);
  assert.ok(!(result.stdout + result.stderr).includes(synthetic));
});
