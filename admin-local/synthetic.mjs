// Entirely fictional fixtures. --demo never constructs or contacts an upstream service.
const learner = "synthetic_learner_0001",
  installation = "synthetic_install_0001";
let windowExpires = 0,
  ingestEnabled = true;
export function demoRequest(url, method, payload) {
  const now = Date.now(),
    day = new Date(now).toISOString().slice(0, 10),
    course = "synthetic-course",
    video = "synthetic-video";
  if (method === "POST") {
    if (url.pathname.endsWith("enrollment-window"))
      windowExpires = payload.minutes ? now + payload.minutes * 60000 : 0;
    if (url.pathname.endsWith("ingestion")) ingestEnabled = payload.enabled;
    return { ok: true };
  }
  if (url.pathname.endsWith("/health"))
    return {
      reportingTimezone: "UTC",
      controls: {
        window_expires_at: windowExpires,
        ingest_enabled: +ingestEnabled,
        pending_cap: 20,
        daily_budget: 50,
        registrations: 0,
        accepted_events: 24,
        daily_event_cap: 6000,
      },
      pending: { count: 0 },
      retention: { rawDays: 30, rollupDays: 365, receiptDays: 90 },
      warning:
        "Synthetic demonstration only. No learner data or network service.",
    };
  if (url.pathname.endsWith("/enrollments")) return { items: [], limit: 50 };
  if (url.pathname.endsWith("/learners"))
    return {
      items: [
        {
          learner_id: learner,
          installation_id: installation,
          display_name: "Alex (synthetic)",
          state: "approved",
          today_ms: 240000,
          last_course_title: "Synthetic mathematics",
          last_video_title: "Introduction to proofs",
          week_ms: 1260000,
          last_activity_at: now - 180000,
          last_received_at: now - 120000,
          last_sync_at: now - 120000,
        },
      ],
      limit: 50,
      reportingTimezone: "UTC",
    };
  return {
    reportingTimezone: "UTC",
    limit: 200,
    rollups: [
      {
        reporting_day: day,
        course_id: course,
        course_title: "Synthetic mathematics",
        video_id: video,
        video_title: "Introduction to proofs",
        focused_ms: 240000,
      },
    ],
    progress: [
      {
        course_id: course,
        course_title: "Synthetic mathematics",
        video_id: video,
        video_title: "Introduction to proofs",
        position: 320,
        completed: 0,
        observed_at: now - 180000,
      },
    ],
    sessions: [
      {
        course_id: course,
        course_title: "Synthetic mathematics",
        video_id: video,
        video_title: "Introduction to proofs",
        focused_ms: 10000,
        started_at: now - 190000,
        ended_at: now - 180000,
        received_at: now - 120000,
      },
    ],
  };
}
