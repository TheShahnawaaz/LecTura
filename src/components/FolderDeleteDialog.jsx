import React, { useState } from "react";
import { Trash2, FolderOutput, AlertTriangle, HardDrive, X } from "lucide-react";

/**
 * Two-step folder deletion dialog.
 *
 * Step 1 – "What to do with contents?"
 *   A) Move contents to root, then delete folder
 *   B) Delete folder + all contents → proceeds to Step 2
 *
 * Step 2 – "Also delete downloaded files from disk?"
 *   Yes → delete_folder_cascade(deleteAssets: true)
 *   No  → delete_folder_cascade(deleteAssets: false)
 */
export function FolderDeleteDialog({ folder, onMoveToRoot, onCascade, onClose }) {
  const [step, setStep] = useState(1); // 1 | 2

  if (!folder) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.60)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center flex-shrink-0">
              <Trash2 size={16} className="text-destructive" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Delete Folder
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                "{folder.name}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Step 1: Choose what to do with contents ── */}
        {step === 1 && (
          <div className="p-5 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This folder may contain subfolders and courses. What would you
              like to do with its contents?
            </p>

            {/* Option A — Move to root */}
            <button
              onClick={() => {
                onMoveToRoot(folder.id);
                onClose();
              }}
              className="w-full flex items-start gap-3 p-3.5 rounded-xl border border-border hover:bg-muted/40 hover:border-border/80 transition-all duration-150 text-left cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FolderOutput size={15} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  Move contents to root & delete folder
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                  All subfolders and courses move to your library root.
                  Nothing is deleted from disk.
                </p>
              </div>
            </button>

            {/* Option B — Delete everything */}
            <button
              onClick={() => setStep(2)}
              className="w-full flex items-start gap-3 p-3.5 rounded-xl border border-destructive/20 hover:bg-destructive/5 hover:border-destructive/40 transition-all duration-150 text-left cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Trash2 size={15} className="text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-destructive">
                  Delete folder and all contents
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                  Permanently removes all subfolders, courses, and lecture
                  records. You'll be asked about downloaded files next.
                </p>
              </div>
            </button>

            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 cursor-pointer text-center w-full"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Step 2: Also delete files from disk? ── */}
        {step === 2 && (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                This will permanently delete the folder, all its courses, and all
                lecture records. This action cannot be undone.
              </p>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Do you also want to delete the <strong className="text-foreground">downloaded video files</strong> from
              your disk?
            </p>

            <div className="flex flex-col gap-2">
              {/* Delete with files */}
              <button
                onClick={() => {
                  onCascade(folder.id, true);
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/50 transition-all duration-150 cursor-pointer group text-left"
              >
                <HardDrive size={14} className="text-destructive flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-destructive">
                    Delete everything — including files on disk
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Downloaded videos will be permanently removed
                  </p>
                </div>
              </button>

              {/* Delete records only */}
              <button
                onClick={() => {
                  onCascade(folder.id, false);
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-all duration-150 cursor-pointer group text-left"
              >
                <Trash2 size={14} className="text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Delete records only — keep files on disk
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Downloaded videos remain; only library data is removed
                  </p>
                </div>
              </button>
            </div>

            <button
              onClick={() => setStep(1)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-center w-full"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
