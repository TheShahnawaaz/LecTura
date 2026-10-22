"use strict";
let csrf = "",
  selected = null,
  ingest = true,
  learnerCursor = 0,
  enrollmentCursor = 0,
  activityCursor = 0,
  currentView = "overview",
  detailRequest = 0,
  learnerRequest = 0;
const $ = (s) => document.querySelector(s),
  el = (tag, text, className) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  };
const duration = (ms) =>
  `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m ${Math.floor(ms / 1000) % 60}s`;
const date = (n) =>
  n
    ? new Date(n).toLocaleString(undefined, { timeZone: "UTC" }) + " UTC"
    : "Never";
const age = (n) =>
  n
    ? `${Math.max(0, Math.floor((Date.now() - n) / 60000))} minutes ago`
    : "No activity reported";
async function api(path, body) {
  const r = await fetch("/v1/admin/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-LecTura-CSRF": csrf,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error || "Service unavailable");
  return v;
}
function button(text, fn) {
  const b = el("button", text);
  b.type = "button";
  b.onclick = () =>
    run(async () => {
      b.disabled = true;
      try {
        await fn();
      } finally {
        b.disabled = false;
      }
    });
  return b;
}
async function run(fn) {
  $("#error").textContent = "";
  try {
    await fn();
  } catch (e) {
    $("#error").textContent = e.message.replaceAll("_", " ");
  }
}
function view(name) {
  currentView = name;
  for (const s of ["overview", "detail", "enrollments", "health"])
    $("#" + s).hidden = s !== name;
}
function paging(container, hasNext, cursor, update) {
  const n = $(container);
  n.replaceChildren();
  if (cursor)
    n.append(button("Previous", () => update(Math.max(0, cursor - 50))));
  if (hasNext) n.append(button("Next", () => update(cursor + 50)));
}
function table(title, heads, rows) {
  const wrap = el("div", undefined, "table-wrap");
  wrap.append(el("h3", title));
  const t = el("table"),
    thead = el("thead"),
    tr = el("tr");
  heads.forEach((h) => tr.append(el("th", h)));
  thead.append(tr);
  t.append(thead);
  const body = el("tbody");
  rows.forEach((row) => {
    const r = el("tr");
    row.forEach((c) => r.append(el("td", String(c ?? ""))));
    body.append(r);
  });
  if (!rows.length) {
    const r = el("tr"),
      d = el("td", "No activity in this period.");
    d.colSpan = heads.length;
    r.append(d);
    body.append(r);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}
async function loadLearners() {
  const request = ++learnerRequest;
  const v = await api("learners?cursor=" + learnerCursor);
  if (request !== learnerRequest) return;
  const root = $("#learners");
  root.replaceChildren();
  for (const l of v.items.slice(0, 50)) {
    const c = el("article", undefined, "card");
    c.append(
      el("h3", l.display_name),
      el("span", l.state || "unlinked", "pill"),
    );
    c.append(el("div", duration(l.today_ms || 0), "metric"));
    c.lastChild.append(el("small", "Focused time today · UTC"));
    c.append(
      el("p", "Last 7 reporting days: " + duration(l.week_ms || 0)),
      el("p", "Last recorded activity: " + age(l.last_activity_at)),
      el(
        "p",
        "Last reported video: " +
          (l.last_course_title || "—") +
          " / " +
          (l.last_video_title || "—"),
      ),
      el("p", "Server receipt: " + date(l.last_received_at)),
      el("p", "Last sync received: " + date(l.last_sync_at)),
      el("code", "Learner: " + l.learner_id),
      el("p", "Installation: " + (l.installation_id || "none")),
    );
    const a = el("div", undefined, "actions");
    a.append(
      button("View study detail", () => {
        selected = l;
        activityCursor = 0;
        return loadDetail();
      }),
    );
    if (l.installation_id && l.state !== "revoked")
      a.append(
        button("Revoke installation", async () => {
          if (!confirm("Revoke this installation? Existing history remains."))
            return;
          await api("installations/" + l.installation_id + "/revoke", {});
          await loadLearners();
        }),
      );
    c.append(a);
    root.append(c);
  }
  if (!v.items.length)
    root.append(
      el(
        "p",
        "No approved learners yet. Open a short enrollment window to receive expected requests.",
        "empty",
      ),
    );
  paging("#learner-paging", v.items.length > 50, learnerCursor, async (n) => {
    learnerCursor = n;
    await loadLearners();
  });
}
async function loadDetail() {
  if (!selected) return;
  const request = ++detailRequest,
    chosen = selected;
  view("detail");
  $("#detail-title").textContent = selected.display_name;
  const v = await api(
    `learners/${selected.learner_id}/activity?days=${$("#days").value}&cursor=${activityCursor}`,
  );
  if (request !== detailRequest || chosen !== selected) return;
  const r = $("#activity");
  r.replaceChildren();
  r.append(
    table(
      "Daily focused study time",
      ["Day (UTC)", "Course / ID", "Video / ID", "Focused time"],
      v.rollups
        .slice(0, 200)
        .map((x) => [
          x.reporting_day,
          `${x.course_title} / ${x.course_id}`,
          `${x.video_title} / ${x.video_id}`,
          duration(x.focused_ms),
        ]),
    ),
    table(
      "Latest reported playback",
      ["Course / ID", "Video / ID", "Position", "Completed", "Observed"],
      v.progress
        .slice(0, 200)
        .map((x) => [
          `${x.course_title} / ${x.course_id}`,
          `${x.video_title} / ${x.video_id}`,
          `${x.position}s`,
          x.completed ? "Yes" : "No",
          date(x.observed_at),
        ]),
    ),
    table(
      "Timestamped sessions",
      ["Video", "Started", "Ended", "Focused time", "Received"],
      v.sessions
        .slice(0, 200)
        .map((x) => [
          x.video_title,
          date(x.started_at),
          date(x.ended_at),
          duration(x.focused_ms),
          date(x.received_at),
        ]),
    ),
  );
  if (activityCursor)
    r.append(
      button("Previous detail page", () => {
        activityCursor = Math.max(0, activityCursor - 200);
        return loadDetail();
      }),
    );
  if (Math.max(v.rollups.length, v.progress.length, v.sessions.length) > 200)
    r.append(
      button("Next detail page", () => {
        activityCursor += 200;
        return loadDetail();
      }),
    );
}
async function loadEnrollments() {
  const v = await api("enrollments?cursor=" + enrollmentCursor),
    r = $("#pending");
  r.replaceChildren();
  for (const i of v.items.slice(0, 50)) {
    const c = el("article", undefined, "card");
    c.append(
      el("h3", i.display_name),
      el("span", i.state, "pill"),
      el("p", "Requested: " + date(i.requested_at)),
      el("code", i.installation_id),
    );
    const a = el("div", undefined, "actions");
    if (i.state === "pending") {
      a.append(
        button("Approve as new learner", async () => {
          await api("enrollments/" + i.installation_id + "/approve", {});
          await loadEnrollments();
        }),
        button("Reject", async () => {
          await api("enrollments/" + i.installation_id + "/reject", {});
          await loadEnrollments();
        }),
        button("Replace existing installation", async () => {
          const id = prompt(
            "Existing learner ID, after verifying this replacement out of band. This revokes previous installations.",
          );
          if (!id) return;
          if (!/^[a-zA-Z0-9_-]{16,100}$/.test(id))
            throw new Error("Use the exact learner ID");
          if (
            !confirm(
              "Revoke the old installation and link this pending request to the selected learner?",
            )
          )
            return;
          await api("enrollments/" + i.installation_id + "/approve", {
            replaceLearnerId: id,
          });
          await loadEnrollments();
        }),
      );
    }
    c.append(a);
    r.append(c);
  }
  if (!v.items.length)
    r.append(
      el("p", "No enrollment requests. Registration starts closed.", "empty"),
    );
  paging(
    "#enrollment-paging",
    v.items.length > 50,
    enrollmentCursor,
    async (n) => {
      enrollmentCursor = n;
      await loadEnrollments();
    },
  );
}
async function loadHealth() {
  const v = await api("health"),
    c = v.controls;
  ingest = !!c.ingest_enabled;
  $("#kill-switch").textContent = ingest
    ? "Pause ingestion"
    : "Resume ingestion";
  const r = $("#health-info");
  r.replaceChildren();
  r.append(
    table(
      "Application limits and retention",
      ["Measure", "Value"],
      [
        ["Reporting timezone", v.reportingTimezone],
        [
          "Enrollment window",
          c.window_expires_at > Date.now()
            ? date(c.window_expires_at)
            : "Closed",
        ],
        ["Pending requests", `${v.pending.count} / ${c.pending_cap}`],
        ["New registrations today", `${c.registrations} / ${c.daily_budget}`],
        [
          "Accepted events today",
          `${c.accepted_events} / ${c.daily_event_cap}`,
        ],
        [
          "Retention",
          `${v.retention.rawDays} days raw / ${v.retention.rollupDays} days daily / ${v.retention.receiptDays} days receipts`,
        ],
      ],
    ),
    el("p", v.warning),
  );
}
async function refresh() {
  if (currentView === "detail") await loadDetail();
  else if (currentView === "enrollments") await loadEnrollments();
  else if (currentView === "health") await loadHealth();
  else await loadLearners();
}
for (const b of document.querySelectorAll("[data-view]"))
  b.onclick = () =>
    run(async () => {
      view(b.dataset.view);
      await refresh();
    });
$("#refresh").onclick = () => run(refresh);
$("#back").onclick = () => {
  view("overview");
  run(loadLearners);
};
$("#days").onchange = () => {
  activityCursor = 0;
  run(loadDetail);
};
$("#open-window").onclick = () =>
  run(async () => {
    await api("enrollment-window", { minutes: 15 });
    await loadEnrollments();
  });
$("#close-window").onclick = () =>
  run(() => api("enrollment-window", { minutes: 0 }));
$("#kill-switch").onclick = () =>
  run(async () => {
    await api("ingestion", { enabled: !ingest });
    await loadHealth();
  });
run(async () => {
  const r = await fetch("/bootstrap", { cache: "no-store" });
  if (!r.ok) throw new Error("Local dashboard initialization failed");
  const v = await r.json();
  csrf = v.csrf;
  $("#mode").textContent = v.demo
    ? "Synthetic demonstration · no real learner data or network service."
    : "Private dashboard · loopback access only. Never share this local page or its session.";
  await loadLearners();
});
