import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
const require = createRequire(
  new URL("../cloud/worker/package.json", import.meta.url),
);
const {
  Miniflare,
  Log,
  LogLevel,
  convertV4MiniflareOptions,
} = require("miniflare");
const sha = async (s) =>
  Buffer.from(
    await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
  ).toString("hex");
function statements(schema) {
  let sql = "",
    trigger = false;
  const result = [];
  for (const line of schema.split("\n")) {
    sql += line + "\n";
    if (/^CREATE TRIGGER/.test(line)) trigger = true;
    if (
      (!trigger && line.trim().endsWith(";")) ||
      (trigger && line.trim() === "END;")
    ) {
      result.push(sql);
      sql = "";
      trigger = false;
    }
  }
  if (sql.trim() && !sql.trim().startsWith("--"))
    throw new Error("Incomplete schema");
  return result;
}
export async function runtimeDatabase() {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-10-01",
      log: new Log(LogLevel.NONE),
      modules: [
        {
          type: "ESModule",
          path: "entry.mjs",
          contents: `export {default} from './index.mjs';`,
        },
        {
          type: "ESModule",
          path: "index.mjs",
          contents: await readFile(
            new URL("../cloud/worker/index.mjs", import.meta.url),
            "utf8",
          ),
        },
        {
          type: "ESModule",
          path: "validation.mjs",
          contents: await readFile(
            new URL("../cloud/worker/validation.mjs", import.meta.url),
            "utf8",
          ),
        },
      ],
      d1Databases: { DB: "synthetic-only" },
      bindings: { ADMIN_TOKEN_HASH: await sha("aa".repeat(32)) },
      ratelimits: {
        ENROLL_RATE: { namespace_id: "1001", simple: { limit: 5, period: 60 } },
        AUTH_RATE: { namespace_id: "1002", simple: { limit: 120, period: 60 } },
      },
      telemetry: { enabled: false },
    }),
  );
  const binding = await runtime.getD1Database("DB");
  const db = {
    prepare: (sql) => binding.prepare(sql),
    batch: (queries) => binding.batch(queries),
    runtime,
    close: () => runtime.dispose(),
  };
  const schema = await readFile(
    new URL("../cloud/worker/migrations/0001_sync.sql", import.meta.url),
    "utf8",
  );
  try {
    await db.batch(statements(schema).map((sql) => db.prepare(sql)));
  } catch (e) {
    await runtime.dispose();
    throw e;
  }
  return db;
}
