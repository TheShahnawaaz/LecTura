import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";

import { Sidebar } from "./components/Sidebar";
import { PlaylistDetail } from "./components/PlaylistDetail";
import { FolderExplorer } from "./components/FolderExplorer";
import RevisionLibrary from "./components/RevisionLibrary";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { ContextMenuProvider } from "./context/ContextMenuContext";
import { FolderDeleteDialog } from "./components/FolderDeleteDialog";
import { PlaylistDeleteDialog } from "./components/PlaylistDeleteDialog";
import { EmojiPickerModal } from "./components/EmojiPickerModal";
import { CommandPalette } from "./components/CommandPalette";
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
  Keyboard,
  Home,
  Folder,
  FolderOpen,
  Play,
  Search,
  Download,
  Trash2,
  RefreshCw,
  XCircle,
  Terminal,

} from "lucide-react";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function App() {
  // Theme & Collapse States
  const [theme, setTheme] = useState(
    () => localStorage.getItem("lectura-theme") || "dark"
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Database States
  const [folders, setFolders] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  // Selection States
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [libraryStats, setLibraryStats] = useState([]);
  const [videos, setVideos] = useState([]);
  const [activeVideo, setActiveVideo] = useState(null);
  const [activeView, setActiveView] = useState("explorer"); // "explorer" vs "revision"
  const [revisionFilter, setRevisionFilter] = useState("all"); // "all", "bookmarks", "doubts"
  const [seekRequest, setSeekRequest] = useState(null); // { videoId, timestamp, time }
  const [bookmarks, setBookmarks] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);

  // System Status States
  const [ytdlpReady, setYtdlpReady] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [ffmpegStatusText, setFfmpegStatusText] = useState("Idle");

  // Modal Open/Close States
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Download Manager States
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState([]);
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState(() => {
    return localStorage.getItem("lectura_download_speed_limit") || "unlimited";
  });
  const [activeLogVideo, setActiveLogVideo] = useState(null);

  // Deletion and picker dialog targets
  const [folderDeleteTarget, setFolderDeleteTarget] = useState(null); // folder object
  const [playlistDeleteTarget, setPlaylistDeleteTarget] = useState(null); // playlist object
  const [emojiPickerTarget, setEmojiPickerTarget] = useState(null); // folder object

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

  // Playback Speed Retention Preference
  const [rememberSpeed, setRememberSpeed] = useState(() => {
    return localStorage.getItem("lectura_remember_speed") === "true";
  });

  useEffect(() => {
    localStorage.setItem("lectura_remember_speed", rememberSpeed);
  }, [rememberSpeed]);


  // Daily Study Goal Preference (in minutes, default 30)
  const [dailyStudyGoal, setDailyStudyGoal] = useState(() => {
    const saved = localStorage.getItem("lectura_daily_study_goal");
    return saved ? parseInt(saved, 10) : 30;
  });

  useEffect(() => {
    localStorage.setItem("lectura_daily_study_goal", dailyStudyGoal);
  }, [dailyStudyGoal]);

  // Study Stats State
  const [studyStats, setStudyStats] = useState({
    total_study_seconds: 0,
    total_video_covered_seconds: 0,
    completed_lectures_count: 0,
    daily_logs: {},
  });

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
    fetchLibraryStats();
    fetchStudyStats();
    checkSystemStatus();

    // Set initial speed limit in Rust
    const initialLimit = localStorage.getItem("lectura_download_speed_limit") || "unlimited";
    invoke("set_download_speed_limit", { limit: initialLimit === "unlimited" ? null : initialLimit }).catch(console.error);
    fetchDownloadQueue().catch(console.error);

    // Listen to download progress events from Rust downloader
    const unlistenProgress = listen("download-progress", (event) => {
      if (!event || !event.payload) return;
      const payload = event.payload;
      
      setVideos((prevVideos) =>
        prevVideos.map((v) => {
          if (v.id === payload.video_id) {
            return {
              ...v,
              download_progress: payload.progress,
              download_status: payload.status,
              local_path: payload.local_path || v.local_path,
              error_log: payload.error_log || v.error_log,
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
            error_log: payload.error_log || prev.error_log,
          };
        }
        return prev;
      });

      // Update background downloads queue
      setDownloadQueue((prevQueue) => {
        if (payload.status === "completed" || payload.status === "none") {
          return prevQueue.filter((item) => item.id !== payload.video_id);
        }
        const exists = prevQueue.some((item) => item.id === payload.video_id);
        if (exists) {
          return prevQueue.map((item) =>
            item.id === payload.video_id
              ? {
                  ...item,
                  download_status: payload.status,
                  download_progress: payload.progress,
                  speed: payload.speed || "",
                  eta: payload.eta || "",
                  size: payload.size || "",
                  error_log: payload.error_log || item.error_log,
                }
              : item
          );
        } else {
          fetchDownloadQueue();
          return prevQueue;
        }
      });

      if (payload.status === "completed" || payload.status === "failed" || payload.status === "none") {
        fetchLibraryStats();
      }
    });

    // Listen to FFmpeg config status changes
    const unlistenFfmpeg = listen("ffmpeg-download-status", (event) => {
      if (!event || event.payload === undefined) return;
      const status = event.payload;
      if (status === "downloading") {
        setFfmpegStatusText("Downloading FFmpeg package from server...");
      } else if (status === "success") {
        setFfmpegStatusText("FFmpeg setup completed successfully!");
        setFfmpegReady(true);
      } else if (status && typeof status === "string" && status.startsWith("failed")) {
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


  const fetchDownloadQueue = async () => {
    try {
      const data = await invoke("get_download_queue");
      setDownloadQueue(data || []);
    } catch (err) {
      console.error("Failed to fetch download queue:", err);
    }
  };

  const handleSetSpeedLimit = async (limit) => {
    try {
      setDownloadSpeedLimit(limit);
      localStorage.setItem("lectura_download_speed_limit", limit);
      const rustLimit = limit === "unlimited" ? null : limit;
      await invoke("set_download_speed_limit", { limit: rustLimit });
    } catch (err) {
      console.error("Failed to set download speed limit:", err);
    }
  };

  const fetchLibraryStats = async () => {
    try {
      const data = await invoke("get_library_stats");
      setLibraryStats(data);
    } catch (e) {
      console.error("Failed to fetch library stats:", e);
    }
  };

  const fetchStudyStats = async () => {
    try {
      const stats = await invoke("get_study_stats");
      setStudyStats(stats);
    } catch (err) {
      console.error("Failed to fetch study stats:", err);
    }
  };

  const handleLogStudyTime = async (videoId, seconds) => {
    try {
      await invoke("log_study_time", { videoId, durationSeconds: seconds });
      // Update local study_time for the video in State in real-time
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? { ...v, study_time: (v.study_time || 0) + seconds }
            : v
        )
      );
      setActiveVideo((prev) => {
        if (prev && prev.id === videoId) {
          return { ...prev, study_time: (prev.study_time || 0) + seconds };
        }
        return prev;
      });
      // Don't call fetchStudyStats() here — it triggers App re-renders that
      // destabilize the heartbeat timer. Stats refresh when navigating home.
    } catch (err) {
      console.error("Failed to log study time:", err);
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
      return data;
    } catch (e) {
      console.error(e);
      return [];
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
    // Legacy simple delete (still used by FolderTree inline trash icon)
    if (
      !confirm(
        "Are you sure you want to delete this folder? Subfolders and playlists will lose their folder association."
      )
    )
      return;
    try {
      await invoke("delete_folder", { id: folderId });
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      fetchFolders();
      fetchPlaylists();
      fetchLibraryStats();
    } catch (err) {
      alert("Folder deletion failed: " + err);
    }
  };

  // Show the smart folder delete dialog
  const handleDeleteFolderWithDialog = (folder) => {
    setFolderDeleteTarget(folder);
  };

  // Folder cascade delete (called from FolderDeleteDialog)
  const handleFolderCascade = async (folderId, deleteAssets) => {
    try {
      await invoke("delete_folder_cascade", { folderId, deleteAssets });
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      if (selectedPlaylist?.folder_id === folderId) {
        setSelectedPlaylist(null);
        setActiveVideo(null);
      }
      fetchFolders();
      fetchPlaylists();
      fetchLibraryStats();
    } catch (err) {
      alert("Failed to delete folder: " + err);
    }
  };

  // Move folder contents to root then delete (called from FolderDeleteDialog)
  const handleFolderMoveToRoot = async (folderId) => {
    try {
      await invoke("delete_folder_move_to_root", { folderId });
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      fetchFolders();
      fetchPlaylists();
      fetchLibraryStats();
    } catch (err) {
      alert("Failed to move folder contents: " + err);
    }
  };

  // Delete a playlist AND its downloaded assets
  const handleDeletePlaylistWithAssets = async (playlistId) => {
    try {
      await invoke("delete_playlist_with_assets", { playlistId });
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(null);
        setActiveVideo(null);
      }
      fetchPlaylists();
      fetchLibraryStats();
    } catch (err) {
      alert("Failed to delete course: " + err);
    }
  };

  // ── Smart modal helpers: pre-fill context before opening ──
  // Open the "New Subfolder" modal with parent pre-selected
  const openNewSubfolderModal = (parentId) => {
    setParentFolderId(parentId || "");
    setNewFolderName("");
    setIsFolderOpen(true);
  };

  // Open the "Import Course" modal with a folder pre-selected
  const openImportModal = (folderId) => {
    setImportFolderId(folderId || "");
    setImportUrl("");
    setImportError("");
    setIsImportOpen(true);
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
      fetchLibraryStats();
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

  const getFolderBreadcrumbs = (folderId) => {
    const crumbs = [];
    let currentId = folderId;
    while (currentId) {
      const folder = folders.find((f) => f.id === currentId);
      if (folder) {
        crumbs.unshift(folder);
        currentId = folder.parent_id;
      } else {
        break;
      }
    }
    return crumbs;
  };

  const handleSelectPlaylist = (playlist, initialVideoId = null) => {
    setSelectedPlaylist(playlist);
    setActiveVideo(null);
    setActiveView("explorer");
    if (playlist) {
      setSelectedFolderId(playlist.folder_id);
      fetchPlaylistVideos(playlist.id).then((data) => {
        // Auto-open the target video or the first incomplete video when entering a playlist
        if (data && data.length > 0) {
          const targetVideo = initialVideoId 
            ? data.find((v) => v.id === initialVideoId)
            : data.find((v) => !v.is_completed);
          setActiveVideo(targetVideo || data[0]);
        }
      });
    }
  };

  const handleSelectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    setSelectedPlaylist(null);
    setActiveVideo(null);
    setActiveView("explorer");
  };

  const handlePlayBookmarkVideo = (playlistId, videoId, timestamp) => {
    const playlist = playlists.find((p) => p.id === playlistId);
    if (playlist) {
      setSelectedPlaylist(playlist);
      setSelectedFolderId(playlist.folder_id);
      setActiveView("explorer");
      
      // Load video list
      fetchPlaylistVideos(playlist.id).then((data) => {
        if (data && data.length > 0) {
          const targetVideo = data.find((v) => v.id === videoId);
          if (targetVideo) {
            setActiveVideo(targetVideo);
            setSeekRequest({ videoId, timestamp, time: Date.now() });
          }
        }
      });
    }
  };

  const handleSelectSearchResult = (item) => {
    if (item.item_type === "folder") {
      handleSelectFolder(item.id);
      // Ensure the folder is expanded
      setExpandedFolders((prev) => ({
        ...prev,
        [item.id]: true,
      }));
    } else if (item.item_type === "playlist") {
      const pl = playlists.find((p) => p.id === item.id);
      if (pl) {
        handleSelectPlaylist(pl);
      }
    } else if (item.item_type === "video") {
      const pl = playlists.find((p) => p.id === item.playlist_id);
      if (pl) {
        handleSelectPlaylist(pl, item.id);
      }
    }
  };

  const handleDragDropMove = async (draggedType, draggedId, targetFolderId) => {
    console.log("handleDragDropMove CALLED with:", { draggedType, draggedId, targetFolderId });
    try {
      if (draggedType === "folder") {
        console.log("Invoking move_folder command...");
        const res = await invoke("move_folder", { folderId: draggedId, parentId: targetFolderId });
        console.log("move_folder response:", res);
        await fetchFolders();
      } else if (draggedType === "playlist") {
        console.log("Invoking move_playlist command...");
        const res = await invoke("move_playlist", { playlistId: draggedId, folderId: targetFolderId });
        console.log("move_playlist response:", res);
        await fetchPlaylists();
        await fetchLibraryStats();
      }
    } catch (err) {
      console.error("Failed to move item:", err);
      alert("Failed to move item: " + err);
    }
  };

  const handleUpdateFolderEmoji = async (folderId, emoji) => {
    try {
      await invoke("update_folder_emoji", { folderId, emoji });
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, emoji } : f))
      );
    } catch (err) {
      console.error("Failed to update folder emoji:", err);
    }
  };

  const handleSelectVideo = (video) => {
    setActiveVideo(video);
    if (!rememberSpeed) {
      setPlaybackSpeed(1.0);
    }
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
      setActiveVideo((prev) => {
        if (prev && prev.id === videoId) {
          return { ...prev, watched_progress: seconds, is_completed: isCompleted };
        }
        return prev;
      });
      fetchLibraryStats();
      fetchStudyStats();
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

  // Global ? keydown listener to toggle shortcuts panel
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement.isContentEditable) return;
      if (e.key === "?") {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Global Cmd+K / Ctrl+K keydown listener to toggle search palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isSystemReady = ytdlpReady && ffmpegReady;

  return (
    <ContextMenuProvider>
    <div className={`flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-300 relative ${
      draggedItem ? "app-dragging" : ""
    }`}>
      {/* Main Layout Row Container */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ───── 1. COLLAPSIBLE SIDEBAR ───── */}
        <Sidebar
          folders={folders}
          playlists={playlists}
          selectedPlaylist={selectedPlaylist}
          selectedFolderId={selectedFolderId}
          handleSelectFolder={handleSelectFolder}
          expandedFolders={expandedFolders}
          ytdlpReady={ytdlpReady}
          ffmpegReady={ffmpegReady}
          toggleFolder={toggleFolder}
          handleSelectPlaylist={handleSelectPlaylist}
          handleDeleteFolder={handleDeleteFolderWithDialog}
          handleDownloadPlaylist={handleDownloadPlaylist}
          handleDeletePlaylistWithAssets={(playlist) => setPlaylistDeleteTarget(playlist)}
          openNewSubfolderModal={openNewSubfolderModal}
          openImportModal={openImportModal}
          setIsSettingsOpen={setIsSettingsOpen}
          checkSystemStatus={checkSystemStatus}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          appVersion={appVersion}
          handleDragDropMove={handleDragDropMove}
          draggedItem={draggedItem}
          setDraggedItem={setDraggedItem}
          onSelectFolderEmoji={setEmojiPickerTarget}
          activeView={activeView}
          setActiveView={setActiveView}
        />

        {/* ───── 2. MAIN CONTAINER ───── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* ───── Sticky Header ───── */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1 text-sm font-medium min-w-0">
              <span
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-150 px-2 py-1 rounded-lg hover:bg-muted/65"
                onClick={() => {
                  setSelectedPlaylist(null);
                  setSelectedFolderId(null);
                  setActiveVideo(null);
                }}
              >
                <Home size={14} className="text-muted-foreground/75 flex-shrink-0" />
                <span className="truncate">LecTura</span>
              </span>

              {/* Folder hierarchy crumbs */}
              {getFolderBreadcrumbs(selectedFolderId).map((crumb, idx, arr) => {
                const isCurrentFolderLeaf = idx === arr.length - 1 && !selectedPlaylist;
                return (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight
                      size={12}
                      className="text-muted-foreground/30 flex-shrink-0 mx-0.5"
                    />
                    <span
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-150 max-w-[150px] px-2 py-1 rounded-lg hover:bg-muted/65"
                      onClick={() => {
                        setSelectedFolderId(crumb.id);
                        setSelectedPlaylist(null);
                        setActiveVideo(null);
                      }}
                    >
                      {crumb.emoji ? (
                        <span className="text-sm shrink-0 leading-none mr-0.5">{crumb.emoji}</span>
                      ) : isCurrentFolderLeaf ? (
                        <FolderOpen size={13} className="text-muted-foreground/75 flex-shrink-0" />
                      ) : (
                        <Folder size={13} className="text-muted-foreground/75 flex-shrink-0" />
                      )}
                      <span className="truncate">{crumb.name}</span>
                    </span>
                  </React.Fragment>
                );
              })}

              {selectedPlaylist && (
                <>
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground/30 flex-shrink-0 mx-0.5"
                  />
                  <span
                    className={`flex items-center gap-1.5 truncate max-w-[200px] cursor-pointer transition-all duration-150 px-2 py-1 rounded-lg hover:bg-muted/65 ${
                      !activeVideo ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setActiveVideo(null)}
                  >
                    <Library size={13} className="text-muted-foreground/75 flex-shrink-0" />
                    <span className="truncate">{selectedPlaylist.title}</span>
                  </span>
                </>
              )}
              {selectedPlaylist && activeVideo && (
                <>
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground/30 flex-shrink-0 mx-0.5"
                  />
                  <span className="flex items-center gap-1.5 text-foreground font-semibold truncate max-w-[180px] px-2 py-1 bg-primary/10 border border-primary/20 text-primary rounded-lg">
                    <Play size={11} fill="currentColor" className="text-primary flex-shrink-0" />
                    <span className="truncate">{activeVideo.title}</span>
                  </span>
                </>
              )}
            </nav>

            {/* Header Right Actions */}
            <div className="flex items-center gap-3">
              {/* Visual Search Trigger Bar */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-2 bg-muted/30 hover:bg-muted/70 border border-border px-3 py-1.5 rounded-lg text-xs text-muted-foreground transition-all duration-150 cursor-pointer w-[140px] md:w-[180px] justify-between group shadow-sm hover:shadow"
                title={`Search Library (${isMac ? "Cmd+K" : "Ctrl+K"})`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Search size={13} className="text-muted-foreground/60 group-hover:text-foreground/85 flex-shrink-0" />
                  <span className="truncate">Search...</span>
                </div>
                <kbd className="hidden sm:inline-flex h-4 select-none items-center gap-0.5 rounded border border-border bg-muted/60 px-1.5 font-mono text-[9px] font-medium text-muted-foreground opacity-100">
                  {isMac ? <span className="text-[10px]">⌘</span> : "Ctrl+"}K
                </kbd>
              </button>

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

              {/* Shortcuts Button */}
              <button
                onClick={() => setIsShortcutsOpen(true)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors border border-border cursor-pointer"
                title="Keyboard Shortcuts (?)"
              >
                <Keyboard size={18} />
              </button>

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

              {/* Downloads Queue Button */}
              <button
                onClick={() => {
                  fetchDownloadQueue();
                  setIsDownloadsOpen(true);
                }}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors border border-border cursor-pointer relative"
                title="Download Manager"
              >
                <Download size={18} />
                {downloadQueue.some((v) => v.download_status === "downloading" || v.download_status === "pending") && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
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
            {activeView === "revision" ? (
              <RevisionLibrary
                onPlayBookmarkVideo={handlePlayBookmarkVideo}
                initialCategoryFilter={revisionFilter}
              />
            ) : selectedPlaylist ? (
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
                  onStudyTimeLogged={handleLogStudyTime}
                  seekRequest={seekRequest}
                />
              </div>
            ) : (
              <FolderExplorer
                folders={folders}
                playlists={playlists}
                selectedFolderId={selectedFolderId}
                libraryStats={libraryStats}
                handleSelectFolder={handleSelectFolder}
                handleSelectPlaylist={handleSelectPlaylist}
                handleDeleteFolderWithDialog={(folder) => setFolderDeleteTarget(folder)}
                handleDeletePlaylistWithAssets={(playlist) => setPlaylistDeleteTarget(playlist)}
                openNewSubfolderModal={openNewSubfolderModal}
                openImportModal={openImportModal}
                onSelectFolderEmoji={setEmojiPickerTarget}
                studyStats={studyStats}
                dailyStudyGoal={dailyStudyGoal}
                fetchStudyStats={fetchStudyStats}
                onPlayBookmarkVideo={handlePlayBookmarkVideo}
                setActiveView={setActiveView}
                setRevisionFilter={setRevisionFilter}
              />
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

              {/* Remember Playback Speed setting */}
              <div className="p-3 bg-muted/30 rounded-lg border border-border flex items-center justify-between select-none">
                <div className="min-w-0 pr-2">
                  <h4 className="text-xs font-semibold">
                    Remember Playback Speed
                  </h4>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    Maintain current playback speed across videos.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={rememberSpeed}
                  onChange={(e) => setRememberSpeed(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                />
              </div>

              {/* Daily Study Goal setting */}
              <div className="p-3 bg-muted/30 rounded-lg border border-border flex flex-col gap-2 select-none">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <h4 className="text-xs font-semibold">
                      Daily Study Target
                    </h4>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Required study watch time to maintain your daily streak.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-primary shrink-0 tabular-nums">
                    {Math.floor(dailyStudyGoal / 60) > 0 ? `${Math.floor(dailyStudyGoal / 60)}h ` : ""}{dailyStudyGoal % 60}m ({dailyStudyGoal} mins)
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={Math.floor(dailyStudyGoal / 60)}
                      onChange={(e) => {
                        const h = Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0));
                        const m = dailyStudyGoal % 60;
                        setDailyStudyGoal(Math.max(1, h * 60 + m));
                      }}
                      className="h-8 text-center text-xs w-14 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] text-muted-foreground font-semibold">hr</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={dailyStudyGoal % 60}
                      onChange={(e) => {
                        const m = Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0));
                        const h = Math.floor(dailyStudyGoal / 60);
                        setDailyStudyGoal(Math.max(1, Math.min(1439, h * 60 + m)));
                      }}
                      className="h-8 text-center text-xs w-14 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] text-muted-foreground font-semibold">min</span>
                  </div>
                </div>
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

      {/* ───── KEYBOARD SHORTCUTS MODAL ───── */}
      <KeyboardShortcutsModal
        open={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* ───── FOLDER DELETE DIALOG ───── */}
      {folderDeleteTarget && (
        <FolderDeleteDialog
          folder={folderDeleteTarget}
          onMoveToRoot={handleFolderMoveToRoot}
          onCascade={handleFolderCascade}
          onClose={() => setFolderDeleteTarget(null)}
        />
      )}

      {/* ───── COMMAND PALETTE ───── */}
      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
        folders={folders}
      />

      {/* ───── PLAYLIST DELETE DIALOG ───── */}
      {playlistDeleteTarget && (
        <PlaylistDeleteDialog
          playlist={playlistDeleteTarget}
          onConfirm={handleDeletePlaylistWithAssets}
          onClose={() => setPlaylistDeleteTarget(null)}
        />
      )}

      {/* ───── DOWNLOADS MANAGER DIALOG ───── */}
      <Dialog open={isDownloadsOpen} onOpenChange={setIsDownloadsOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg sm:max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="pb-2 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-sm font-semibold tracking-wide uppercase flex items-center gap-2">
                  <Download size={15} className="text-primary animate-pulse" />
                  Background Downloads Queue
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs mt-1">
                  Monitor active video lectures downloading in the background. Enforces 2 max concurrent downloads.
                </DialogDescription>
              </div>
              
              {/* Throttling Dropdown */}
              <div className="flex items-center gap-1.5 shrink-0 bg-muted/50 border border-border px-2 py-1 rounded-lg">
                <span className="text-[10px] text-muted-foreground font-semibold">Speed Limit:</span>
                <select
                  value={downloadSpeedLimit}
                  onChange={(e) => handleSetSpeedLimit(e.target.value)}
                  className="bg-transparent text-[10px] font-bold text-primary focus:outline-none cursor-pointer border-none outline-none pr-1"
                >
                  <option value="unlimited" className="bg-card text-foreground">Unlimited</option>
                  <option value="500K" className="bg-card text-foreground">500 KB/s</option>
                  <option value="1M" className="bg-card text-foreground">1 MB/s</option>
                  <option value="2M" className="bg-card text-foreground">2 MB/s</option>
                  <option value="5M" className="bg-card text-foreground">5 MB/s</option>
                </select>
              </div>
            </div>
          </DialogHeader>

          {/* Queue List Container */}
          <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-2 min-h-0">
            {downloadQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center select-none">
                <Download size={32} className="text-muted-foreground/35 mb-2.5 stroke-[1.5]" />
                <p className="text-xs font-semibold text-muted-foreground/85">No Active Downloads</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[240px]">
                  Go to any course page and click "Download Lecture" or "Download All" to download videos for offline playback.
                </p>
              </div>
            ) : (
              downloadQueue.map((video) => {
                const isDownloading = video.download_status === "downloading";
                const isPending = video.download_status === "pending";
                const isFailed = video.download_status === "failed";
                
                return (
                  <div 
                    key={video.id} 
                    className="p-3 bg-muted/20 border border-border/60 hover:border-border rounded-xl flex items-center gap-3 transition-all duration-200"
                  >
                    {/* Thumbnail */}
                    {video.thumbnail_url ? (
                      <img 
                        src={video.thumbnail_url} 
                        alt="" 
                        className="w-16 h-10 object-cover rounded-lg border border-border/30 bg-muted shrink-0" 
                      />
                    ) : (
                      <div className="w-16 h-10 rounded-lg border border-border/30 bg-muted shrink-0 flex items-center justify-center">
                        <Play size={14} className="text-muted-foreground/50" />
                      </div>
                    )}

                    {/* Progress Info */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="text-xs font-semibold truncate text-foreground pr-2" title={video.title}>
                          {video.title}
                        </h4>
                        
                        {/* Status Badge */}
                        <Badge
                          variant="outline"
                          className={`text-[8px] font-extrabold tracking-wide uppercase px-1 py-0.5 rounded shrink-0 leading-none select-none ${
                            isDownloading 
                              ? "border-primary/20 bg-primary/10 text-primary animate-pulse" 
                              : isPending 
                              ? "border-amber-500/20 bg-amber-500/10 text-amber-500" 
                              : "border-destructive/20 bg-destructive/10 text-destructive"
                          }`}
                        >
                          {video.download_status}
                        </Badge>
                      </div>

                      {/* Diagnostic details row */}
                      {isDownloading && (
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground/80 tabular-nums">
                          {video.size && <span>{video.size}</span>}
                          {video.speed && (
                            <>
                              <span className="text-muted-foreground/30">•</span>
                              <span className="text-primary font-bold">{video.speed}</span>
                            </>
                          )}
                          {video.eta && (
                            <>
                              <span className="text-muted-foreground/30">•</span>
                              <span>ETA {video.eta}</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Progress Bar or Pending Indicator */}
                      <div className="mt-1 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-muted/65 border border-border/20 rounded-full overflow-hidden relative">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              isFailed 
                                ? "bg-destructive/80" 
                                : isPending
                                ? "bg-amber-500/30 w-full animate-pulse"
                                : "bg-gradient-to-r from-primary to-emerald-500"
                            }`}
                            style={{ width: isPending ? "100%" : `${video.download_progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-foreground shrink-0 w-8 text-right tabular-nums">
                          {isPending ? "Pending" : `${video.download_progress}%`}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 pl-1">
                      {isFailed && (
                        <>
                          {/* Inspect Logs */}
                          <button
                            onClick={() => setActiveLogVideo(video)}
                            className="p-1.5 rounded-lg border border-border hover:border-border/80 text-muted-foreground hover:text-foreground bg-muted/20 hover:bg-muted/60 transition-colors cursor-pointer"
                            title="Inspect Error Logs"
                          >
                            <Terminal size={12} />
                          </button>

                          {/* Retry */}
                          <button
                            onClick={() => invoke("download_video", { videoId: video.id })}
                            className="p-1.5 rounded-lg border border-primary/20 hover:border-primary/40 text-primary bg-primary/5 hover:bg-primary/15 transition-colors cursor-pointer"
                            title="Retry Download"
                          >
                            <RefreshCw size={12} />
                          </button>

                          {/* Clear */}
                          <button
                            onClick={() => invoke("clear_failed_download", { videoId: video.id }).then(fetchDownloadQueue)}
                            className="p-1.5 rounded-lg border border-border hover:border-border/80 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
                            title="Remove from List"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}

                      {(isDownloading || isPending) && (
                        <button
                          onClick={() => invoke("cancel_download", { videoId: video.id })}
                          className="p-1.5 rounded-lg border border-border hover:border-destructive/30 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
                          title="Cancel Download"
                        >
                          <XCircle size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ───── DIAGNOSTIC ERROR LOG PANEL (SUB-DIALOG) ───── */}
      <Dialog open={!!activeLogVideo} onOpenChange={(open) => !open && setActiveLogVideo(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl sm:max-w-2xl overflow-hidden flex flex-col max-h-[75vh]">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-sm font-semibold tracking-wide uppercase flex items-center gap-2">
              <Terminal size={15} className="text-destructive" />
              Download Diagnostics & Logs
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs mt-1">
              Inspection trace logs for: <strong className="text-foreground">{activeLogVideo?.title}</strong>
            </DialogDescription>
          </DialogHeader>

          {/* Logs Terminal */}
          <div className="flex-1 overflow-y-auto bg-zinc-950 border border-zinc-900 rounded-xl p-3.5 font-mono text-[10px] text-zinc-300 min-h-0 flex flex-col max-h-[45vh] relative select-text">
            {activeLogVideo?.error_log ? (
              <pre className="whitespace-pre-wrap break-all leading-relaxed">{activeLogVideo.error_log}</pre>
            ) : (
              <p className="text-zinc-500 italic">No execution trace logs captured for this failure.</p>
            )}
          </div>

          <DialogHeader className="pt-2 border-t border-border flex flex-row items-center justify-between gap-4">
            <span className="text-[10px] text-muted-foreground leading-relaxed max-w-[70%]">
              <strong>Tip:</strong> Network disconnections, SSL issues, or restriction blocks from YouTube are common causes of failure.
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[11px] px-3.5 border-border bg-muted/20 hover:bg-muted/65"
                onClick={() => {
                  navigator.clipboard.writeText(activeLogVideo?.error_log || "");
                  alert("Diagnostics logs copied to clipboard!");
                }}
                disabled={!activeLogVideo?.error_log}
              >
                Copy Logs
              </Button>
              <Button
                size="sm"
                className="h-8 text-[11px] px-4 bg-primary text-primary-foreground hover:bg-primary/80"
                onClick={() => {
                  const id = activeLogVideo.id;
                  setActiveLogVideo(null);
                  invoke("download_video", { videoId: id });
                }}
              >
                Retry Download
              </Button>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      
      {/* ───── EMOJI PICKER DIALOG ───── */}
      {emojiPickerTarget && (
        <EmojiPickerModal
          isOpen={!!emojiPickerTarget}
          onClose={() => setEmojiPickerTarget(null)}
          folder={emojiPickerTarget}
          onSelectEmoji={handleUpdateFolderEmoji}
          appTheme={theme}
        />
      )}
    </div>
  </ContextMenuProvider>
  );
}

export default App;
