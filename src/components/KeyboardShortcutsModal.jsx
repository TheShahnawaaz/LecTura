import React, { useEffect } from "react";
import { X, Keyboard } from "lucide-react";

// Detect OS once
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";
const ALT = isMac ? "⌥" : "Alt";

// ─── Shortcut Data ──────────────────────────────────────────────────
const SECTIONS = [
  {
    title: "Global",
    icon: "🌐",
    shortcuts: [
      { keys: [MOD, "K"], label: "Search Library" },
      { keys: [MOD, "+"], label: "Zoom In" },
      { keys: [MOD, "−"], label: "Zoom Out" },
      { keys: [MOD, "0"], label: "Reset Zoom" },
      { keys: ["?"], label: "Show / Hide Shortcuts" },
    ],
  },
  {
    title: "Player · Playback",
    icon: "▶",
    shortcuts: [
      { keys: ["Space", "K"], label: "Play / Pause" },
      { keys: ["→"], label: "Seek Forward 5s" },
      { keys: ["←"], label: "Seek Backward 5s" },
      { keys: ["L"], label: "Skip Forward 10s" },
      { keys: ["J"], label: "Skip Backward 10s" },
      { keys: ["0 – 9"], label: "Jump to 0% – 90%" },
    ],
  },
  {
    title: "Player · Navigation",
    icon: "🔀",
    shortcuts: [
      { keys: ["N"], label: "Next Lecture" },
      { keys: ["P"], label: "Previous Lecture" },
      { keys: ["F"], label: "Toggle Fullscreen" },
      { keys: ["Esc"], label: "Exit Fullscreen" },
    ],
  },
  {
    title: "Player · Audio & Speed",
    icon: "🎚",
    shortcuts: [
      { keys: ["D"], label: "Speed Up (+0.1×)" },
      { keys: ["S"], label: "Slow Down (−0.1×)" },
      { keys: ["↑"], label: "Volume Up" },
      { keys: ["↓"], label: "Volume Down" },
      { keys: ["M"], label: "Toggle Mute" },
    ],
  },
];

// ─── Key badge ──────────────────────────────────────────────────────
function KeyBadge({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md bg-muted border border-border text-[10px] font-bold font-mono text-foreground shadow-[inset_0_-1.5px_0_0] shadow-border leading-none select-none">
      {children}
    </kbd>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────
export function KeyboardShortcutsModal({ open, onClose }) {
  // Close on Escape or ? (toggling open/close is done by parent)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Keyboard size={14} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Keyboard Shortcuts
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {isMac ? "macOS" : "Windows / Linux"} shortcuts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-6 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col gap-2">
                {/* Section title */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base leading-none">{section.icon}</span>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                    {section.title}
                  </span>
                </div>

                {/* Shortcut rows */}
                <div className="flex flex-col gap-1.5 bg-muted/30 rounded-xl border border-border p-3">
                  {section.shortcuts.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-4 py-0.5"
                    >
                      <span className="text-[11px] text-foreground/80 font-medium leading-snug">
                        {s.label}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, ki) => (
                          <React.Fragment key={ki}>
                            {ki > 0 && (
                              <span className="text-[9px] text-muted-foreground/50 font-medium">
                                /
                              </span>
                            )}
                            <KeyBadge>{k}</KeyBadge>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer tip */}
          <p className="text-center text-[10px] text-muted-foreground/50 pb-1">
            Press{" "}
            <KeyBadge>?</KeyBadge>{" "}
            anywhere to open this panel &nbsp;·&nbsp; Player shortcuts only work when no input is focused
          </p>
        </div>
      </div>
    </div>
  );
}
