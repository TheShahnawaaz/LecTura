// Internal child of macos-keychain.swift; never invoke with a credential in argv/env.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createAdminServer } from "./server.mjs";

try {
  const mode = process.argv[2];
  if (!["check", "serve"].includes(mode) || process.stdin.isTTY)
    throw new Error("Use the macOS Keychain helper.");
  const raw = process.env.LECTURA_ADMIN_ORIGIN;
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.href.includes("?") ||
    url.href.includes("#")
  )
    throw new Error("A fixed HTTPS origin is required.");
  const credential = readFileSync(0, "utf8");
  if (!/^[a-f0-9]{64}$/.test(credential))
    throw new Error("Invalid Keychain credential.");
  if (mode === "check") {
    const request = async (path) => {
      const response = await fetch(url.origin + path, {
        headers: { Authorization: `Bearer ${credential}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type") || "",
        /application\/json/,
      );
      return response.json();
    };
    const health = await request("/v1/admin/health");
    assert.equal(health.controls.window_expires_at, 0);
    assert.equal(health.pending.count, 0);
    assert.equal((await request("/v1/admin/learners")).items.length, 0);
    assert.equal((await request("/v1/admin/enrollments")).items.length, 0);
    console.log(
      "Authenticated remote checks passed: registration closed; no learners, installations or pending requests.",
    );
  } else {
    const server = createAdminServer({ upstream: url.origin, credential });
    server.on("error", () => {
      console.error("Could not bind the loopback dashboard.");
      process.exitCode = 1;
    });
    server.listen(4179, "127.0.0.1", () =>
      console.log("LecTura private admin: http://127.0.0.1:4179"),
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => server.close());
  }
} catch {
  // No exception dump: fetch/child-process errors must never disclose auth headers.
  console.error(
    "Admin operation failed. Check the fixed HTTPS origin, Keychain access, service configuration and closed-registration state.",
  );
  process.exitCode = 1;
}
