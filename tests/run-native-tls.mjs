// Synthetic loopback-only integration. No OS trust changes or production credentials.
import https from "node:https";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runtimeDatabase } from "./d1-runtime-adapter.mjs";
const dir = await mkdtemp(join(tmpdir(), "lectura-synthetic-tls-"));
const useKeychain = process.argv.includes("--secure-store");
const installation = "synthetic_" + randomUUID().replaceAll("-", "");
let db, server, child;
try {
  await writeFile(
    join(dir, "openssl.cnf"),
    "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost synthetic LecTura test\n[ext]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n",
  );
  const cert = spawnSync(
    "/usr/bin/openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-config",
      join(dir, "openssl.cnf"),
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
    ],
    { stdio: "pipe" },
  );
  if (cert.status !== 0)
    throw new Error("Synthetic certificate fixture generation failed");
  db = await runtimeDatabase();
  await db
    .prepare("UPDATE controls SET window_expires_at=? WHERE id=1")
    .bind(Date.now() + 600000)
    .run();
  let mode = "normal",
    eventCalls = 0,
    redirected = 0;
  server = https.createServer(
    {
      key: await readFile(join(dir, "key.pem")),
      cert: await readFile(join(dir, "cert.pem")),
    },
    async (req, res) => {
      try {
        const respond = (status, value, headers = {}) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            ...headers,
          });
          res.end(JSON.stringify(value));
        };
        if (req.url === "/__synthetic/redirected") {
          redirected++;
          return respond(400, { error: "redirect_followed" });
        }
        let bytes = 0,
          chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 65536) return respond(413, { error: "body_too_large" });
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        if (req.url.startsWith("/__synthetic/")) {
          if (req.headers["x-lectura-synthetic"] !== "fixture")
            return respond(403, { error: "fixture_only" });
          if (req.url === "/__synthetic/mode") {
            mode = JSON.parse(raw).mode;
            return respond(200, { ok: true });
          }
          const totals = await db
            .prepare("SELECT COALESCE(SUM(focused_ms),0) n FROM daily_rollups")
            .first();
          return respond(200, {
            eventCalls,
            redirected,
            focusedMs: totals.n,
            receipts: (
              await db.prepare("SELECT COUNT(*) n FROM event_receipts").first()
            ).n,
            sharingEnabled: !!(
              await db
                .prepare(
                  "SELECT sharing_enabled FROM installations WHERE installation_id=?",
                )
                .bind(installation)
                .first()
            )?.sharing_enabled,
          });
        }
        let fault = "normal";
        if (req.url === "/v1/events") {
          eventCalls++;
          fault = mode;
          mode = "normal";
        }
        if (fault === "429")
          return respond(
            429,
            { error: "synthetic_delayed" },
            { "Retry-After": "60" },
          );
        if (fault === "413")
          return respond(413, { error: "synthetic_too_large" });
        if (fault === "redirect") {
          res.writeHead(302, {
            Location: `https://localhost:${server.address().port}/__synthetic/redirected`,
          });
          return res.end();
        }
        const response = await db.runtime.dispatchFetch(
          "https://synthetic.invalid" + req.url,
          {
            method: req.method,
            headers: {
              "Content-Type": "application/json",
              ...(req.headers.authorization
                ? { Authorization: req.headers.authorization }
                : {}),
            },
            body: raw || undefined,
          },
        );
        const payload = await response.json();
        if (fault === "drop_after_commit" && response.ok) {
          req.socket.destroy();
          return;
        }
        if (fault === "unknown_ack" && response.ok)
          payload.acknowledgedEventIds.push("synthetic_unknown_ack");
        respond(response.status, payload);
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end('{"error":"synthetic_fixture_error"}');
        } else res.destroy();
      }
    },
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  await mkdir(join(dir, "db"));
  const env = {
    ...process.env,
    CARGO_PROFILE_DEV_DEBUG: "0",
    CARGO_PROFILE_TEST_DEBUG: "0",
    CARGO_INCREMENTAL: "0",
    CARGO_NET_OFFLINE: "true",
    TAURI_CONFIG: JSON.stringify({ tauri: { bundle: { externalBin: [] } } }),
    LECTURA_SYNC_ORIGIN: "",
    LECTURA_SYNC_RECIPIENT: "Synthetic test administrator",
    LECTURA_SYNTHETIC_TLS_ORIGIN: `https://localhost:${server.address().port}`,
    LECTURA_SYNTHETIC_TLS_CA: join(dir, "cert.pem"),
    LECTURA_SYNTHETIC_INSTALLATION: installation,
    LECTURA_SYNTHETIC_DB_DIR: join(dir, "db"),
    LECTURA_SYNTHETIC_KEYCHAIN: useKeychain ? "1" : "0",
  };
  console.log(
    `Synthetic native TLS integration · ${useKeychain ? "isolated macOS Keychain entry" : "memory credential fixture"} · loopback only`,
  );
  child = spawn(
    "cargo",
    [
      "+stable",
      "test",
      "--offline",
      "--locked",
      "--lib",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--no-default-features",
      "--",
      "--ignored",
      "--exact",
      "study_sync::tests::synthetic_native_tls_outbox",
      "--nocapture",
    ],
    { env, stdio: "inherit" },
  );
  const timeout = setTimeout(() => {
    console.error(
      "Synthetic native integration timed out; no permission prompt will be bypassed.",
    );
    child.kill("SIGTERM");
  }, 90000);
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  clearTimeout(timeout);
  process.exitCode = status;
} finally {
  if (child && !child.killed && child.exitCode === null) child.kill("SIGTERM");
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  if (db) await db.close();
  if (useKeychain) {
    const cleanup = spawnSync(
      "/usr/bin/security",
      [
        "delete-generic-password",
        "-s",
        "com.lectura.study-sync.synthetic-test",
        "-a",
        installation,
      ],
      { stdio: "pipe", timeout: 10000 },
    );
    if (![0, 44].includes(cleanup.status))
      console.error(
        "Synthetic Keychain cleanup unconfirmed; installation tag: " +
          installation,
      );
    else
      console.log(
        "Synthetic Keychain entry cleanup verified (entry removed or absent).",
      );
  }
  await rm(dir, { recursive: true, force: true });
}
