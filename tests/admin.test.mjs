import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createAdminServer } from "../admin-local/server.mjs";
async function server(t, options = { demo: true }) {
  const s = createAdminServer(options);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => s.close(r)));
  return `http://127.0.0.1:${s.address().port}`;
}
test("demo uses synthetic data and enforces CSRF, Host, Origin, content type and fixed routes", async (t) => {
  const url = await server(t);
  const { csrf } = await (await fetch(url + "/bootstrap")).json();
  assert.equal((await fetch(url + "/v1/admin/learners")).status, 403);
  const r = await fetch(url + "/v1/admin/learners", {
    headers: { "X-LecTura-CSRF": csrf },
  });
  assert.match(JSON.stringify(await r.json()), /synthetic/);
  for (const headers of [
    { Origin: "https://evil.invalid" },
    { Host: "evil.invalid" },
    { "Sec-Fetch-Site": "cross-site" },
  ]) {
    const status = await new Promise((resolve, reject) => {
      http
        .get(url + "/bootstrap", { headers }, (r) => {
          r.resume();
          resolve(r.statusCode);
        })
        .on("error", reject);
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
  assert.equal(
    (
      await fetch(url + "/v1/admin/enrollment-window", {
        method: "POST",
        headers: { "X-LecTura-CSRF": csrf, "Content-Type": "application/json" },
        body: '{"minutes":15}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + "/v1/admin/enrollment-window", {
        method: "POST",
        headers: {
          "X-LecTura-CSRF": csrf,
          "Content-Type": "application/json",
          Origin: url,
        },
        body: '{"minutes":15}',
      })
    ).status,
    200,
  );
  for (const path of [
    "/v1/admin/learners?url=https://evil.invalid",
    "/v1/admin/../../anything",
    "/https://evil.invalid",
    "/v1/admin/learners%2f",
  ])
    assert.notEqual(
      (await fetch(url + path, { headers: { "X-LecTura-CSRF": csrf } })).status,
      200,
    );
  const navigationStatus = await new Promise((resolve, reject) => {
    http
      .get(
        url + "/",
        {
          headers: {
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "navigate",
          },
        },
        (r) => {
          r.resume();
          resolve(r.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(navigationStatus, 200);
  const page = await fetch(url + "/");
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(page.headers.get("access-control-allow-origin"), null);
});
test("admin credential stays in proxy memory and upstream authorization, never browser content", async (t) => {
  const credential = "ab".repeat(32);
  let upstreamRequest;
  const url = await server(t, {
    upstream: "https://synthetic.invalid",
    credential,
    fetchImpl: async (...args) => {
      upstreamRequest = args;
      return Response.json({ items: [] });
    },
  });
  const bootstrap = await (await fetch(url + "/bootstrap")).json();
  await fetch(url + "/v1/admin/learners", {
    headers: { "X-LecTura-CSRF": bootstrap.csrf },
  });
  assert.equal(
    upstreamRequest[0],
    "https://synthetic.invalid/v1/admin/learners",
  );
  assert.equal(
    upstreamRequest[1].headers.Authorization,
    "Bearer " + credential,
  );
  assert.equal(upstreamRequest[1].redirect, "error");
  for (const path of ["/", "/app.js", "/bootstrap"])
    assert.ok(!(await (await fetch(url + path)).text()).includes(credential));
  assert.throws(() =>
    createAdminServer({ upstream: "http://unsafe.invalid", credential }),
  );
  assert.throws(() =>
    createAdminServer({
      upstream: "https://synthetic.invalid/path",
      credential,
    }),
  );
});
