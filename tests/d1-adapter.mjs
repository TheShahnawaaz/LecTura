import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
export async function database() {
  const child = spawn(
    process.env.LECTURA_TEST_PYTHON || "python3",
    ["-u", new URL("./sqlite_bridge.py", import.meta.url).pathname],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  const waiting = new Map();
  let sequence = 0;
  createInterface({ input: child.stdout }).on("line", (line) => {
    const v = JSON.parse(line),
      p = waiting.get(v.id);
    waiting.delete(v.id);
    v.error ? p.reject(new Error(v.error)) : p.resolve(v.result);
  });
  const call = (req) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      waiting.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ id, ...req }) + "\n");
    });
  const prepare = (sql) => ({
    sql,
    values: [],
    bind(...values) {
      this.values = values;
      return this;
    },
    async all() {
      return (await call({ queries: [this] }))[0];
    },
    async first() {
      return (await this.all()).results[0] || null;
    },
    async run() {
      return this.all();
    },
  });
  const db = {
    prepare,
    batch: (queries) => call({ queries }),
    export: () => call({ export: true }),
    restore: (sql) => call({ restore: sql }),
    close: () => child.stdin.end(),
  };
  await call({
    schema: await readFile(
      new URL("../cloud/worker/migrations/0001_sync.sql", import.meta.url),
      "utf8",
    ),
  });
  return db;
}
