import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { emitKeypressEvents } from "node:readline";
import { demoRequest } from "./synthetic.mjs";
const routes = [
  ["GET", /^\/v1\/admin\/(health|enrollments|learners)$/],
  ["GET", /^\/v1\/admin\/learners\/[a-zA-Z0-9_-]{16,100}\/activity$/],
  ["POST", /^\/v1\/admin\/(enrollment-window|ingestion)$/],
  [
    "POST",
    /^\/v1\/admin\/enrollments\/[a-zA-Z0-9_-]{16,100}\/(approve|reject)$/,
  ],
  ["POST", /^\/v1\/admin\/installations\/[a-zA-Z0-9_-]{16,100}\/revoke$/],
];
function origin(raw) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.username ||
    u.password
  )
    throw new Error("A fixed HTTPS origin is required");
  return u.origin;
}
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'";
export function createAdminServer({
  demo = false,
  upstream,
  credential,
  fetchImpl = fetch,
} = {}) {
  const target = demo ? null : origin(upstream);
  if (!demo && !/^[a-f0-9]{64}$/.test(credential || ""))
    throw new Error("An interactive application-admin credential is required");
  const csrf = randomBytes(32).toString("hex");
  return http.createServer(async (req, res) => {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": csp,
    };
    const send = (status, value, type = "application/json") => {
      res.writeHead(status, { ...headers, "Content-Type": type });
      res.end(type === "application/json" ? JSON.stringify(value) : value);
    };
    try {
      const local = `http://127.0.0.1:${req.socket.localPort}`;
      const initialNavigation =
        req.method === "GET" &&
        req.url === "/" &&
        req.headers["sec-fetch-mode"] === "navigate";
      if (
        req.headers.host !== `127.0.0.1:${req.socket.localPort}` ||
        (req.headers.origin && req.headers.origin !== local) ||
        (!initialNavigation &&
          req.headers["sec-fetch-site"] &&
          !["same-origin", "none"].includes(req.headers["sec-fetch-site"]))
      )
        return send(403, { error: "local_origin_required" });
      const url = new URL(req.url, local);
      if (
        url.origin !== local ||
        url.hash ||
        req.url.includes("%") ||
        req.url.includes("\\")
      )
        return send(400, { error: "invalid_route" });
      if (req.method === "GET" && url.pathname === "/bootstrap" && !url.search)
        return send(200, { csrf, demo, reportingTimezone: "UTC" });
      const staticFiles = {
        "/": "index.html",
        "/app.js": "app.js",
        "/style.css": "style.css",
      };
      if (req.method === "GET" && staticFiles[url.pathname] && !url.search) {
        const types = {
          "/": "text/html; charset=utf-8",
          "/app.js": "text/javascript; charset=utf-8",
          "/style.css": "text/css; charset=utf-8",
        };
        return send(
          200,
          await readFile(
            new URL(`./public/${staticFiles[url.pathname]}`, import.meta.url),
          ),
          types[url.pathname],
        );
      }
      if (
        !routes.some(
          ([m, pattern]) => m === req.method && pattern.test(url.pathname),
        )
      )
        return send(404, { error: "not_found" });
      if (req.headers["x-lectura-csrf"] !== csrf)
        return send(403, { error: "csrf_required" });
      if (
        [...url.searchParams].some(
          ([k, v]) => !["days", "cursor"].includes(k) || !/^\d{1,8}$/.test(v),
        )
      )
        return send(400, { error: "invalid_query" });
      let payload;
      if (req.method === "POST") {
        if (
          req.headers["content-type"] !== "application/json" ||
          req.headers.origin !== local
        )
          return send(403, { error: "json_and_origin_required" });
        let bytes = 0,
          chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 4096) {
            send(413, { error: "body_too_large" });
            req.destroy();
            return;
          }
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        payload = JSON.stringify(JSON.parse(raw));
      }
      if (demo)
        return send(
          200,
          demoRequest(
            url,
            req.method,
            payload ? JSON.parse(payload) : undefined,
          ),
        );
      const response = await fetchImpl(target + url.pathname + url.search, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${credential}`,
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        body: payload,
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        return send(502, { error: "invalid_upstream" });
      const reader = response.body.getReader();
      let size = 0,
        chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262144) {
          await reader.cancel();
          return send(502, { error: "response_too_large" });
        }
        chunks.push(value);
      }
      const output = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      send(response.status, output);
    } catch {
      send(502, { error: "service_unavailable" });
    }
  });
}
async function readCredential() {
  if (!process.stdin.isTTY)
    throw new Error(
      "Run in an interactive terminal; credentials are never read from files, URLs or frontend storage.",
    );
  process.stdout.write("Application-admin credential (hidden): ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKey = (str, key) => {
      if (key?.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled"));
      } else if (key?.name === "return") {
        cleanup();
        resolve(value);
      } else if (key?.name === "backspace") value = value.slice(0, -1);
      else if (/^[a-f0-9]$/.test(str || "")) value += str;
    };
    process.stdin.on("keypress", onKey);
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = process.argv.includes("--demo");
  try {
    const upstream = demo ? undefined : process.env.LECTURA_ADMIN_ORIGIN;
    if (!demo) origin(upstream);
    const credential = demo ? undefined : await readCredential();
    const server = createAdminServer({ demo, upstream, credential });
    server.listen(4179, "127.0.0.1", () =>
      process.stdout.write(
        `LecTura ${demo ? "synthetic demo" : "private admin"}: http://127.0.0.1:4179\n`,
      ),
    );
    server.on("error", () => {
      process.stderr.write("Could not bind the loopback dashboard.\n");
      process.exitCode = 1;
    });
  } catch {
    process.stderr.write(
      "Admin startup requires a fixed HTTPS service origin and an interactive application-admin credential, or --demo for synthetic data.\n",
    );
    process.exitCode = 1;
  }
}
