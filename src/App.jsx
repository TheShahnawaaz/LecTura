import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { 
  Folder as FolderIcon, 
  ChevronRight, 
  ChevronDown, 
  Settings, 
  Plus, 
  Library, 
  Trash2, 
  Play, 
  Download, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Sliders, 
  Bookmark, 
  PlusCircle, 
  FileVideo, 
  Globe, 
  WifiOff,
  Video as VideoIcon
} from "lucide-react";

// Helper to convert Tauri file path to URL for native HTML5 video player
import { convertFileSrc } from '@tauri-apps/api/tauri';

function App() {
  // Database States
  const [folders, setFolders] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  
  // Selection States
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [videos, setVideos] = useState([]);
  const [activeVideo, setActiveVideo] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);

  // System status states
  const [ytdlpReady, setYtdlpReady] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [ffmpegStatusText, setFfmpegStatusText] = useState("Idle");

  // Modals / Inputs
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [importUrl, setImportUrl] = useState("");
  const [importFolderId, setImportFolderId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const [newFolderName, setNewFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState("");
  
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [bookmarkMin, setBookmarkMin] = useState("0");
  const [bookmarkSec, setBookmarkSec] = useState("0");

  // Expanded folders tracking
  const [expandedFolders, setExpandedFolders] = useState({});

  // Speed state
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Player ref for HTML5 video speed controls & seeks
  const videoPlayerRef = useRef(null);

  // 1. Initial Load & Listeners
  useEffect(() => {
    fetchFolders();
    fetchPlaylists();
    checkSystemStatus();

    // Listen to download progress notifications from Rust
    const unlistenProgress = listen("download-progress", (event) => {
      const payload = event.payload; // { video_id, progress, status, local_path }
      setVideos((prevVideos) => 
        prevVideos.map((v) => {
          if (v.id === payload.video_id) {
            return { 
              ...v, 
              download_progress: payload.progress, 
              download_status: payload.status,
              local_path: payload.local_path || v.local_path
            };
          }
          return v;
        })
      );

      // Update active video if it's the one being downloaded
      setActiveVideo((prev) => {
        if (prev && prev.id === payload.video_id) {
          return {
            ...prev,
            download_progress: payload.progress,
            download_status: payload.status,
            local_path: payload.local_path || prev.local_path
          };
        }
        return prev;
      });
    });

    // Listen to FFmpeg download status updates
    const unlistenFfmpeg = listen("ffmpeg-download-status", (event) => {
      const status = event.payload;
      if (status === "downloading") {
        setFfmpegStatusText("Downloading FFmpeg archive...");
      } else if (status === "success") {
        setFfmpegStatusText("FFmpeg configured successfully!");
        setFfmpegReady(true);
      } else if (status.startsWith("failed")) {
        setFfmpegStatusText(`Configuration failed: ${status}`);
        setFfmpegReady(false);
      }
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenFfmpeg.then(f => f());
    };
  }, []);

  // Sync speed to HTML5 video element when active video or speed changes
  useEffect(() => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, activeVideo]);

  // Fetch bookmarks when active video changes
  useEffect(() => {
    if (activeVideo) {
      fetchBookmarks(activeVideo.id);
    } else {
      setBookmarks([]);
    }
  }, [activeVideo]);

  // 2. Fetchers
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

  // 3. Actions
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const folderId = crypto.randomUUID();
      await invoke("create_folder", {
        id: folderId,
        name: newFolderName,
        parentId: parentFolderId || null,
        position: folders.length
      });
      setNewFolderName("");
      setParentFolderId("");
      setIsFolderOpen(false);
      fetchFolders();
    } catch (err) {
      alert("Failed to create folder: " + err);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!confirm("Are you sure you want to delete this folder? All nested subfolders and playlists will lose their folder association.")) return;
    try {
      await invoke("delete_folder", { id: folderId });
      fetchFolders();
      fetchPlaylists();
    } catch (err) {
      alert("Failed to delete folder: " + err);
    }
  };

  const handleImportPlaylist = async (e) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    
    setIsImporting(true);
    setImportError("");
    
    try {
      // 1. Fetch JSON metadata via yt-dlp
      const rawJson = await invoke("import_playlist", { url: importUrl });
      const metadata = JSON.parse(rawJson);
      
      // 2. Format Playlist object
      const playlistId = metadata.id || crypto.randomUUID();
      const playlist = {
        id: playlistId,
        folder_id: importFolderId || null,
        title: metadata.title || "Untitled Course",
        description: metadata.description || "",
        thumbnail_url: metadata.thumbnails?.[0]?.url || metadata.entries?.[0]?.thumbnails?.[0]?.url || "",
        url: importUrl,
        created_at: new Date().toISOString()
      };
      
      // 3. Format Video objects
      const rawEntries = metadata.entries || [];
      const videosList = rawEntries.map((entry, index) => {
        const videoId = entry.id || crypto.randomUUID();
        return {
          id: videoId,
          playlist_id: playlistId,
          title: entry.title || `Lecture ${index + 1}`,
          duration: entry.duration ? Math.round(entry.duration) : 0,
          thumbnail_url: entry.thumbnails?.[0]?.url || entry.thumbnail || "",
          url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
          local_path: null,
          download_status: "none",
          download_progress: 0,
          watched_progress: 0,
          is_completed: false,
          created_at: new Date().toISOString()
        };
      });

      // 4. Save to Database
      await invoke("add_playlist_with_videos", { playlist, videos: videosList });
      
      // Reset & refresh
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
        localPath: null
      });
      // Spawns downloader via sidecar for specific video URL
      // We can run playlist downloader for single video or call playlist downloader directly
      await invoke("download_playlist", { playlistId: video.playlist_id });
    } catch (err) {
      alert("Failed to start download: " + err);
    }
  };

  const handleDownloadPlaylist = async (playlistId) => {
    try {
      await invoke("download_playlist", { playlistId });
      alert("Download queued for all missing playlist videos! You can track progress in the video list.");
    } catch (err) {
      alert("Failed to start playlist download: " + err);
    }
  };

  const handleFfmpegSetup = async () => {
    try {
      setFfmpegStatusText("Initiating background configuration...");
      await invoke("download_ffmpeg");
    } catch (err) {
      setFfmpegStatusText("Failed to start download: " + err);
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
      await invoke("update_video_progress", { videoId, seconds, isCompleted });
      // Update local state to reflect progress immediately
      setVideos(prev => 
        prev.map(v => v.id === videoId ? { ...v, watched_progress: seconds, is_completed: isCompleted } : v)
      );
    } catch (err) {
      console.error("Progress save failed:", err);
    }
  };

  const handleAddBookmark = async (e) => {
    e.preventDefault();
    if (!activeVideo) return;
    
    const minutes = parseInt(bookmarkMin) || 0;
    const seconds = parseInt(bookmarkSec) || 0;
    const timestamp = (minutes * 60) + seconds;

    try {
      await invoke("add_bookmark", {
        videoId: activeVideo.id,
        timestamp,
        label: bookmarkLabel.trim() || `Bookmark at ${minutes}:${seconds.toString().padStart(2, '0')}`
      });
      setBookmarkLabel("");
      setBookmarkMin("0");
      setBookmarkSec("0");
      fetchBookmarks(activeVideo.id);
    } catch (err) {
      alert("Failed to add bookmark: " + err);
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
    } else {
      // YouTube Embed seek is trickier without iframe API but we can reload source with start param if needed
      // Or alert user that seeking is fully enabled for downloaded offline lectures
      console.log("Seeking offline video to", seconds);
    }
  };

  // 4. Recursive Folder Tree Compiler
  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const renderFolderTree = (parentId = null, depth = 0) => {
    const levelFolders = folders.filter(f => f.parent_id === parentId);
    
    return levelFolders.map(folder => {
      const isExpanded = expandedFolders[folder.id];
      const subfolders = folders.filter(f => f.parent_id === folder.id);
      const folderPlaylists = playlists.filter(p => p.folder_id === folder.id);
      const hasContent = subfolders.length > 0 || folderPlaylists.length > 0;

      return (
        <div key={folder.id} className="select-none" style={{ marginLeft: `${depth * 8}px` }}>
          {/* Folder Header */}
          <div className="group flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-slate-800/50 cursor-pointer text-slate-300 hover:text-white transition duration-200">
            <div className="flex items-center gap-2 flex-grow" onClick={() => toggleFolder(folder.id)}>
              <span className="text-slate-500">
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
              <FolderIcon size={16} className="text-blue-400 fill-blue-400/10" />
              <span className="text-sm font-medium truncate max-w-[150px]">{folder.name}</span>
            </div>
            <button 
              onClick={() => handleDeleteFolder(folder.id)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Folder Content */}
          {isExpanded && (
            <div className="pl-3 border-l border-slate-800 ml-3.5 my-1 flex flex-col gap-0.5">
              {/* Render Nested Folders */}
              {renderFolderTree(folder.id, depth + 1)}
              
              {/* Render Nested Playlists */}
              {folderPlaylists.map(playlist => (
                <div 
                  key={playlist.id} 
                  onClick={() => handleSelectPlaylist(playlist)}
                  className={`flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer transition text-xs ${
                    selectedPlaylist?.id === playlist.id 
                      ? "bg-blue-600/20 text-blue-300 border-l-2 border-blue-500 font-semibold" 
                      : "text-slate-400 hover:text-white hover:bg-slate-800/30"
                  }`}
                >
                  <Library size={14} className="flex-shrink-0" />
                  <span className="truncate">{playlist.title}</span>
                </div>
              ))}

              {/* Empty state nested folder */}
              {!hasContent && (
                <span className="text-[10px] text-slate-600 pl-6 py-0.5 italic">Empty folder</span>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  // Root level playlists (not assigned to any folder)
  const rootPlaylists = playlists.filter(p => !p.folder_id);

  // Time conversion helper
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans">
      
      {/* 1. SIDEBAR Navigation */}
      <aside className="w-64 border-r border-slate-800/80 bg-[#070a13] flex flex-col flex-shrink-0">
        
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center gap-3 bg-[#05070d]">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-lg shadow-md">
            <VideoIcon size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wide text-white">LecTura</h1>
            <p className="text-[10px] text-slate-500">Offline Course Player</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-3 flex gap-2 border-b border-slate-800/40">
          <button 
            onClick={() => setIsImportOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-md text-xs font-semibold shadow transition duration-200"
          >
            <Plus size={14} /> Playlist
          </button>
          <button 
            onClick={() => setIsFolderOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 rounded-md text-xs font-semibold border border-slate-700/50 transition duration-200"
          >
            <Plus size={14} /> Folder
          </button>
        </div>

        {/* Tree List Area */}
        <div className="flex-grow overflow-y-auto p-3 flex flex-col gap-2 scrollbar-thin">
          <h2 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 px-2">Library Navigation</h2>
          
          {/* Folders and subfolders recursive tree */}
          <div className="flex flex-col gap-1">
            {renderFolderTree(null, 0)}
          </div>

          {/* Root Playlists */}
          {rootPlaylists.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              <h3 className="text-[9px] uppercase font-bold tracking-wider text-slate-600 px-2 mb-1">Root Playlists</h3>
              {rootPlaylists.map(playlist => (
                <div 
                  key={playlist.id} 
                  onClick={() => handleSelectPlaylist(playlist)}
                  className={`flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer transition text-xs ${
                    selectedPlaylist?.id === playlist.id 
                      ? "bg-blue-600/20 text-blue-300 border-l-2 border-blue-500 font-semibold" 
                      : "text-slate-400 hover:text-white hover:bg-slate-800/30"
                  }`}
                >
                  <Library size={14} className="flex-shrink-0" />
                  <span className="truncate">{playlist.title}</span>
                </div>
              ))}
            </div>
          )}

          {folders.length === 0 && playlists.length === 0 && (
            <div className="text-center py-8 px-4 text-slate-600 text-xs italic">
              No files imported yet. Click the buttons above to start.
            </div>
          )}
        </div>

        {/* Bottom Gear System configuration Status */}
        <div className="p-3 border-t border-slate-800/80 bg-[#05070d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${ytdlpReady && ffmpegReady ? "bg-green-500" : "bg-amber-500 animate-pulse"}`}></div>
            <span className="text-[10px] text-slate-400 font-medium">
              {ytdlpReady && ffmpegReady ? "System Ready" : "Setup Required"}
            </span>
          </div>
          <button 
            onClick={() => { setIsSettingsOpen(true); checkSystemStatus(); }}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <Settings size={15} />
          </button>
        </div>
      </aside>

      {/* 2. MAIN View Area */}
      <main className="flex-grow flex flex-col overflow-hidden bg-[#090d16]">
        {selectedPlaylist ? (
          
          /* Playlist Detail Layout Screen */
          <div className="flex-grow flex flex-col overflow-hidden">
            
            {/* Playlist Header metadata */}
            <div className="p-4 bg-[#0c1221] border-b border-slate-800/80 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="text-[9px] uppercase bg-blue-900/50 border border-blue-800 text-blue-300 font-semibold px-2 py-0.5 rounded-md">Course Selected</span>
                <h2 className="text-lg font-bold text-white truncate mt-1">{selectedPlaylist.title}</h2>
                <p className="text-xs text-slate-400 truncate max-w-[500px]">{selectedPlaylist.description || "No description provided."}</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleDownloadPlaylist(selectedPlaylist.id)}
                  className="flex items-center gap-1.5 py-1.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-md text-xs font-semibold shadow transition"
                >
                  <Download size={14} /> Download Playlist
                </button>
              </div>
            </div>

            {/* Content Layout split screen */}
            <div className="flex-grow flex overflow-hidden">
              
              {/* LEFT Side: Player screen */}
              <div className="flex-grow flex flex-col overflow-y-auto p-4 scrollbar-thin gap-4">
                
                {activeVideo ? (
                  <div className="flex flex-col gap-4">
                    
                    {/* Native player card wrapper */}
                    <div className="aspect-video w-full rounded-xl bg-black overflow-hidden relative border border-slate-800/80 shadow-2xl">
                      {activeVideo.download_status === "completed" && activeVideo.local_path ? (
                        /* HTML5 Video player (Offline) */
                        <video 
                          ref={videoPlayerRef}
                          src={convertFileSrc(activeVideo.local_path)} 
                          controls 
                          className="w-full h-full object-contain"
                          onTimeUpdate={(e) => {
                            const curTime = e.currentTarget.currentTime;
                            const isDone = curTime >= e.currentTarget.duration - 10;
                            // Periodically save progress (e.g. every 5 seconds or on end)
                            if (Math.round(curTime) % 5 === 0) {
                              handleUpdateProgress(activeVideo.id, Math.round(curTime), isDone);
                            }
                          }}
                        />
                      ) : (
                        /* Standard Youtube iframe embed (Online) */
                        <iframe 
                          src={`https://www.youtube.com/embed/${activeVideo.id}?enablejsapi=1`}
                          title={activeVideo.title}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full"
                        ></iframe>
                      )}

                      {/* Connection status mode tag */}
                      <div className="absolute top-3 left-3 px-2 py-1 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-md flex items-center gap-1.5 text-[10px] text-white">
                        {activeVideo.download_status === "completed" ? (
                          <>
                            <WifiOff size={11} className="text-green-400" />
                            <span>Offline Mode</span>
                          </>
                        ) : (
                          <>
                            <Globe size={11} className="text-blue-400" />
                            <span>Online Streaming</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Title and control block */}
                    <div className="bg-[#0c1221] p-4 rounded-xl border border-slate-800/60 shadow-lg flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-4">
                        <h3 className="text-base font-bold text-white leading-snug">{activeVideo.title}</h3>
                        
                        {/* Playback speed selector */}
                        {activeVideo.download_status === "completed" && (
                          <div className="flex items-center gap-2 bg-[#121a2e] px-2.5 py-1 rounded-lg border border-slate-700/50">
                            <Sliders size={13} className="text-blue-400" />
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Speed:</label>
                            <select 
                              value={playbackSpeed} 
                              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                              className="bg-transparent text-xs text-blue-300 font-bold focus:outline-none cursor-pointer"
                            >
                              <option value="0.25">0.25x</option>
                              <option value="0.5">0.5x</option>
                              <option value="0.75">0.75x</option>
                              <option value="1">1.0x</option>
                              <option value="1.25">1.25x</option>
                              <option value="1.5">1.5x</option>
                              <option value="2">2.0x</option>
                              <option value="2.5">2.5x</option>
                              <option value="3">3.0x</option>
                              <option value="4">4.0x</option>
                              <option value="5">5.0x</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Warning if online */}
                      {activeVideo.download_status !== "completed" && (
                        <p className="text-[10px] text-amber-400 bg-amber-950/20 border border-amber-900/40 p-2 rounded-md flex items-center gap-1.5">
                          <AlertCircle size={12} />
                          Playback speeds above 2.0x are only supported once the video is downloaded.
                        </p>
                      )}
                    </div>

                    {/* Timeline Bookmarks section */}
                    <div className="bg-[#0c1221] p-4 rounded-xl border border-slate-800/60 shadow-lg flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                          <Bookmark size={13} className="text-blue-400" /> Seek Timeline Bookmarks
                        </h4>
                      </div>

                      {/* Add Bookmark form */}
                      <form onSubmit={handleAddBookmark} className="flex gap-2 items-center">
                        <input 
                          type="text" 
                          placeholder="Bookmark label (e.g. Recursion starts)"
                          value={bookmarkLabel}
                          onChange={(e) => setBookmarkLabel(e.target.value)}
                          className="flex-grow bg-slate-900/80 border border-slate-850 hover:border-slate-700/50 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs focus:outline-none transition text-slate-100 placeholder-slate-500"
                        />
                        <div className="flex gap-1 items-center">
                          <input 
                            type="number" 
                            min="0"
                            placeholder="Min"
                            value={bookmarkMin}
                            onChange={(e) => setBookmarkMin(e.target.value)}
                            className="w-12 bg-slate-900/80 border border-slate-850 hover:border-slate-700/50 focus:border-blue-500 rounded-md px-1.5 py-1.5 text-xs text-center focus:outline-none transition"
                          />
                          <span className="text-slate-500">:</span>
                          <input 
                            type="number" 
                            min="0"
                            max="59"
                            placeholder="Sec"
                            value={bookmarkSec}
                            onChange={(e) => setBookmarkSec(e.target.value)}
                            className="w-12 bg-slate-900/80 border border-slate-850 hover:border-slate-700/50 focus:border-blue-500 rounded-md px-1.5 py-1.5 text-xs text-center focus:outline-none transition"
                          />
                        </div>
                        <button 
                          type="submit"
                          className="p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700/50 rounded-md text-blue-400 hover:text-blue-300 transition duration-200"
                        >
                          <PlusCircle size={15} />
                        </button>
                      </form>

                      {/* Bookmarks Timeline Grid */}
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                        {bookmarks.map((b) => (
                          <div 
                            key={b.id} 
                            className="flex justify-between items-center bg-[#111727] py-1.5 px-3 rounded-lg border border-slate-800/40 hover:bg-[#151d31] transition"
                          >
                            <button 
                              onClick={() => handleSeek(b.timestamp)}
                              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition text-left"
                            >
                              <span className="bg-blue-950/80 border border-blue-900 text-blue-300 px-1.5 py-0.5 rounded text-[10px] tabular-nums">
                                {formatTime(b.timestamp)}
                              </span>
                              <span className="truncate max-w-[300px] text-slate-200">{b.label}</span>
                            </button>
                            <button 
                              onClick={() => handleDeleteBookmark(b.id)}
                              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/20 transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}

                        {bookmarks.length === 0 && (
                          <span className="text-[10px] text-slate-600 text-center py-2 italic">No timeline bookmarks added.</span>
                        )}
                      </div>
                    </div>

                  </div>
                ) : (
                  /* Player Empty State */
                  <div className="flex-grow flex flex-col justify-center items-center text-center p-8 bg-[#0c1221] rounded-2xl border border-slate-800/50 shadow-inner h-full min-h-[300px]">
                    <div className="p-4 bg-slate-800/40 rounded-full text-slate-500 mb-3 border border-slate-800">
                      <FileVideo size={30} />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300">No lecture selected</h3>
                    <p className="text-xs text-slate-500 max-w-[250px] mt-1">Select a video from the list on the right to start watching.</p>
                  </div>
                )}

              </div>

              {/* RIGHT Side: Videos queue list */}
              <div className="w-80 border-l border-slate-800/80 bg-[#070a13] flex flex-col flex-shrink-0 overflow-y-auto p-3 scrollbar-thin">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2 px-1">
                  <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Lecture List</h3>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md tabular-nums">
                    {videos.length} videos
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {videos.map((video) => {
                    const isSelected = activeVideo?.id === video.id;
                    return (
                      <div 
                        key={video.id} 
                        onClick={() => handleSelectVideo(video)}
                        className={`group p-2 rounded-xl cursor-pointer flex flex-col gap-1.5 border transition ${
                          isSelected 
                            ? "bg-blue-600/10 border-blue-500/50" 
                            : "bg-[#0b0f19]/80 border-slate-850 hover:bg-[#111728] hover:border-slate-800/80"
                        }`}
                      >
                        {/* Title and selection handle */}
                        <div className="flex justify-between items-start gap-2">
                          <span className={`text-xs font-medium line-clamp-2 leading-snug flex-grow ${isSelected ? "text-blue-300 font-bold" : "text-slate-200 group-hover:text-white"}`}>
                            {video.title}
                          </span>
                          {video.is_completed && (
                            <CheckCircle2 size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
                          )}
                        </div>

                        {/* Status bar (Duration, Watched progress, Download status) */}
                        <div className="flex justify-between items-center gap-4 mt-0.5">
                          <span className="text-[10px] text-slate-500 font-medium tabular-nums">
                            {formatTime(video.duration)}
                          </span>

                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {video.download_status === "completed" ? (
                              <span className="text-[9px] bg-green-950/40 border border-green-900/50 text-green-400 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <CheckCircle2 size={10} /> Offline Ready
                              </span>
                            ) : video.download_status === "downloading" ? (
                              <span className="text-[9px] bg-blue-950/40 border border-blue-900/50 text-blue-400 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Loader2 size={10} className="animate-spin" /> {video.download_progress}%
                              </span>
                            ) : video.download_status === "pending" ? (
                              <span className="text-[9px] bg-amber-950/40 border border-amber-900/50 text-amber-400 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Loader2 size={10} className="animate-spin" /> Pending
                              </span>
                            ) : (
                              <button 
                                onClick={() => handleDownloadVideo(video)}
                                className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-700/50 px-1.5 py-0.5 rounded transition"
                              >
                                <Download size={10} /> Download
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
        ) : (
          
          /* Empty/Welcome State Screen */
          <div className="flex-grow flex flex-col justify-center items-center p-8 bg-[#090d16] text-center">
            
            {/* Elegant glass welcome card */}
            <div className="max-w-md p-8 bg-[#0c1221] border border-slate-800/80 rounded-2xl shadow-2xl flex flex-col items-center relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600"></div>
              
              <div className="p-4 bg-blue-600/10 rounded-full text-blue-400 border border-blue-900/30 mb-4 shadow-inner">
                <Library size={36} />
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-wide">Welcome to LecTura</h2>
              <p className="text-xs text-slate-400 max-w-[300px] mt-2 leading-relaxed">
                Import YouTube playlist structures locally, manage courses, and download them for acceleration-supported offline viewing.
              </p>

              {/* Quick actions list */}
              <div className="w-full flex flex-col gap-2 mt-6">
                <button 
                  onClick={() => setIsImportOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md transition"
                >
                  <Plus size={16} /> Import Your First Playlist
                </button>
                <button 
                  onClick={() => setIsFolderOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-700/50 rounded-lg text-xs font-bold transition"
                >
                  <Plus size={16} /> Organize in Folders
                </button>
              </div>

              {/* Warn if setup missing */}
              {(!ytdlpReady || !ffmpegReady) && (
                <div 
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full mt-4 p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg flex items-center gap-2.5 text-left cursor-pointer hover:bg-amber-950/30 transition"
                >
                  <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
                  <div>
                    <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Dependencies missing</h4>
                    <p className="text-[10px] text-slate-400">Click to configure FFmpeg/yt-dlp for downloading.</p>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      {/* 3. SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0c1221] border border-slate-800 rounded-xl shadow-2xl overflow-hidden relative">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Settings size={15} className="text-blue-500" /> Settings & System Status
              </h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-xs text-slate-500 hover:text-white transition"
              >
                Close
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-4">
              
              {/* Dependencies status cards */}
              <div className="flex flex-col gap-2">
                
                {/* yt-dlp status */}
                <div className="p-3 bg-[#070a13] rounded-lg border border-slate-800/50 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">yt-dlp (Scraper/Downloader)</h4>
                    <p className="text-[9px] text-slate-500">Bundled locally inside the application bundle.</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ytdlpReady ? "bg-green-950/40 text-green-400 border border-green-900/30" : "bg-red-950/40 text-red-400 border border-red-900/30"}`}>
                    {ytdlpReady ? "Detected" : "Missing"}
                  </span>
                </div>

                {/* ffmpeg status */}
                <div className="p-3 bg-[#070a13] rounded-lg border border-slate-800/50 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">FFmpeg (Media Merger)</h4>
                    <p className="text-[9px] text-slate-500">Required for joining high-res streams.</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ffmpegReady ? "bg-green-950/40 text-green-400 border border-green-900/30" : "bg-red-950/40 text-red-400 border border-red-900/30"}`}>
                    {ffmpegReady ? "Detected" : "Missing"}
                  </span>
                </div>

              </div>

              {/* FFmpeg setup prompt */}
              {!ffmpegReady && (
                <div className="bg-[#121827] p-3 rounded-lg border border-slate-800 flex flex-col gap-2.5">
                  <p className="text-[10px] text-slate-400">
                    FFmpeg is missing. Click below to automatically download and configure it for your operating system.
                  </p>
                  <button 
                    onClick={handleFfmpegSetup}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-bold transition shadow"
                  >
                    Setup FFmpeg Dependency
                  </button>
                </div>
              )}

              {/* Download console output log */}
              <div className="bg-black/40 rounded-lg p-2.5 border border-slate-850/60 font-mono text-[9px] text-slate-400 min-h-[40px] flex items-center">
                <span className="break-all">{ffmpegStatusText}</span>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 4. PLAYLIST IMPORT MODAL */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0c1221] border border-slate-800 rounded-xl shadow-2xl overflow-hidden relative">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="text-blue-500" size={15} /> Import YouTube Course
              </h3>
              <button 
                onClick={() => { setIsImportOpen(false); setImportError(""); }}
                className="text-xs text-slate-500 hover:text-white transition"
                disabled={isImporting}
              >
                Cancel
              </button>
            </div>
            
            <form onSubmit={handleImportPlaylist} className="p-4 flex flex-col gap-4">
              
              {/* URL input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">YouTube Playlist/Video URL</label>
                <input 
                  type="text" 
                  placeholder="https://www.youtube.com/playlist?list=..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  disabled={isImporting}
                  className="bg-slate-900/80 border border-slate-850 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs focus:outline-none transition text-slate-100 placeholder-slate-600"
                  required
                />
              </div>

              {/* Target folder input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nesting Folder (Optional)</label>
                <select 
                  value={importFolderId} 
                  onChange={(e) => setImportFolderId(e.target.value)}
                  disabled={isImporting}
                  className="bg-slate-900/80 border border-slate-850 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs focus:outline-none transition text-slate-100"
                >
                  <option value="">Root / No folder</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Error warning box */}
              {importError && (
                <div className="p-2.5 bg-red-950/20 border border-red-900/40 rounded-lg flex items-start gap-2 text-[10px] text-red-400 leading-normal">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                  <span className="break-all">{importError}</span>
                </div>
              )}

              {/* Submit button */}
              <button 
                type="submit"
                disabled={isImporting}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg text-xs font-bold shadow-md transition flex items-center justify-center gap-1.5"
              >
                {isImporting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Scraping Playlist Metadata...
                  </>
                ) : (
                  "Import Course Struct"
                )}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* 5. FOLDER CREATE MODAL */}
      {isFolderOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0c1221] border border-slate-800 rounded-xl shadow-2xl overflow-hidden relative">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <FolderIcon className="text-blue-400" size={15} /> Create Folder
              </h3>
              <button 
                onClick={() => setIsFolderOpen(false)}
                className="text-xs text-slate-500 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
            
            <form onSubmit={handleCreateFolder} className="p-4 flex flex-col gap-4">
              
              {/* Folder name input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Folder Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Mathematics"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="bg-slate-900/80 border border-slate-850 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs focus:outline-none transition text-slate-100 placeholder-slate-600"
                  required
                />
              </div>

              {/* Nested Folder parent select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parent Folder (For Subfolders)</label>
                <select 
                  value={parentFolderId} 
                  onChange={(e) => setParentFolderId(e.target.value)}
                  className="bg-slate-900/80 border border-slate-850 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs focus:outline-none transition text-slate-100"
                >
                  <option value="">None / Root level</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <button 
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-md transition"
              >
                Create Folder
              </button>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
