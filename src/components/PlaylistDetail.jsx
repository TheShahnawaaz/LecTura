import React from "react";
import { PlayerView } from "./PlayerView";
import { Download, CheckCircle2, Loader2, FileVideo, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export function PlaylistDetail({
  selectedPlaylist,
  videos,
  activeVideo,
  videoPlayerRef,
  playbackSpeed,
  setPlaybackSpeed,
  handleUpdateProgress,
  handleDownloadPlaylist,
  handleDownloadVideo,
  handleSelectVideo,
  handleCancelVideoDownload,
  handleCancelPlaylistDownload,
}) {
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Compute overall course progress
  const completedCount = videos.filter((v) => v.is_completed).length;
  const totalCount = videos.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const isPlaylistDownloading = videos.some(
    (v) => v.download_status === "downloading" || v.download_status === "pending"
  );

  return (
    <div className="flex-grow flex flex-col overflow-hidden bg-background h-full">
      {/* ───── 1. Course Metadata Header ───── */}
      <div className="border-b border-border bg-card shadow-sm transition-colors duration-300 shrink-0">
        <div className="p-5 md:px-6 md:py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0 flex-grow">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary border border-primary/20 font-semibold uppercase tracking-wider text-[9px] h-5 rounded-md"
              >
                Course Details
              </Badge>
              {totalCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground font-semibold tracking-wider text-[9px] h-5 rounded-md"
                >
                  Progress: {progressPercent}% ({completedCount}/{totalCount})
                </Badge>
              )}
            </div>
            <h2 className="text-base md:text-lg font-bold text-foreground mt-2.5 leading-tight">
              {selectedPlaylist.title}
            </h2>
            <p className="text-xs text-muted-foreground truncate max-w-[600px] mt-1.5 leading-relaxed">
              {selectedPlaylist.description ||
                "No course description available."}
            </p>

            {/* Course Progress Bar */}
            {totalCount > 0 && (
              <div className="mt-3.5 max-w-md flex items-center gap-2">
                <Progress
                  value={progressPercent}
                  className="h-1.5 bg-muted"
                />
              </div>
            )}
          </div>

          {/* Playlist Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {isPlaylistDownloading ? (
              <button
                onClick={() => handleCancelPlaylistDownload(selectedPlaylist.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors shadow-sm cursor-pointer"
              >
                <X size={14} />
                Cancel Download
              </button>
            ) : (
              <button
                onClick={() => handleDownloadPlaylist(selectedPlaylist.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/80 transition-colors shadow-sm cursor-pointer"
              >
                <Download size={14} />
                Download Playlist
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ───── 2. Split Workspace Layout ───── */}
      <div className="flex-grow flex overflow-hidden">
        {/* Video player viewport (left) */}
        <div className="flex-grow flex flex-col overflow-y-auto p-5 gap-4">
          {activeVideo ? (
            <PlayerView
              activeVideo={activeVideo}
              videoPlayerRef={videoPlayerRef}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              handleUpdateProgress={handleUpdateProgress}
            />
          ) : (
            /* No Active Video placeholder */
            <div className="flex-grow flex flex-col justify-center items-center text-center p-8 bg-muted/20 rounded-xl border border-border h-full min-h-[350px] animate-fade-in transition-colors duration-300">
              <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center mb-4 shadow-inner">
                <FileVideo size={28} className="text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                No lecture selected
              </h3>
              <p className="text-xs text-muted-foreground max-w-[280px] mt-1.5 leading-relaxed">
                Select a lecture from the course queue on the right to
                begin learning.
              </p>
            </div>
          )}
        </div>

        {/* Course playlist video queue (right panel) */}
        <div className="w-80 border-l border-border bg-card flex flex-col flex-shrink-0 overflow-hidden p-4 transition-colors duration-300">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-3 px-1 flex-shrink-0">
            <h3 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Course Index
            </h3>
            <Badge
              variant="outline"
              className="border-border text-foreground bg-muted px-2 py-0.5 rounded-md text-[9px] font-semibold tabular-nums"
            >
              {totalCount} videos
            </Badge>
          </div>

          <div className="flex-grow overflow-y-auto pr-1">
            <div className="flex flex-col gap-2 pb-4">
              {videos.map((video) => {
                const isSelected = activeVideo?.id === video.id;
                const isDownloaded =
                  video.download_status === "completed" && video.local_path;

                return (
                  <div
                    key={video.id}
                    onClick={() => handleSelectVideo(video)}
                    className={`group p-2.5 rounded-lg cursor-pointer flex flex-col gap-2 border transition duration-150 ease-out select-none ${
                      isSelected
                        ? "bg-primary/10 border-primary/40"
                        : "bg-muted/30 border-border hover:bg-muted/60 hover:border-border/80"
                    }`}
                  >
                    {/* Lecture Title */}
                    <div className="flex justify-between items-start gap-2.5">
                      <span
                        className={`text-xs font-medium line-clamp-2 leading-relaxed flex-grow transition duration-150 ${
                          isSelected
                            ? "text-primary font-semibold"
                            : "text-foreground"
                        }`}
                      >
                        {video.title}
                      </span>
                      {video.is_completed && (
                        <CheckCircle2
                          size={13}
                          className="text-emerald-500 flex-shrink-0 mt-0.5"
                        />
                      )}
                    </div>

                    {/* Status metrics row */}
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-[9px] text-muted-foreground font-semibold tabular-nums">
                        {formatTime(video.duration)}
                      </span>

                      <div
                        className="flex items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isDownloaded ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] py-0.5 rounded-md flex items-center gap-1"
                          >
                            <CheckCircle2 size={9} /> Offline
                          </Badge>
                        ) : video.download_status === "downloading" ? (
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[9px] text-primary font-bold flex items-center gap-1 leading-none">
                                <Loader2
                                  size={10}
                                  className="animate-spin"
                                />{" "}
                                {video.download_progress}%
                              </span>
                              <Progress
                                value={video.download_progress}
                                className="w-16 h-[3px] bg-muted"
                              />
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelVideoDownload(video);
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                              title="Cancel download"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : video.download_status === "pending" ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] py-0.5 rounded-md flex items-center gap-1"
                            >
                              <Loader2
                                size={9}
                                className="animate-spin"
                              />{" "}
                              Pending
                            </Badge>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelVideoDownload(video);
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                              title="Cancel download"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDownloadVideo(video)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors"
                          >
                            <Download size={9} /> Download
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
