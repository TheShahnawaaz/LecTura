import React, { useEffect, useRef } from "react";
import { PlayerView } from "./PlayerView";
import { Download, CheckCircle2, Loader2, FileVideo, X, Play, Copy, ExternalLink, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useContextMenu } from "../context/ContextMenuContext";
import { open as openBrowser } from "@tauri-apps/api/shell";

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
  onStudyTimeLogged,
}) {
  const activeVideoRef = useRef(null);

  useEffect(() => {
    // Scroll active video card into view when activeVideo.id changes
    if (activeVideoRef.current) {
      activeVideoRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeVideo?.id]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatStudyTime = (secs) => {
    if (!secs || secs <= 0) return "0s";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    if (m > 0) {
      return `${m}m ${s}s`;
    }
    return `${s}s`;
  };

  const { showMenu } = useContextMenu();

  const handleVideoContextMenu = (e, video) => {
    e.preventDefault();
    e.stopPropagation();
    const isDownloaded = video.download_status === "completed" && video.local_path;
    const isDownloading = video.download_status === "downloading" || video.download_status === "pending";
    showMenu(e, [
      {
        icon: Play,
        label: "Play Lecture",
        shortcut: "Enter",
        action: () => handleSelectVideo(video),
      },
      {
        icon: video.is_completed ? Circle : CheckCircle2,
        label: video.is_completed ? "Mark as Incomplete" : "Mark as Complete",
        action: () =>
          handleUpdateProgress(
            video.id,
            video.is_completed ? 0 : video.duration,
            !video.is_completed
          ),
      },
      { type: "separator" },
      {
        icon: Download,
        label: isDownloaded ? "Already Downloaded" : isDownloading ? "Downloading…" : "Download Lecture",
        disabled: isDownloaded || isDownloading,
        action: () => handleDownloadVideo(video),
      },
      {
        icon: X,
        label: "Cancel Download",
        disabled: !isDownloading,
        danger: true,
        action: () => handleCancelVideoDownload(video),
      },
      { type: "separator" },
      {
        icon: Copy,
        label: "Copy Video URL",
        disabled: !video.url,
        action: () => video.url && navigator.clipboard.writeText(video.url),
      },
      {
        icon: ExternalLink,
        label: "Open in Browser",
        disabled: !video.url,
        action: () => video.url && openBrowser(video.url),
      },
    ]);
  };

  // Compute overall course progress
  const completedCount = videos.filter((v) => v.is_completed).length;
  const totalCount = videos.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const totalPlaylistStudyTime = videos.reduce((acc, v) => acc + (v.study_time || 0), 0);

  const isPlaylistDownloading = videos.some(
    (v) => v.download_status === "downloading" || v.download_status === "pending"
  );

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ───── 1. Video player viewport (left, full height) ───── */}
      <div className="flex-grow flex flex-col overflow-y-auto p-5 gap-4">
        {activeVideo ? (
          <PlayerView
            activeVideo={activeVideo}
            videos={videos}
            videoPlayerRef={videoPlayerRef}
            playbackSpeed={playbackSpeed}
            setPlaybackSpeed={setPlaybackSpeed}
            handleUpdateProgress={handleUpdateProgress}
            handleSelectVideo={handleSelectVideo}
            onStudyTimeLogged={onStudyTimeLogged}
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

      {/* ───── 2. Course Index Panel (right, full height) ───── */}
      <div className="w-80 border-l border-border bg-card flex flex-col flex-shrink-0 overflow-hidden transition-colors duration-300">
        {/* Panel header with title, count, and download action */}
        <div className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
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

          {/* Course title */}
          <p className="text-xs font-semibold text-foreground line-clamp-1 mb-2.5">
            {selectedPlaylist.title}
          </p>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="flex flex-col gap-1 mb-3">
              <div className="flex justify-between text-[9px] font-semibold text-muted-foreground">
                <span>{completedCount}/{totalCount} completed</span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-1 bg-muted" />
              {totalPlaylistStudyTime > 0 && (
                <div className="flex items-center gap-1 text-[9px] text-primary font-bold mt-1.5 leading-none select-none">
                  <span>⏱️ Course Studied:</span>
                  <span>{formatStudyTime(totalPlaylistStudyTime)}</span>
                </div>
              )}
            </div>
          )}

          {/* Download / Cancel button */}
          {isPlaylistDownloading ? (
            <button
              onClick={() => handleCancelPlaylistDownload(selectedPlaylist.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors cursor-pointer"
            >
              <X size={13} />
              Cancel Download
            </button>
          ) : (
            <button
              onClick={() => handleDownloadPlaylist(selectedPlaylist.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/80 transition-colors cursor-pointer"
            >
              <Download size={13} />
              Download Playlist
            </button>
          )}
        </div>

        {/* Scrollable video list */}
        <div className="flex-grow overflow-y-auto p-3">
          <div className="flex flex-col gap-2">
            {videos.map((video) => {
              const isSelected = activeVideo?.id === video.id;
              const isDownloaded =
                video.download_status === "completed" && video.local_path;

              return (
                <div
                  key={video.id}
                  ref={isSelected ? activeVideoRef : null}
                  onClick={() => handleSelectVideo(video)}
                  onContextMenu={(e) => handleVideoContextMenu(e, video)}
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateProgress(
                          video.id,
                          video.is_completed ? 0 : video.duration,
                          !video.is_completed
                        );
                      }}
                      className={`flex-shrink-0 mt-0.5 p-0.5 rounded-md hover:bg-muted/80 transition-colors ${
                        video.is_completed
                          ? "text-emerald-500"
                          : "text-muted-foreground/30 hover:text-muted-foreground/60"
                      }`}
                      title={video.is_completed ? "Mark as incomplete" : "Mark as completed"}
                    >
                      {video.is_completed ? (
                        <CheckCircle2 size={14} className="fill-emerald-500/10" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-current" />
                      )}
                    </button>
                  </div>

                  {/* Status metrics row */}
                  <div className="flex justify-between items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-semibold tabular-nums">
                      <span>{formatTime(video.duration)}</span>
                      {video.study_time > 0 && (
                        <>
                          <span className="text-muted-foreground/30">•</span>
                          <span className="text-primary font-bold">
                            ⏱️ {formatStudyTime(video.study_time)}
                          </span>
                        </>
                      )}
                    </div>

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
  );
}

