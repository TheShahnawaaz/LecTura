import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { Sidebar } from "./components/Sidebar";
import { PlaylistDetail } from "./components/PlaylistDetail";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Library,
  AlertCircle,
  Loader2,
  Info,
  CheckCircle2,
  Sun,
  Moon,
  Settings as SettingsIcon,
  ChevronRight,
  Menu,
  ChevronsUpDown,
} from "lucide-react";

function App() {
  // Theme & Collapse States
  const [theme, setTheme] = useState(
    () => localStorage.getItem("lectura-theme") || "dark"
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Database States
  const [folders, setFolders] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  // Selection States
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [videos, setVideos] = useState([]);
  const [activeVideo, setActiveVideo] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);

  // System Status States
  const [ytdlpReady, setYtdlpReady] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [ffmpegStatusText, setFfmpegStatusText] = useState("Idle");

  // Modal Open/Close States
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Form/Input States
  const [importUrl, setImportUrl] = useState("");
  const [importFolderId, setImportFolderId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const [newFolderName, setNewFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState("");

  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [bookmarkMin, setBookmarkMin] = useState("0");
  const [bookmarkSec, setBookmarkSec] = useState("0");

  // Expanded folders mapping
  const [expandedFolders, setExpandedFolders] = useState({});

  // Playback Speed State
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Player ref for HTML5 video playback controls
  const videoPlayerRef = useRef(null);

  // Apply theme class to document
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("lectura-theme", theme);
  }, [theme]);

  // Fetch application version at startup dynamically
  useEffect(() => {
    getVersion()
      .then((ver) => setAppVersion(ver))
      .catch((err) => console.error("Failed to get version:", err));
  }, []);

  // Handle standard zoom keyboard shortcuts (Cmd/Ctrl + Plus/Minus/Zero)
  useEffect(() => {
    const handleZoom = (e) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;
      if (!isMetaOrCtrl) return;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoomLevel((prev) => Math.min(2.0, prev + 0.1));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoomLevel((prev) => Math.max(0.5, prev - 0.1));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoomLevel(1.0);
      }
    };

    window.addEventListener("keydown", handleZoom);
    return () => window.removeEventListener("keydown", handleZoom);
  }, []);

  // Apply zoom factor to document body
  useEffect(() => {
    document.body.style.zoom = zoomLevel;
  }, [zoomLevel]);

  // Listeners and Initial Load
  useEffect(() => {
    fetchFolders();
    fetchPlaylists();
    checkSystemStatus();

    // Listen to download progress events from Rust downloader
    const unlistenProgress = listen("download-progress", (event) => {
      const payload = event.payload;
      setVideos((prevVideos) =>
        prevVideos.map((v) => {
          if (v.id === payload.video_id) {
            return {
              ...v,
              download_progress: payload.progress,
              download_status: payload.status,
              local_path: payload.local_path || v.local_path,
            };
          }
          return v;
        })
      );

      setActiveVideo((prev) => {
        if (prev && prev.id === payload.video_id) {
          return {
            ...prev,
            download_progress: payload.progress,
            download_status: payload.status,
            local_path: payload.local_path || prev.local_path,
          };
        }
        return prev;
      });
    });

    // Listen to FFmpeg config status changes
    const unlistenFfmpeg = listen("ffmpeg-download-status", (event) => {
      const status = event.payload;
      if (status === "downloading") {
        setFfmpegStatusText("Downloading FFmpeg package from server...");
      } else if (status === "success") {
        setFfmpegStatusText("FFmpeg setup completed successfully!");
        setFfmpegReady(true);
      } else if (status.startsWith("failed")) {
        setFfmpegStatusText(`Setup failed: ${status}`);
        setFfmpegReady(false);
      }
    });

    return () => {
      unlistenProgress.then((f) => f());
      unlistenFfmpeg.then((f) => f());
    };
  }, []);

  // Synchronize playback speed settings with HTML5 player
  useEffect(() => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, activeVideo]);

  // Fetch bookmarks when selected video changes
  useEffect(() => {
    if (activeVideo) {
      fetchBookmarks(activeVideo.id);
    } else {
      setBookmarks([]);
    }
  }, [activeVideo]);

  // ─── Tauri API Invokes ────────────────────────────────────
  const fetchFolders = async () => {
    try {
      const data = await invoke("get_folders");
      setFolders(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPlaylists = async () => {
    try {
      const data = await invoke("get_playlists");
      setPlaylists(data);
    } catch (e) {
      console.error(e);
    }
  };

  const checkSystemStatus = async () => {
    try {
      const status = await invoke("get_system_status");
      setYtdlpReady(status.ytdlp_ready);
      setFfmpegReady(status.ffmpeg_ready);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPlaylistVideos = async (playlistId) => {
    try {
      const data = await invoke("get_playlist_videos", { playlistId });
      setVideos(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBookmarks = async (videoId) => {
    try {
      const data = await invoke("get_bookmarks", { videoId });
      setBookmarks(data);
    } catch (e) {
      console.error(e);
    }
  };

  // ─── User Actions ─────────────────────────────────────────
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const folderId = crypto.randomUUID();
      await invoke("create_folder", {
        id: folderId,
        name: newFolderName,
        parentId: parentFolderId || null,
        position: folders.length,
      });
      setNewFolderName("");
      setParentFolderId("");
      setIsFolderOpen(false);
      fetchFolders();
    } catch (err) {
      alert("Folder creation failed: " + err);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (
      !confirm(
        "Are you sure you want to delete this folder? Subfolders and playlists will lose their folder association."
      )
    )
      return;
    try {
      await invoke("delete_folder", { id: folderId });
      fetchFolders();
      fetchPlaylists();
    } catch (err) {
      alert("Folder deletion failed: " + err);
    }
  };

  const handleImportPlaylist = async (e) => {
    e.preventDefault();
    if (!importUrl.trim()) return;

    setIsImporting(true);
    setImportError("");

    try {
      const rawJson = await invoke("import_playlist", { url: importUrl });
      const metadata = JSON.parse(rawJson);

      const playlistId = metadata.id || crypto.randomUUID();
      const playlist = {
        id: playlistId,
        folder_id: importFolderId || null,
        title: metadata.title || "Untitled Course",
        description: metadata.description || "",
        thumbnail_url:
          metadata.thumbnails?.[0]?.url ||
          metadata.entries?.[0]?.thumbnails?.[0]?.url ||
          metadata.thumbnail ||
          "",
        url: importUrl,
        created_at: new Date().toISOString(),
      };

      const rawEntries = metadata.entries;
      let videosList = [];

      if (rawEntries && Array.isArray(rawEntries) && rawEntries.length > 0) {
        videosList = rawEntries.map((entry, index) => {
          const videoId = entry.id || crypto.randomUUID();
          return {
            id: videoId,
            playlist_id: playlistId,
            title: entry.title || `Lecture ${index + 1}`,
            duration: entry.duration ? Math.round(entry.duration) : 0,
            thumbnail_url:
              entry.thumbnails?.[0]?.url || entry.thumbnail || "",
            url:
              entry.url ||
              `https://www.youtube.com/watch?v=${entry.id}`,
            local_path: null,
            download_status: "none",
            download_progress: 0,
            watched_progress: 0,
            is_completed: false,
            created_at: new Date().toISOString(),
          };
        });
      } else {
        // Single video fallback: treat the main metadata object as the video entry
        const videoId = metadata.id || crypto.randomUUID();
        videosList = [
          {
            id: videoId,
            playlist_id: playlistId,
            title: metadata.title || "Untitled Lecture",
            duration: metadata.duration ? Math.round(metadata.duration) : 0,
            thumbnail_url:
              metadata.thumbnails?.[0]?.url || metadata.thumbnail || "",
            url:
              metadata.webpage_url ||
              metadata.url ||
              importUrl,
            local_path: null,
            download_status: "none",
            download_progress: 0,
            watched_progress: 0,
            is_completed: false,
            created_at: new Date().toISOString(),
          },
        ];
      }

      await invoke("add_playlist_with_videos", {
        playlist,
        videos: videosList,
      });

      setImportUrl("");
      setImportFolderId("");
      setIsImportOpen(false);
      fetchPlaylists();
    } catch (err) {
      setImportError(err.toString());
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadVideo = async (video) => {
    try {
      await invoke("update_download_progress", {
        videoId: video.id,
        status: "pending",
        progress: 0,
        localPath: null,
      });
      await invoke("download_video", { videoId: video.id });
    } catch (err) {
      alert("Failed to queue video download: " + err);
    }
  };

  const handleDownloadPlaylist = async (playlistId) => {
    try {
      await invoke("download_playlist", { playlistId });
      alert(
        "Course download successfully queued! Check the video statuses in the lecture list."
      );
    } catch (err) {
      alert("Failed to queue playlist download: " + err);
    }
  };

  const handleCancelVideoDownload = async (video) => {
    try {
      await invoke("cancel_download", { videoId: video.id });
    } catch (err) {
      alert("Failed to cancel video download: " + err);
    }
  };

  const handleCancelPlaylistDownload = async (playlistId) => {
    try {
      await invoke("cancel_playlist_download", { playlistId });
    } catch (err) {
      alert("Failed to cancel playlist download: " + err);
    }
  };

  const handleFfmpegSetup = async () => {
    try {
      setFfmpegStatusText("Initiating package configuration...");
      await invoke("download_ffmpeg");
    } catch (err) {
      setFfmpegStatusText("FFmpeg setup initialization failed: " + err);
    }
  };

  const handleSelectPlaylist = (playlist) => {
    setSelectedPlaylist(playlist);
    setActiveVideo(null);
    fetchPlaylistVideos(playlist.id);
  };

  const handleSelectVideo = (video) => {
    setActiveVideo(video);
    setPlaybackSpeed(1.0);
  };

  const handleUpdateProgress = async (videoId, seconds, isCompleted) => {
    try {
      await invoke("update_video_progress", {
        videoId,
        seconds,
        isCompleted,
      });
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? { ...v, watched_progress: seconds, is_completed: isCompleted }
            : v
        )
      );
    } catch (err) {
      console.error("Failed to update progress:", err);
    }
  };

  const handleAddBookmark = async (e) => {
    e.preventDefault();
    if (!activeVideo) return;

    const minutes = parseInt(bookmarkMin) || 0;
    const seconds = parseInt(bookmarkSec) || 0;
    const timestamp = minutes * 60 + seconds;

    try {
      await invoke("add_bookmark", {
        videoId: activeVideo.id,
        timestamp,
        label:
          bookmarkLabel.trim() ||
          `Bookmark at ${minutes}:${seconds.toString().padStart(2, "0")}`,
      });
      setBookmarkLabel("");
      setBookmarkMin("0");
      setBookmarkSec("0");
      fetchBookmarks(activeVideo.id);
    } catch (err) {
      alert("Failed to create bookmark: " + err);
    }
  };

  const handleDeleteBookmark = async (id) => {
    try {
      await invoke("delete_bookmark", { id });
      fetchBookmarks(activeVideo.id);
    } catch (err) {
      alert("Failed to delete bookmark: " + err);
    }
  };

  const handleSeek = (seconds) => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = seconds;
      videoPlayerRef.current.play();
    }
  };

  const toggleFolder = (folderId) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const isSystemReady = ytdlpReady && ffmpegReady;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-300 relative">
      {/* Main Layout Row Container */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ───── 1. COLLAPSIBLE SIDEBAR ───── */}
        <Sidebar
          folders={folders}
          playlists={playlists}
          selectedPlaylist={selectedPlaylist}
          expandedFolders={expandedFolders}
          ytdlpReady={ytdlpReady}
          ffmpegReady={ffmpegReady}
          toggleFolder={toggleFolder}
          handleSelectPlaylist={handleSelectPlaylist}
          handleDeleteFolder={handleDeleteFolder}
          setIsImportOpen={setIsImportOpen}
          setIsFolderOpen={setIsFolderOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          checkSystemStatus={checkSystemStatus}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          appVersion={appVersion}
        />

        {/* ───── 2. MAIN CONTAINER ───── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* ───── Sticky Header ───── */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-sm font-medium min-w-0">
              <span
                className="text-muted-foreground truncate hover:text-foreground cursor-pointer transition-colors"
                onClick={() => {
                  setSelectedPlaylist(null);
                  setActiveVideo(null);
                }}
              >
                LecTura
              </span>
              {selectedPlaylist && (
                <>
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground flex-shrink-0"
                  />
                  <span
                    className="text-foreground font-semibold truncate max-w-[250px] cursor-pointer hover:text-muted-foreground transition-colors"
                    onClick={() => setActiveVideo(null)}
                  >
                    {selectedPlaylist.title}
                  </span>
                </>
              )}
              {selectedPlaylist && activeVideo && (
                <>
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground flex-shrink-0"
                  />
                  <span className="text-muted-foreground font-medium truncate max-w-[200px]">
                    {activeVideo.title}
                  </span>
                </>
              )}
            </nav>

            {/* Header Right Actions */}
            <div className="flex items-center gap-3">
              {/* System Status Indicator */}
              <div className="flex items-center gap-1.5 bg-muted/50 border border-border px-2.5 py-1 rounded-lg">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isSystemReady ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isSystemReady ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold tracking-wide hidden md:inline">
                  {isSystemReady ? "System Ready" : "Setup Required"}
                </span>
              </div>

              {/* Theme Toggle */}
              <button
                onClick={() =>
                  setTheme((prev) =>
                    prev === "dark" ? "light" : "dark"
                  )
                }
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors border border-border"
                title="Toggle Theme"
              >
                {theme === "dark" ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )}
              </button>

              {/* Settings Button */}
              <button
                onClick={() => {
                  setIsSettingsOpen(true);
                  checkSystemStatus();
                }}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors border border-border cursor-pointer"
                title="Settings & System Config"
              >
                <SettingsIcon size={18} />
              </button>
            </div>
          </header>

          {/* ───── Page Content ───── */}
          <main className="flex-1 overflow-hidden relative">
            {selectedPlaylist ? (
              <div className="h-full w-full">
                <PlaylistDetail
                  selectedPlaylist={selectedPlaylist}
                  videos={videos}
                  activeVideo={activeVideo}
                  videoPlayerRef={videoPlayerRef}
                  playbackSpeed={playbackSpeed}
                  setPlaybackSpeed={setPlaybackSpeed}
                  handleUpdateProgress={handleUpdateProgress}
                  handleDownloadPlaylist={handleDownloadPlaylist}
                  handleDownloadVideo={handleDownloadVideo}
                  handleSelectVideo={handleSelectVideo}
                  handleCancelVideoDownload={handleCancelVideoDownload}
                  handleCancelPlaylistDownload={handleCancelPlaylistDownload}
                />
              </div>
            ) : (
              /* ───── Welcome / Empty State ───── */
              <div className="h-full w-full overflow-y-auto bg-background">
                <div className="min-h-full flex flex-col justify-center items-center p-6 md:p-8">
                  <div className="animate-fade-in max-w-md w-full">
                    {/* Welcome Card */}
                    <div className="p-8 bg-card border border-border rounded-xl shadow-sm flex flex-col items-center relative overflow-hidden transition-colors duration-300">
                      {/* Top accent line */}
                      <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />

                      <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center mb-5 shadow-inner">
                        <Library
                          size={28}
                          className="text-foreground"
                        />
                      </div>

                      <h2 className="text-lg font-bold text-foreground tracking-tight">
                        Welcome to LecTura
                      </h2>
                      <p className="text-xs text-muted-foreground max-w-[320px] mt-2 leading-relaxed text-center">
                        Import YouTube course structures, organize
                        them locally, and accelerate offline viewing
                        with granular playback speeds and timeline
                        bookmarks.
                      </p>

                      {/* Action buttons */}
                      <div className="w-full flex flex-col gap-3 mt-6">
                        <button
                          onClick={() => setIsImportOpen(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
                        >
                          <Plus size={16} />
                          Import YouTube Course
                        </button>
                        <button
                          onClick={() => setIsFolderOpen(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-border bg-muted/40 text-foreground hover:bg-muted/80 transition-all shadow-sm cursor-pointer"
                        >
                          <Plus size={16} />
                          Create nesting folders
                        </button>
                      </div>

                      {/* System warning */}
                      {!isSystemReady && (
                        <div
                          onClick={() => setIsSettingsOpen(true)}
                          className="w-full mt-4 p-3 bg-destructive/5 border border-destructive/10 hover:border-destructive/20 rounded-lg flex items-start gap-2.5 text-left cursor-pointer transition duration-150"
                        >
                          <AlertCircle
                            size={15}
                            className="text-destructive flex-shrink-0 mt-0.5"
                          />
                          <div>
                            <h4 className="text-[10px] font-bold text-destructive uppercase tracking-wide">
                              Dependencies Action Required
                            </h4>
                            <p className="text-[9px] text-muted-foreground mt-0.5 leading-normal">
                              FFmpeg / yt-dlp config incomplete.
                              Click to configure binaries for
                              downloading lectures.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ───── 3. SETTINGS DIALOG ───── */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-wide uppercase">
              Settings & System Configuration
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Track status of required binaries and configure system
              path variables.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              {/* yt-dlp status */}
              <div className="p-3 bg-muted/30 rounded-lg border border-border flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <h4 className="text-xs font-semibold">
                    yt-dlp (Lecture Scraper)
                  </h4>
                  <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                    Automated sidecar client compiled inside bundle.
                  </p>
                </div>
                <Badge
                  variant={ytdlpReady ? "outline" : "destructive"}
                  className={
                    ytdlpReady
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : ""
                  }
                >
                  {ytdlpReady ? "Configured" : "Missing"}
                </Badge>
              </div>

              {/* FFmpeg status */}
              <div className="p-3 bg-muted/30 rounded-lg border border-border flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <h4 className="text-xs font-semibold">
                    FFmpeg (Media Merger)
                  </h4>
                  <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                    Required to stitch audio/video high-res packages.
                  </p>
                </div>
                <Badge
                  variant={ffmpegReady ? "outline" : "destructive"}
                  className={
                    ffmpegReady
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : ""
                  }
                >
                  {ffmpegReady ? "Configured" : "Missing"}
                </Badge>
              </div>
            </div>

            {/* FFmpeg download trigger */}
            {!ffmpegReady && (
              <div className="bg-muted/30 p-3 rounded-lg border border-border flex flex-col gap-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  FFmpeg is not configured. Click below to
                  automatically download and link it to the
                  application sandbox.
                </p>
                <button
                  onClick={handleFfmpegSetup}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
                >
                  Configure FFmpeg Dependency
                </button>
              </div>
            )}

            {/* Log output console */}
            <div className="bg-muted rounded-lg p-3 border border-border font-mono text-[9px] text-muted-foreground min-h-[50px] flex items-center">
              <Info
                size={11}
                className="text-muted-foreground mr-2 flex-shrink-0"
              />
              <span className="break-all">{ffmpegStatusText}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ───── 4. IMPORT COURSE DIALOG ───── */}
      <Dialog
        open={isImportOpen}
        onOpenChange={(open) => {
          setIsImportOpen(open);
          if (!open) setImportError("");
        }}
      >
        <DialogContent className="bg-card border-border text-foreground max-w-sm sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-wide uppercase">
              Import YouTube Course Structure
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Paste a playlist URL to scrape course content and
              download setup.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleImportPlaylist}
            className="flex flex-col gap-4 py-2"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                YouTube Playlist URL
              </label>
              <Input
                type="url"
                placeholder="https://www.youtube.com/playlist?list=..."
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                disabled={isImporting}
                required
                className="bg-background border-border text-xs text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Destination Folder
              </label>
              <div className="relative">
                <select
                  value={importFolderId}
                  onChange={(e) => setImportFolderId(e.target.value)}
                  disabled={isImporting}
                  className="flex h-9 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer appearance-none pr-8"
                >
                  <option value="" className="bg-card">
                    Root (No Folder)
                  </option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-card">
                      {f.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-muted-foreground">
                  <ChevronsUpDown size={14} />
                </div>
              </div>
            </div>

            {importError && (
              <div className="p-3 bg-destructive/5 border border-destructive/10 rounded-lg flex items-start gap-2 text-[10px] text-destructive leading-relaxed">
                <AlertCircle
                  size={13}
                  className="flex-shrink-0 mt-0.5"
                />
                <span className="break-all">{importError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isImporting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Scraping YouTube Metadata...
                </>
              ) : (
                "Import Course"
              )}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ───── 5. CREATE FOLDER DIALOG ───── */}
      <Dialog open={isFolderOpen} onOpenChange={setIsFolderOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-wide uppercase">
              Create Nesting Folder
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Create directories to structure and organize your
              offline lectures.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleCreateFolder}
            className="flex flex-col gap-4 py-2"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Folder Title
              </label>
              <Input
                type="text"
                placeholder="e.g. Computer Science, Machine Learning"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                required
                className="bg-background border-border text-xs text-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Parent Folder (For Subfolders)
              </label>
              <div className="relative">
                <select
                  value={parentFolderId}
                  onChange={(e) => setParentFolderId(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer appearance-none pr-8"
                >
                  <option value="" className="bg-card">
                    None (Root Level)
                  </option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-card">
                      {f.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-muted-foreground">
                  <ChevronsUpDown size={14} />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
            >
              Create Folder
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
