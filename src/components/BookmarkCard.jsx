import React from "react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, Play, Edit3, Trash2 } from "lucide-react";
import { useContextMenu } from "../context/ContextMenuContext";

const formatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatDate = (dateStr) => {
  try {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return dateStr;
  }
};

export function BookmarkCard({
  bookmark,
  playlistTitle,
  videoTitle,
  onPlay,
  onEdit,
  onDelete,
  onClick,
  defaultVideoId,
}) {
  const { showMenu } = useContextMenu();
  const b = bookmark;
  const imageSrc = b.screenshot_path 
    ? convertFileSrc(b.screenshot_path)
    : `https://img.youtube.com/vi/${b.video_id || defaultVideoId}/mqdefault.jpg`;

  const isDoubt = !!(b.bookmark?.is_doubt || b.is_doubt);

  const handleContextMenu = (e) => {
    showMenu(e, [
      {
        icon: Play,
        label: "Play Lecture",
        action: () => onPlay(),
      },
      {
        icon: Edit3,
        label: "Edit Details",
        action: () => onEdit(),
      },
      {
        type: "separator",
      },
      {
        icon: Trash2,
        label: "Delete note",
        danger: true,
        action: () => onDelete(),
      },
    ]);
  };

  return (
    <div 
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className="group relative aspect-video w-full rounded-xl overflow-hidden shadow-md border border-border/60 hover:border-primary/50 transition-all duration-300 hover:scale-[1.01] hover:shadow-lg cursor-pointer bg-zinc-950 flex-shrink-0"
    >
      {/* Image Preview Background */}
      <img 
        src={imageSrc} 
        alt={b.label || "Screenshot"}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      
      {/* Dark Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/15 group-hover:via-black/55 transition-all duration-300" />
      
      {/* Overlay Content */}
      <div className="absolute inset-0 p-3.5 flex flex-col justify-between select-none text-white z-10">
        {/* Top Row: Type Badge & Timestamp */}
        <div className="flex items-center justify-between">
          <Badge 
            variant={isDoubt ? "destructive" : "secondary"}
            className={`font-extrabold text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded shadow select-none ${
              isDoubt 
                ? "bg-red-500/90 hover:bg-red-500 text-white border-none" 
                : "bg-blue-600/90 hover:bg-blue-600 text-white border-none"
            }`}
          >
            {isDoubt ? "Doubt ❓" : "Note 🔖"}
          </Badge>
          
          <Badge className="bg-black/60 backdrop-blur-sm border border-white/10 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow tabular-nums select-none flex items-center gap-0.5">
            <Clock size={11} />
            {formatTime(b.timestamp)}
          </Badge>
        </div>

        {/* Bottom Info & Actions */}
        <div className="flex flex-col gap-0.5 min-w-0">
          {/* Course subtitle */}
          {playlistTitle && (
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-blue-300 truncate block drop-shadow-md">
              {playlistTitle}
            </span>
          )}
          
          {/* Note Title */}
          <h4 className="text-xs font-bold text-white leading-snug drop-shadow-md line-clamp-1">
            {b.label || "Revision Note"}
          </h4>

          {/* Video subtitle */}
          {videoTitle && (
            <p className="text-[9px] text-zinc-300 font-semibold truncate leading-none flex items-center gap-1 drop-shadow-md">
              <span>Lecture:</span>
              <span className="text-white">{videoTitle}</span>
            </p>
          )}
          
          {/* Note Description snippet */}
          {b.notes ? (
            <p className="text-[9.5px] text-zinc-200 line-clamp-2 leading-relaxed bg-black/30 backdrop-blur-[2px] p-1.5 rounded border border-white/5 font-medium select-text">
              {b.notes}
            </p>
          ) : (
            <p className="text-[9px] italic text-zinc-400">No description text.</p>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between border-t border-white/10 pt-1.5 mt-1 text-[9px] text-zinc-300/85 font-semibold" onClick={(e) => e.stopPropagation()}>
            <span className="flex items-center gap-1 text-[8.5px]">
              <Calendar size={11} />
              {formatDate(b.created_at)}
            </span>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay();
                }}
                className="bg-white/10 hover:bg-white/20 text-white p-1 rounded transition-all hover:scale-105 border border-white/10 flex items-center gap-1 cursor-pointer font-bold px-2 py-0.5 text-[9px]"
                title="Play Lecture"
              >
                <Play size={11} fill="currentColor" />
                Play
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded transition-all hover:scale-105 border border-white/10 cursor-pointer"
                title="Edit Details"
              >
                <Edit3 size={11} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="bg-white/10 hover:bg-red-500/20 hover:text-red-300 text-white p-1.5 rounded transition-all hover:scale-105 border border-white/10 hover:border-red-500/30 cursor-pointer"
                title="Delete note"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
