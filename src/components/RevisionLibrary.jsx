import React, { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookmarkModal } from "./BookmarkModal";
import { BookmarkCard } from "./BookmarkCard";
import { 
  Bookmark, 
  HelpCircle, 
  Search, 
  Clock, 
  Play, 
  Trash2, 
  Maximize2,
  Calendar,
  Sparkles,
  Layers,
  BookOpen,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Edit3
} from "lucide-react";

export default function RevisionLibrary({
  onPlayBookmarkVideo, // (playlistId, videoId, timestamp) => void
  initialCategoryFilter = "all",
}) {
  const [globalBookmarks, setGlobalBookmarks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(initialCategoryFilter); // "all", "bookmarks", "doubts"
  const [courseFilter, setCourseFilter] = useState("all"); // "all" or playlistId
  const [isLoading, setIsLoading] = useState(true);

  // Sync categoryFilter if initialCategoryFilter prop changes
  React.useEffect(() => {
    setCategoryFilter(initialCategoryFilter);
  }, [initialCategoryFilter]);

  // Expanded View Modal
  const [expandedBookmark, setExpandedBookmark] = useState(null);

  // Editing states via drawing canvas
  const [editingBookmark, setEditingBookmark] = useState(null);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);

  const handleUpdateBookmarkFromCanvas = async (label, notes, finalScreenshotDataUrl, isDoubtFlag) => {
    if (!editingBookmark) return;
    try {
      let savedPath = editingBookmark.screenshot_path;
      if (finalScreenshotDataUrl && finalScreenshotDataUrl.startsWith("data:")) {
        // Save drawing onto disk inside app data screenshots directory
        savedPath = await invoke("save_screenshot", {
          videoId: editingBookmark.video_id,
          timestamp: editingBookmark.timestamp,
          base64Data: finalScreenshotDataUrl,
        });
      }

      await invoke("update_bookmark", {
        id: editingBookmark.id,
        label: label.trim(),
        notes: notes.trim() || null,
        isDoubt: isDoubtFlag,
        screenshotPath: savedPath || null,
      });

      // Refetch bookmarks to render inside grid list
      fetchGlobalBookmarks();
      setEditingBookmark(null);
    } catch (err) {
      console.error("Failed to update bookmark from canvas:", err);
      alert(`Error updating doubt/bookmark: ${err}`);
    }
  };

  const fetchGlobalBookmarks = async () => {
    setIsLoading(true);
    try {
      const data = await invoke("get_all_bookmarks");
      setGlobalBookmarks(data || []);
    } catch (err) {
      console.error("Failed to fetch all bookmarks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalBookmarks();
  }, []);

  const handleDeleteBookmark = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this doubt/bookmark?")) return;
    try {
      await invoke("delete_bookmark", { id });
      setGlobalBookmarks((prev) => prev.filter((gb) => gb.bookmark.id !== id));
      if (expandedBookmark && expandedBookmark.bookmark.id === id) {
        setExpandedBookmark(null);
      }
    } catch (err) {
      console.error("Failed to delete bookmark:", err);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Get unique courses for filter dropdown
  const uniqueCourses = Array.from(
    new Map(
      globalBookmarks.map((gb) => [gb.playlist_id, gb.playlist_title])
    ).entries()
  );

  // Filtered Bookmarks list
  const filteredBookmarks = globalBookmarks.filter((gb) => {
    const matchesSearch =
      gb.bookmark.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gb.bookmark.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gb.video_title?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" ||
      (categoryFilter === "doubts" && gb.bookmark.is_doubt) ||
      (categoryFilter === "bookmarks" && !gb.bookmark.is_doubt);

    const matchesCourse = courseFilter === "all" || gb.playlist_id === courseFilter;

    return matchesSearch && matchesCategory && matchesCourse;
  });

  const currentBookmarkIndex = expandedBookmark
    ? filteredBookmarks.findIndex((gb) => gb.bookmark.id === expandedBookmark.bookmark.id)
    : -1;
  const hasPrevBookmark = currentBookmarkIndex > 0;
  const hasNextBookmark = currentBookmarkIndex !== -1 && currentBookmarkIndex < filteredBookmarks.length - 1;

  const handlePrevBookmark = () => {
    if (hasPrevBookmark) {
      setExpandedBookmark(filteredBookmarks[currentBookmarkIndex - 1]);
    }
  };

  const handleNextBookmark = () => {
    if (hasNextBookmark) {
      setExpandedBookmark(filteredBookmarks[currentBookmarkIndex + 1]);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!expandedBookmark) return;

      // Ignore if typing in text input fields or select dropdowns
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevBookmark();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextBookmark();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedBookmark, filteredBookmarks, currentBookmarkIndex, hasPrevBookmark, hasNextBookmark]);

  return (
    <div className="h-full w-full overflow-y-auto bg-background flex flex-col select-none animate-fade-in">
      
      {/* Search and Filters Header */}
      <div className="border-b border-border bg-card shadow-sm px-6 py-5 flex-shrink-0 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div>
            <Badge
              variant="secondary"
              className="bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider text-[8px] h-5 rounded-md"
            >
              Revision Hub
            </Badge>
            <h2 className="text-base font-extrabold text-foreground mt-2 leading-tight flex items-center gap-1.5">
              <BookOpen size={18} className="text-primary flex-shrink-0" />
              My Doubts & Revision Library
            </h2>
            <p className="text-[10px] text-muted-foreground font-medium mt-1">
              Revise notes, draw-overs, and questions across all your lectures
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4 shrink-0 font-semibold text-[10px] text-muted-foreground">
            <div className="flex flex-col bg-muted/40 border border-border px-3 py-1.5 rounded-lg text-center min-w-[70px]">
              <span className="text-foreground text-xs font-bold tabular-nums">
                {globalBookmarks.filter(b => b.bookmark.is_doubt).length}
              </span>
              <span>Doubts ❓</span>
            </div>
            <div className="flex flex-col bg-muted/40 border border-border px-3 py-1.5 rounded-lg text-center min-w-[70px]">
              <span className="text-foreground text-xs font-bold tabular-nums">
                {globalBookmarks.filter(b => !b.bookmark.is_doubt).length}
              </span>
              <span>Bookmarks 🔖</span>
            </div>
          </div>
        </div>

        {/* Filter controls row */}
        <div className="flex flex-col md:flex-row gap-3 mt-5 max-w-7xl mx-auto w-full">
          {/* Keyword Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by topic, notes, or video..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-border text-xs text-foreground focus:ring-primary focus-visible:ring-primary h-9"
            />
          </div>

          {/* Category Pills */}
          <div className="flex bg-muted/40 p-1 rounded-lg border border-border shrink-0 select-none">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                categoryFilter === "all"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setCategoryFilter("bookmarks")}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                categoryFilter === "bookmarks"
                  ? "bg-card text-primary font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Bookmarks Only
            </button>
            <button
              onClick={() => setCategoryFilter("doubts")}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                categoryFilter === "doubts"
                  ? "bg-card text-destructive font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Doubts Only
            </button>
          </div>

          {/* Course filter select */}
          <div className="relative shrink-0 flex items-center bg-card px-3 py-1 rounded-lg border border-border h-9 select-none">
            <Layers size={13} className="text-primary mr-1.5 shrink-0" />
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer outline-none border-none pr-1.5 font-semibold"
            >
              <option value="all" className="bg-card text-foreground">All Courses</option>
              {uniqueCourses.map(([id, title]) => (
                <option key={id} value={id} className="bg-card text-foreground">{title}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-grow p-6 max-w-7xl w-full mx-auto">
        {isLoading ? (
          <div className="flex justify-center items-center py-20 text-muted-foreground text-xs font-semibold">
            Loading your revision library...
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="flex flex-col justify-center items-center text-center py-16 border border-dashed border-border rounded-2xl bg-card/25 animate-fade-in select-text">
            <XCircle size={32} className="text-muted-foreground/45 mb-3" />
            <h3 className="text-xs font-bold text-foreground">No revision items found</h3>
            <p className="text-[10px] text-muted-foreground max-w-[280px] mt-1.5 leading-relaxed">
              {searchQuery || courseFilter !== "all" || categoryFilter !== "all"
                ? "Try clearing your filters or search keywords to view other revision bookmarks."
                : "While learning inside a lecture, capture screenshots and save doubt details to populate this list."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredBookmarks.map((gb) => (
              <BookmarkCard
                key={gb.bookmark.id}
                bookmark={gb.bookmark}
                playlistTitle={gb.playlist_title}
                videoTitle={gb.video_title}
                onPlay={() => onPlayBookmarkVideo(gb.playlist_id, gb.bookmark.video_id, gb.bookmark.timestamp)}
                onEdit={() => {
                  setEditingBookmark(gb.bookmark);
                  setIsBookmarkModalOpen(true);
                }}
                onDelete={() => handleDeleteBookmark(gb.bookmark.id)}
                onClick={() => setExpandedBookmark(gb)}
                defaultVideoId={gb.bookmark.video_id}
              />
            ))}
          </div>
        )}
      </div>

      {/* ───── FULL-RESOLUTION EXPANDED VIEW DIALOG ───── */}
      {expandedBookmark && (
        <Dialog open={!!expandedBookmark} onOpenChange={(open) => !open && setExpandedBookmark(null)}>
          <DialogContent className="bg-card border-border text-foreground max-w-[95vw] w-full md:max-w-[95vw] lg:max-w-7xl xl:max-w-[92vw] 2xl:max-w-[90vw] p-5 flex flex-col gap-4 max-h-[95vh] overflow-hidden select-text">
            
            <DialogHeader className="pb-2 border-b border-border flex-shrink-0 flex flex-row items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-sm font-semibold tracking-wide uppercase flex items-center gap-1.5">
                  <Sparkles size={14} className="text-primary" />
                  {expandedBookmark.bookmark.label || "Revision Bookmark"}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs mt-0.5">
                  Lecture: <strong>{expandedBookmark.video_title}</strong> @ {formatTime(expandedBookmark.bookmark.timestamp)} • Course: {expandedBookmark.playlist_title}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant={expandedBookmark.bookmark.is_doubt ? "destructive" : "secondary"}>
                  {expandedBookmark.bookmark.is_doubt ? "Doubt ❓" : "Bookmark 🔖"}
                </Badge>
              </div>
            </DialogHeader>

            <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-5">
              {/* Full-res screenshot viewer with carousel navigation */}
              <div className="flex-grow min-h-0 bg-zinc-950 border border-border/80 rounded-xl overflow-hidden flex items-center justify-center relative aspect-video select-none group/carousel">
                <img
                  src={
                    expandedBookmark.bookmark.screenshot_path 
                      ? convertFileSrc(expandedBookmark.bookmark.screenshot_path)
                      : `https://img.youtube.com/vi/${expandedBookmark.bookmark.video_id}/maxresdefault.jpg`
                  }
                  alt={expandedBookmark.bookmark.label || "Screenshot"}
                  className="w-full h-full object-contain max-h-[70vh]"
                />
                
                {/* Carousel Left Arrow */}
                {hasPrevBookmark && (
                  <button
                    onClick={handlePrevBookmark}
                    className="absolute left-3.5 p-2 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/10 shadow hover:scale-105 transition duration-150 cursor-pointer z-10"
                    title="Previous Note"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}

                {/* Carousel Right Arrow */}
                {hasNextBookmark && (
                  <button
                    onClick={handleNextBookmark}
                    className="absolute right-3.5 p-2 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/10 shadow hover:scale-105 transition duration-150 cursor-pointer z-10"
                    title="Next Note"
                  >
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>

              {/* Text Description / Details Panel */}
              <div className="w-full md:w-80 flex flex-col gap-4 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-5 flex-shrink-0 max-h-[60vh] md:max-h-none overflow-y-auto">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground font-bold">Notes / Discussion Detail</span>
                  {expandedBookmark.bookmark.notes ? (
                    <div className="text-xs text-foreground/90 font-medium bg-muted/30 border border-border rounded-xl p-3.5 leading-relaxed whitespace-pre-wrap">
                      {expandedBookmark.bookmark.notes}
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">No description notes written.</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-border/40 select-none">
                  <Button
                    size="sm"
                    className="h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/80 flex items-center justify-center gap-1.5"
                    onClick={() => {
                      const gb = expandedBookmark;
                      setExpandedBookmark(null);
                      onPlayBookmarkVideo(gb.playlist_id, gb.bookmark.video_id, gb.bookmark.timestamp);
                    }}
                  >
                    <Play size={13} fill="currentColor" />
                    Jump to Lecture
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 text-xs border-border hover:bg-muted text-muted-foreground"
                      onClick={() => {
                        setEditingBookmark(expandedBookmark.bookmark);
                        setExpandedBookmark(null);
                        setIsBookmarkModalOpen(true);
                      }}
                    >
                      Edit Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 text-xs border-border hover:bg-muted text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteBookmark(expandedBookmark.bookmark.id, e)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>

          </DialogContent>
        </Dialog>
      )}

      {/* ───── Bookmark Editing Modal drawing editor ───── */}
      <BookmarkModal
        isOpen={isBookmarkModalOpen}
        onClose={() => {
          setIsBookmarkModalOpen(false);
          setEditingBookmark(null);
        }}
        screenshotUrl={
          editingBookmark
            ? (editingBookmark.screenshot_path 
                ? convertFileSrc(editingBookmark.screenshot_path)
                : `https://img.youtube.com/vi/${editingBookmark.video_id}/maxresdefault.jpg`)
            : null
        }
        videoId={editingBookmark ? editingBookmark.video_id : ""}
        timestamp={editingBookmark ? editingBookmark.timestamp : 0}
        videoTitle={editingBookmark ? (globalBookmarks.find(b => b.bookmark.id === editingBookmark.id)?.video_title || "Lecture") : ""}
        initialLabel={editingBookmark ? editingBookmark.label : ""}
        initialNotes={editingBookmark ? editingBookmark.notes : ""}
        initialIsDoubt={editingBookmark ? !!editingBookmark.is_doubt : false}
        onSave={handleUpdateBookmarkFromCanvas}
      />

    </div>
  );
}
