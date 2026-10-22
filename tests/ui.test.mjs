import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { build } from "esbuild";
import { demoRequest } from "../admin-local/synthetic.mjs";
const settle = () => new Promise((r) => setImmediate(r));
async function noticeFixture(
  t,
  initial = {
    needsName: true,
    sharingEnabled: true,
    configured: true,
    recipient: "Synthetic administrator",
    enrollmentState: "name_required",
    pending: 0,
    blocked: 0,
    lastSuccessAt: null,
  },
) {
  const window = new Window({ url: "http://127.0.0.1:4179" });
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const dir = await mkdtemp(
    new URL("./.ui-generated-", import.meta.url).pathname,
  );
  let status = { ...initial },
    calls = [],
    rejectNext = false,
    hold;
  globalThis.__lecturaInvoke = async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "study_sync_status") return { ...status };
    if (cmd === "study_sync_wake") return;
    if (rejectNext) {
      rejectNext = false;
      throw new Error("synthetic failure");
    }
    if (hold) await hold;
    if (cmd === "study_sync_set_name")
      status = {
        ...status,
        needsName: false,
        sharingEnabled: args.sharingEnabled,
        enrollmentState: "pending",
      };
    if (cmd === "study_sync_set_enabled")
      status = { ...status, sharingEnabled: args.enabled };
  };
  const result = await build({
    entryPoints: [
      new URL("../src/components/StudySharingNotice.jsx", import.meta.url)
        .pathname,
    ],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    packages: "external",
    plugins: [
      {
        name: "synthetic-ipc",
        setup(b) {
          b.onResolve({ filter: /^@tauri-apps\/api\/tauri$/ }, () => ({
            path: "synthetic-ipc",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const invoke=(cmd,args)=>globalThis.__lecturaInvoke(cmd,args);",
            loader: "js",
          }));
        },
      },
    ],
  });
  const path = dir + "/notice.mjs";
  await writeFile(path, result.outputFiles[0].text);
  const { StudySharingNotice } = await import(path);
  const React = await import("react");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(StudySharingNotice));
    await settle();
  });
  t.after(async () => {
    await act(() => root.unmount());
    await window.happyDOM.close();
    await rm(dir, { recursive: true });
    delete globalThis.__lecturaInvoke;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });
  return {
    window,
    host,
    act,
    calls,
    setReject: () => {
      rejectNext = true;
    },
    setHold: (p) => {
      hold = p;
    },
  };
}
test("learner notice is default-on with recipient disclosure, name only and no consent checkbox", async (t) => {
  const { host } = await noticeFixture(t);
  assert.match(host.textContent, /on by default/);
  assert.match(host.textContent, /Synthetic administrator/);
  assert.match(host.textContent, /Earlier study history is never uploaded/);
  assert.equal(host.querySelectorAll("input").length, 1);
  assert.equal(host.querySelector("input[type=checkbox]"), null);
  assert.ok(
    [...host.querySelectorAll("button")].find(
      (x) => x.textContent === "Continue",
    ),
  );
});
test("repeat pause/resume, duplicate click and interrupted mutation recover without losing controls", async (t) => {
  const { host, act, calls, window, setReject, setHold } = await noticeFixture(
    t,
    {
      needsName: false,
      sharingEnabled: true,
      configured: true,
      recipient: "Synthetic administrator",
      enrollmentState: "approved",
      pending: 1,
      blocked: 0,
    },
  );
  const getButton = (text) =>
    [...host.querySelectorAll("button")].find((x) => x.textContent === text);
  let release;
  setHold(
    new Promise((r) => {
      release = r;
    }),
  );
  await act(async () => {
    getButton("Pause sharing").click();
    getButton("Pause sharing").click();
    await settle();
  });
  assert.equal(
    calls.filter((x) => x.cmd === "study_sync_set_enabled").length,
    1,
  );
  assert.ok(getButton("Pause sharing").disabled);
  await act(async () => {
    release();
    await settle();
  });
  setHold(null);
  assert.ok(getButton("Resume sharing"));
  await act(async () => {
    getButton("Resume sharing").click();
    await settle();
  });
  assert.ok(getButton("Pause sharing"));
  setReject();
  await act(async () => {
    getButton("Pause sharing").click();
    await settle();
  });
  assert.match(
    host.querySelector("[role=alert]").textContent,
    /Could not save/,
  );
  assert.equal(getButton("Pause sharing").disabled, false);
  await act(async () => {
    getButton("Pause sharing").click();
    await settle();
  });
  assert.ok(getButton("Resume sharing"));
  await act(async () => {
    getButton("Sharing details").click();
  });
  assert.match(
    host.textContent,
    /Notes, screenshots, files and local paths stay here/,
  );
});
test("admin DOM flows show course/video IDs and UTC totals; interrupted refresh recovers; text is escaped", async (t) => {
  const window = new Window({
    url: "http://127.0.0.1:4179",
    settings: { enableJavaScriptEvaluation: true },
  });
  t.after(() => window.happyDOM.close());
  window.document.write(
    await readFile(
      new URL("../admin-local/public/index.html", import.meta.url),
      "utf8",
    ),
  );
  let fail = false;
  window.fetch = async (path, opts = {}) => {
    if (path === "/bootstrap")
      return Response.json({ csrf: "synthetic-session-only", demo: true });
    if (fail) {
      fail = false;
      throw new Error("synthetic offline");
    }
    const url = new URL(path, "http://127.0.0.1:4179");
    const v = demoRequest(
      url,
      opts.method || "GET",
      opts.body ? JSON.parse(opts.body) : undefined,
    );
    if (url.pathname.endsWith("/learners"))
      v.items[0].display_name = "<img src=x onerror=alert(1)> synthetic";
    return Response.json(v);
  };
  window.eval(
    await readFile(
      new URL("../admin-local/public/app.js", import.meta.url),
      "utf8",
    ),
  );
  await settle();
  await settle();
  const doc = window.document;
  assert.match(doc.querySelector("#mode").textContent, /Synthetic/);
  assert.equal(doc.querySelectorAll("#learners img").length, 0);
  assert.match(doc.querySelector("#learners").textContent, /<img/);
  [...doc.querySelectorAll("button")]
    .find((b) => b.textContent === "View study detail")
    .click();
  await settle();
  await settle();
  assert.equal(doc.querySelector("#detail").hidden, false);
  assert.match(doc.querySelector("#activity").textContent, /synthetic-course/);
  assert.match(doc.querySelector("#activity").textContent, /synthetic-video/);
  fail = true;
  doc.querySelector("#refresh").click();
  await settle();
  await settle();
  assert.match(doc.querySelector("#error").textContent, /synthetic offline/);
  doc.querySelector("#refresh").click();
  await settle();
  await settle();
  assert.equal(doc.querySelector("#error").textContent, "");
  doc.querySelector("[data-view=health]").click();
  await settle();
  await settle();
  assert.match(doc.querySelector("#health-info").textContent, /UTC/);
  doc.querySelector("#kill-switch").click();
  await settle();
  await settle();
  assert.equal(
    doc.querySelector("#kill-switch").textContent,
    "Resume ingestion",
  );
  doc.querySelector("#kill-switch").click();
  await settle();
  await settle();
  assert.equal(
    doc.querySelector("#kill-switch").textContent,
    "Pause ingestion",
  );
  doc.querySelector("[data-view=enrollments]").click();
  await settle();
  await settle();
  assert.match(
    doc.querySelector("#pending").textContent,
    /No enrollment requests/,
  );
});

test("a revoked installation can still pause locally, but cannot resume sharing", async (t) => {
  const { host, act } = await noticeFixture(t, {
    needsName: false,
    sharingEnabled: true,
    configured: true,
    recipient: "Synthetic administrator",
    enrollmentState: "revoked",
    pending: 1,
    blocked: 0,
  });
  const pause = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Pause sharing",
  );
  assert.equal(pause.disabled, false);
  await act(async () => {
    pause.click();
    await settle();
  });
  const resume = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Resume sharing",
  );
  assert.ok(resume);
  assert.equal(resume.disabled, true);
});
