import React from "react";
import { Trash2, X, AlertTriangle } from "lucide-react";

/**
 * Single-step playlist deletion confirmation.
 * Always deletes downloaded assets — this matches the user's spec
 * ("when deleting a playlist it should also delete the assets by default").
 */
export function PlaylistDeleteDialog({ playlist, onConfirm, onClose }) {
  if (!playlist) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.60)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in"
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
                Delete Course
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug truncate max-w-[200px]">
                "{playlist.title}"
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

        <div className="p-5 flex flex-col gap-4">
          {/* Warning */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive/5 border border-destructive/15">
            <AlertTriangle size={13} className="text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-destructive/80 leading-relaxed">
              This will permanently delete the course, all its lecture records,
              and any <strong>downloaded video files</strong> from your disk.
              This action cannot be undone.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 px-3 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm(playlist.id);
                onClose();
              }}
              className="flex-1 py-2 px-3 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 active:scale-[0.98] transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 size={12} />
              Delete Course
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
