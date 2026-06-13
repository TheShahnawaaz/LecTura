import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Folder, 
  Plus, 
  Trash2, 
  ArrowLeft, 
  Clock, 
  Download, 
  CheckCircle2, 
  Library, 
  ChevronRight,
  FolderPlus,
  Play,
  Copy,
  ExternalLink,
  FolderOpen,
  Smile,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useContextMenu } from "../context/ContextMenuContext";
import { open as openBrowser } from "@tauri-apps/api/shell";
import StudyDashboard from "./StudyDashboard";

export function FolderExplorer({
  folders,
  playlists,
  selectedFolderId,
  libraryStats,
  handleSelectFolder,
  handleSelectPlaylist,
  handleDeleteFolderWithDialog,
  handleDeletePlaylistWithAssets,
  openNewSubfolderModal,
  openImportModal,
  onSelectFolderEmoji,
  studyStats,
  dailyStudyGoal,
  fetchStudyStats,
}) {
  
  // Fetch stats on mount / folder changes
  useEffect(() => {
    if (!selectedFolderId && fetchStudyStats) {
      fetchStudyStats();
    }
  }, [selectedFolderId, fetchStudyStats]);

  // Format seconds to hours and minutes
  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return "0m";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m`;
  };

  // Recursively calculate stats for any folder
  const getFolderStats = (folderId) => {
    let totalPlaylists = 0;
    let totalVideos = 0;
    let completedVideos = 0;
    let totalDuration = 0;
    let totalWatched = 0;
    let downloadedVideos = 0;
    let completedDuration = 0;
    let directSubfoldersCount = 0;

    const recurse = (fId) => {
      // Direct playlists in this folder level
      const fPlaylists = playlists.filter((p) => p.folder_id === fId);
      totalPlaylists += fPlaylists.length;
      for (const p of fPlaylists) {
        const stats = libraryStats.find((s) => s.playlist_id === p.id);
        if (stats) {
          totalVideos += stats.total_videos;
          completedVideos += stats.completed_videos;
          totalDuration += stats.total_duration;
          totalWatched += stats.total_watched;
          downloadedVideos += stats.downloaded_videos;
          completedDuration += stats.completed_duration || 0;
        }
      }

      // Child subfolders nested in this folder
      const subFolders = folders.filter((f) => f.parent_id === fId);
      if (fId === folderId) {
        directSubfoldersCount = subFolders.length;
      }
      for (const sf of subFolders) {
        recurse(sf.id);
      }
    };

    recurse(folderId);

    return {
      totalPlaylists,
      totalVideos,
      completedVideos,
      totalDuration,
      completedDuration,
      totalWatched,
      downloadedVideos,
      directSubfoldersCount,
      progress: totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0,
    };
  };

  // Get current active folder object
  const currentFolder = folders.find((f) => f.id === selectedFolderId);

  // Filter content for the current level
  const currentLevelFolders = folders.filter(
    (f) => f.parent_id === selectedFolderId
  );
  const currentLevelPlaylists = playlists.filter(
    (p) => p.folder_id === selectedFolderId
  );

  // Find parent folder ID for navigation
  const parentFolderId = currentFolder ? currentFolder.parent_id : null;

  // Calculate current folder statistics
  const currentStats = selectedFolderId 
    ? getFolderStats(selectedFolderId)
    : (() => {
        let totalPlaylists = playlists.length;
        let totalVideos = 0;
        let completedVideos = 0;
        let totalDuration = 0;
        let completedDuration = 0;
        let downloadedVideos = 0;
        libraryStats.forEach((stats) => {
          totalVideos += stats.total_videos;
          completedVideos += stats.completed_videos;
          totalDuration += stats.total_duration;
          completedDuration += stats.completed_duration || 0;
          downloadedVideos += stats.downloaded_videos;
        });
        return {
          totalPlaylists,
          totalVideos,
          completedVideos,
          totalDuration,
          completedDuration,
          downloadedVideos,
          directSubfoldersCount: folders.filter(f => !f.parent_id).length,
          progress: totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0,
        };
      })();

  const { showMenu } = useContextMenu();

  const handleFolderCardContextMenu = (e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu(e, [
      {
        icon: FolderOpen,
        label: "Open Folder",
        action: () => handleSelectFolder(folder.id),
      },
      {
        icon: FolderPlus,
        label: "New Subfolder",
        action: () => openNewSubfolderModal && openNewSubfolderModal(folder.id),
      },
      {
        icon: Download,
        label: "Import Course Here",
        action: () => openImportModal && openImportModal(folder.id),
      },
      {
        icon: Smile,
        label: "Change Emoji",
        action: () => onSelectFolderEmoji && onSelectFolderEmoji(folder),
      },
      { type: "separator" },
      {
        icon: Trash2,
        label: "Delete Folder",
        danger: true,
        action: () => handleDeleteFolderWithDialog && handleDeleteFolderWithDialog(folder),
      },
    ]);
  };

  const handleCourseCardContextMenu = (e, playlist) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu(e, [
      {
        icon: Play,
        label: "Open Course",
        action: () => handleSelectPlaylist(playlist),
      },
      { type: "separator" },
      {
        icon: Copy,
        label: "Copy URL",
        disabled: !playlist.url,
        action: () => playlist.url && navigator.clipboard.writeText(playlist.url),
      },
      {
        icon: ExternalLink,
        label: "Open in Browser",
        disabled: !playlist.url,
        action: () => playlist.url && openBrowser(playlist.url),
      },
      { type: "separator" },
      {
        icon: Trash2,
        label: "Delete Course",
        danger: true,
        action: () => handleDeletePlaylistWithAssets && handleDeletePlaylistWithAssets(playlist),
      },
    ]);
  };

  // Render folder card
  const renderFolderCard = (folder) => {
    const stats = getFolderStats(folder.id);
    const hasItems = stats.totalPlaylists > 0 || stats.directSubfoldersCount > 0;
    
    return (
      <div
        key={folder.id}
        onClick={() => handleSelectFolder(folder.id)}
        onContextMenu={(e) => handleFolderCardContextMenu(e, folder)}
        className="group relative flex items-center justify-between p-3.5 bg-card/60 hover:bg-card border border-border/80 hover:border-border/100 rounded-xl cursor-pointer select-none transition-all duration-150 ease-out shadow-sm hover:shadow-md hover:scale-[1.01]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors duration-150 flex-shrink-0">
            {folder.emoji ? (
              <span className="text-lg leading-none select-none">{folder.emoji}</span>
            ) : (
              <Folder size={18} />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors duration-150">
              {folder.name}
            </h4>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5 font-medium">
              {hasItems ? (
                <>
                  {stats.directSubfoldersCount > 0 && `${stats.directSubfoldersCount} folders • `}
                  {stats.totalPlaylists > 0 && `${stats.totalPlaylists} courses`}
                  {stats.totalPlaylists > 0 && ` • ${stats.progress}% complete`}
                </>
              ) : (
                "Empty folder"
              )}
            </p>
          </div>
        </div>

        {/* Action button overlay on hover */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all duration-150 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelectFolderEmoji && onSelectFolderEmoji(folder);
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150 cursor-pointer"
            title="Change Emoji"
          >
            <Smile size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteFolderWithDialog && handleDeleteFolderWithDialog(folder);
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 flex-shrink-0"
            title="Delete Folder"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  };

  // Render course card
  const renderCourseCard = (playlist) => {
    const stats = libraryStats.find((s) => s.playlist_id === playlist.id) || {
      total_videos: 0,
      completed_videos: 0,
      total_duration: 0,
      downloaded_videos: 0,
    };

    const completionPercent = stats.total_videos > 0 
      ? Math.round((stats.completed_videos / stats.total_videos) * 100)
      : 0;

    const isFullyDownloaded = stats.total_videos > 0 && stats.downloaded_videos === stats.total_videos;

    return (
      <div
        key={playlist.id}
        onClick={() => handleSelectPlaylist(playlist)}
        onContextMenu={(e) => handleCourseCardContextMenu(e, playlist)}
        className="group flex flex-col bg-card/60 hover:bg-card border border-border/80 hover:border-border/100 rounded-xl cursor-pointer overflow-hidden transition-all duration-150 ease-out shadow-sm hover:shadow-md hover:scale-[1.01]"
      >
        {/* Course Thumbnail */}
        <div className="aspect-video w-full bg-muted border-b border-border relative flex items-center justify-center overflow-hidden flex-shrink-0">
          {playlist.thumbnail_url ? (
            <img
              src={playlist.thumbnail_url}
              alt={playlist.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground/60">
              <Library size={32} />
              <span className="text-[9px] uppercase tracking-wider font-semibold">Course</span>
            </div>
          )}

          {/* Quick Play Overlay Button */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
              <Play size={18} fill="currentColor" className="ml-0.5" />
            </div>
          </div>

          {/* Offline/Downloaded status badge */}
          {stats.total_videos > 0 && (
            <div className="absolute top-2 right-2">
              {isFullyDownloaded ? (
                <Badge className="bg-emerald-500/95 border border-emerald-600 text-white font-bold text-[8px] px-1.5 py-0.5 rounded shadow">
                  Offline Ready
                </Badge>
              ) : stats.downloaded_videos > 0 ? (
                <Badge className="bg-primary/90 border border-primary text-primary-foreground font-bold text-[8px] px-1.5 py-0.5 rounded shadow">
                  {stats.downloaded_videos}/{stats.total_videos} Offline
                </Badge>
              ) : null}
            </div>
          )}
        </div>

        {/* Content details */}
        <div className="p-4 flex-grow flex flex-col justify-between">
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-foreground line-clamp-1 leading-normal group-hover:text-primary transition-colors duration-150">
              {playlist.title}
            </h4>
            <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed mt-1">
              {playlist.description || "No description available."}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 shrink-0">
            {/* Progress indicators */}
            {stats.total_videos > 0 ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[9px] font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={10} className={completionPercent === 100 ? "text-emerald-500" : "text-muted-foreground"} />
                    {stats.completed_videos} / {stats.total_videos} videos
                  </span>
                  <span>{completionPercent}%</span>
                </div>
                <Progress value={completionPercent} className="h-1 bg-muted" />
              </div>
            ) : (
              <span className="text-[9px] italic text-muted-foreground">No videos imported</span>
            )}

            {/* Time / Duration meta */}
            {stats.total_duration > 0 && (
              <div className="flex flex-col gap-1.5 mt-1 text-[9px] text-muted-foreground/80 font-semibold border-t border-border/20 pt-2 select-none">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Clock size={10} className="flex-shrink-0" />
                    <span>Duration: {formatDuration(stats.total_duration)}</span>
                  </div>
                  {stats.total_duration - (stats.completed_duration || 0) > 0 ? (
                    <span>{formatDuration(stats.total_duration - (stats.completed_duration || 0))} left</span>
                  ) : (
                    <span className="text-emerald-500 font-bold">Completed</span>
                  )}
                </div>
                {stats.total_study_time > 0 && (
                  <div className="flex items-center gap-1 text-primary font-bold">
                    <span>⏱️ Studied: {formatDuration(stats.total_study_time)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Folders and Playlists count at this current explorer depth
  const foldersCount = currentLevelFolders.length;
  const playlistsCount = currentLevelPlaylists.length;
  const isEmpty = foldersCount === 0 && playlistsCount === 0;

  return (
    <div className="h-full w-full overflow-y-auto bg-background flex flex-col">
      {/* ───── 1. explorer info banner header ───── */}
      <div className="border-b border-border bg-card shadow-sm px-6 py-5 flex-shrink-0 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {selectedFolderId && (
                <button
                  onClick={() => handleSelectFolder(parentFolderId)}
                  className="mr-1.5 p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                  title="Go up to parent directory"
                >
                  <ArrowLeft size={14} />
                </button>
              )}
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider text-[8px] h-5 rounded-md"
              >
                {selectedFolderId ? "Directory View" : "Library Root"}
              </Badge>
            </div>
            
            <h2 className="text-base font-extrabold text-foreground mt-2.5 leading-tight flex items-center gap-1.5 group/title">
              {currentFolder && currentFolder.emoji ? (
                <span className="text-lg shrink-0 leading-none mr-0.5">{currentFolder.emoji}</span>
              ) : (
                <Folder size={18} className="text-muted-foreground flex-shrink-0" />
              )}
              {currentFolder ? currentFolder.name : "My Course Library"}
              {currentFolder && (
                <button
                  onClick={() => onSelectFolderEmoji && onSelectFolderEmoji(currentFolder)}
                  className="opacity-0 group-hover/title:opacity-100 p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150 cursor-pointer ml-1"
                  title="Change Folder Emoji"
                >
                  <Smile size={13} />
                </button>
              )}
            </h2>

            {/* Statistics subtitle summary */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground font-medium">
              {currentStats.directSubfoldersCount > 0 && (
                <span>{currentStats.directSubfoldersCount} folders</span>
              )}
              {currentStats.directSubfoldersCount > 0 && (
                <span className="text-border">•</span>
              )}
              <span>{currentStats.totalPlaylists} courses</span>
              
              {currentStats.totalVideos > 0 && (
                <>
                  <span className="text-border">•</span>
                  <span>{currentStats.completedVideos} / {currentStats.totalVideos} completed ({currentStats.progress}%)</span>
                  <span className="text-border">•</span>
                  <span className="flex items-center gap-0.5">
                    <Clock size={10} className="flex-shrink-0" />
                    {formatDuration(currentStats.totalDuration)}
                    {currentStats.totalDuration - (currentStats.completedDuration || 0) > 0 && (
                      <span className="text-muted-foreground/75 font-normal ml-1">
                        ({formatDuration(currentStats.totalDuration - (currentStats.completedDuration || 0))} left)
                      </span>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Root/Folder context buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => openNewSubfolderModal && openNewSubfolderModal(selectedFolderId)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border bg-muted/40 rounded-lg text-xs font-semibold text-foreground hover:bg-muted/80 hover:text-foreground transition-all cursor-pointer shadow-sm"
            >
              <FolderPlus size={13} />
              New Folder
            </button>
            <button
              onClick={() => openImportModal && openImportModal(selectedFolderId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/80 transition-all cursor-pointer shadow-sm"
            >
              <Plus size={13} />
              Import Course
            </button>
          </div>
        </div>
      </div>

      {/* ───── 2. grids container ───── */}
      <div className="flex-grow p-6 flex flex-col gap-6 max-w-7xl w-full mx-auto">
        {/* Render Study Dashboard at the Library Root */}
        {!selectedFolderId && (
          <StudyDashboard
            studyStats={studyStats}
            dailyStudyGoal={dailyStudyGoal}
          />
        )}
        {/* Render nested folders grid if any */}
        {foldersCount > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              Folders
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {currentLevelFolders.map(renderFolderCard)}
            </div>
          </div>
        )}

        {/* Render nested playlists/courses grid if any */}
        {playlistsCount > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              Courses
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentLevelPlaylists.map(renderCourseCard)}
            </div>
          </div>
        )}

        {/* Empty state illustration if folder has no content */}
        {isEmpty && (
          <div className="flex-grow flex flex-col justify-center items-center text-center p-8 py-16 border border-dashed border-border rounded-2xl bg-card/20 animate-fade-in">
            <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center mb-4 text-muted-foreground">
              <Folder size={22} className="opacity-40" />
            </div>
            <h3 className="text-xs font-bold text-foreground">
              Directory is empty
            </h3>
            <p className="text-[10px] text-muted-foreground max-w-[260px] mt-1 leading-relaxed">
              Create subfolders or import YouTube playlists here to organize your studies inside this category.
            </p>
            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => openImportModal && openImportModal(selectedFolderId)}
                className="px-3.5 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 text-[10px] font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Import Course
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
