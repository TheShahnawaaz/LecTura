import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
export function StudySharingNotice() {
  const [status, setStatus] = useState(null),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [details, setDetails] = useState(false);
  const inFlight = useRef(false),
    refreshSequence = useRef(0),
    mounted = useRef(true);
  const refresh = () => {
    const request = ++refreshSequence.current;
    return invoke("study_sync_status")
      .then((value) => {
        if (mounted.current && request === refreshSequence.current)
          setStatus(value);
      })
      .catch(() => {
        if (mounted.current)
          setError(
            "Study sharing status is unavailable. Study remains saved locally.",
          );
      });
  };
  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  const run = async (fn) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await invoke("study_sync_wake");
      await refresh();
    } catch {
      setError(
        "Could not save sharing preferences. Try again; your study stays on this laptop.",
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  if (!status)
    return (
      <div className="px-4 py-2 text-xs" role="status">
        {error || "Loading study sharing status…"}
      </div>
    );
  const description = (
    <>
      <p>
        Study sharing is on by default. {status.recipient} receives your name,
        course and video IDs and titles, focused study time, playback progress
        and sync times, after approving this laptop.
      </p>
      <p>
        Notes, screenshots, files and local paths stay here. Earlier study
        history is never uploaded automatically. Reports use UTC. You can pause
        sharing at any time; this clears unsent copies, while shared history
        remains until administrator deletion or retention.
      </p>
    </>
  );
  if (status.needsName)
    return (
      <section
        aria-label="Study sharing introduction"
        className="px-5 py-4 border-b border-border bg-card text-sm space-y-2"
      >
        <strong>Welcome to LecTura</strong>
        <div className="text-xs text-muted-foreground space-y-1 max-w-4xl">
          {description}
        </div>
        {!status.configured && (
          <p className="text-xs">
            This build has no configured sharing service. No enrollment or
            upload can occur.
          </p>
        )}
        <form
          className="flex flex-wrap gap-2 items-center"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              invoke("study_sync_set_name", {
                displayName: name.trim(),
                sharingEnabled: true,
              }),
            );
          }}
        >
          <label className="text-xs" htmlFor="study-display-name">
            Your name
          </label>
          <input
            className="border border-border rounded-md px-3 py-1 bg-background"
            id="study-display-name"
            maxLength={80}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <button
            className="border border-border rounded-md px-3 py-1"
            disabled={busy || !name.trim()}
            type="submit"
          >
            Continue
          </button>
          <button
            className="border border-border rounded-md px-3 py-1"
            disabled={busy || !name.trim()}
            type="button"
            onClick={() =>
              run(() =>
                invoke("study_sync_set_name", {
                  displayName: name.trim(),
                  sharingEnabled: false,
                }),
              )
            }
          >
            Pause sharing and continue
          </button>
        </form>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </section>
    );
  const label = !status.sharingEnabled
    ? "Sharing paused"
    : !status.configured
      ? "Sharing on · service not configured"
      : status.enrollmentState === "approved"
        ? status.pending
          ? `${status.pending} pending`
          : status.lastSuccessAt
            ? "Synced"
            : "Sharing ready"
        : {
            new: "Waiting for registration window",
            pending: "Waiting for administrator approval",
            revoked: "Sharing revoked",
            rejected: "Enrollment rejected",
            auth_error: "Sharing needs administrator attention",
          }[status.enrollmentState] || "Sharing on";
  return (
    <section
      className="px-4 py-2 border-b border-border bg-card text-xs"
      aria-label="Study sharing status"
    >
      <div className="flex flex-wrap gap-3 items-center">
        <span role="status">
          {label}
          {status.safeError
            ? ` · ${status.safeError.replaceAll("_", " ")}`
            : ""}
          {status.blocked ? ` · ${status.blocked} blocked` : ""}
        </span>
        <button
          className="underline"
          type="button"
          onClick={() => setDetails(!details)}
          aria-expanded={details}
        >
          Sharing details
        </button>
        <button
          className="underline"
          type="button"
          disabled={
            busy ||
            (!status.sharingEnabled &&
              ["revoked", "rejected", "auth_error"].includes(
                status.enrollmentState,
              ))
          }
          onClick={() =>
            run(() =>
              invoke("study_sync_set_enabled", {
                enabled: !status.sharingEnabled,
              }),
            )
          }
        >
          {status.sharingEnabled ? "Pause sharing" : "Resume sharing"}
        </button>
        <span className="text-muted-foreground">
          Last successful sync:{" "}
          {status.lastSuccessAt
            ? new Date(status.lastSuccessAt).toLocaleString()
            : "never"}
        </span>
      </div>
      {details && (
        <div className="mt-2 space-y-1 text-muted-foreground max-w-4xl">
          {description}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
