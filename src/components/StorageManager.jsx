import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import {
  HardDrive,
  FolderOpen,
  RefreshCw,
  Video,
  AlertCircle,
  ShieldAlert,
  Trash2,
  FolderOpen as FolderIcon,
  Search,
  Check,
  CheckCircle2,
  CheckSquare,
  Square,
  FileText,
  AlertTriangle,
  Play,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StorageManager({ onNavigateToPlaylist }) {
  const [report, setReport] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("healthy"); // Default first tab: "healthy"

  // Selected checkboxes
  const [selectedOrphans, setSelectedOrphans] = useState(new Set());
  const [selectedMissing, setSelectedMissing] = useState(new Set());

  // Search filters
  const [filteredOrphans, setFilteredOrphans] = useState([]);
  const [filteredMissing, setFilteredMissing] = useState([]);
  const [filteredHealthy, setFilteredHealthy] = useState([]);

  // Toast / Status state
  const [statusMessage, setStatusMessage] = useState(null); // { type: "success" | "error", text: string }

  const showStatus = (text, type = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4500);
  };

  const fetchPlaylists = async () => {
    try {
      const data = await invoke("get_playlists");
      setPlaylists(data || []);
    } catch (err) {
      console.error("Failed to fetch playlists:", err);
    }
  };

  const scan = async () => {
    setIsScanning(true);
    try {
      const data = await invoke("scan_storage");
      setReport(data);
      setSelectedOrphans(new Set());
      setSelectedMissing(new Set());
      await fetchPlaylists();
      showStatus("Storage audit completed successfully!");
    } catch (err) {
      console.error("Scan error:", err);
      showStatus(`Scan failed: ${err}`, "error");
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    scan();
  }, []);

  // Update filtered lists when report or searchQuery changes
  useEffect(() => {
    if (!report) return;

    const query = searchQuery.toLowerCase().trim();

    if (query === "") {
      setFilteredOrphans(report.orphaned_files);
      setFilteredMissing(report.missing_files);
      setFilteredHealthy(report.healthy_files);
    } else {
      setFilteredOrphans(
        report.orphaned_files.filter(
          (f) =>
            f.file_name.toLowerCase().includes(query) ||
            f.file_path.toLowerCase().includes(query)
        )
      );
      setFilteredMissing(
        report.missing_files.filter(
          (f) =>
            f.video_title.toLowerCase().includes(query) ||
            f.expected_path.toLowerCase().includes(query)
        )
      );
      setFilteredHealthy(
        report.healthy_files.filter(
          (f) =>
            f.video_title.toLowerCase().includes(query) ||
            f.file_path.toLowerCase().includes(query)
        )
      );
    }
  }, [report, searchQuery]);

  const handleOpenAppData = async () => {
    try {
      await invoke("open_app_data_folder");
      showStatus("App data folder opened!");
    } catch (err) {
      showStatus(`Failed to open folder: ${err}`, "error");
    }
  };

  const handleReveal = async (path) => {
    try {
      await invoke("reveal_in_explorer", { path });
      showStatus("File revealed in file explorer!");
    } catch (err) {
      showStatus(`Failed to reveal file: ${err}`, "error");
    }
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const getPlaylistName = (playlistId) => {
    if (!playlistId) return "Root Library";
    const p = playlists.find((p) => p.id === playlistId);
    return p ? p.title : "Unknown Playlist";
  };

  // Toggle Orphan Selection
  const toggleOrphan = (path) => {
    const next = new Set(selectedOrphans);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedOrphans(next);
  };

  // Toggle Missing Selection
  const toggleMissing = (id) => {
    const next = new Set(selectedMissing);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedMissing(next);
  };

  // Run Cleaning / Healing operations
  const runCleanup = async (orphansToClean, missingToHeal) => {
    if (orphansToClean.length === 0 && missingToHeal.length === 0) return;
    
    setIsCleaning(true);
    try {
      await invoke("clean_storage", {
        deleteOrphans: orphansToClean,
        healMissingIds: missingToHeal,
      });
      showStatus("Storage clean / heal execution complete!");
      await scan();
    } catch (err) {
      console.error("Cleanup error:", err);
      showStatus(`Cleanup failed: ${err}`, "error");
    } finally {
      setIsCleaning(false);
    }
  };

  // Delete individual downloaded video file
  const handleDeleteHealthyFile = async (video) => {
    if (
      !confirm(
        `Are you sure you want to delete the offline file for "${video.video_title}"?\nThis removes it from disk but keeps the database entry (automatically falling back to streaming).`
      )
    ) {
      return;
    }

    try {
      setIsCleaning(true);
      await invoke("delete_video_file", { videoId: video.video_id });
      showStatus("Offline file deleted successfully.");
      await scan();
    } catch (err) {
      console.error("Failed to delete video file:", err);
      showStatus(`Deletion failed: ${err}`, "error");
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* HEADER SECTION */}
      <header className="flex flex-wrap items-center justify-between gap-4 p-6 border-b border-border bg-card/10">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Storage & System Health</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit offline files, clean orphaned video caches, and repair missing database references.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {statusMessage && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold animate-in fade-in slide-in-from-top duration-250 ${
                statusMessage.type === "error"
                  ? "bg-destructive/15 text-destructive border border-destructive/25"
                  : "bg-primary/10 text-primary border border-primary/20"
              }`}
            >
              {statusMessage.type === "error" ? (
                <AlertCircle size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              {statusMessage.text}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenAppData}
            className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer border border-border bg-card hover:bg-muted/70 transition-colors"
          >
            <FolderOpen size={14} />
            Open App Data Folder
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={scan}
            disabled={isScanning}
            className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} />
            {isScanning ? "Scanning..." : "Audit Storage"}
          </Button>
        </div>
      </header>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 flex-shrink-0">
        {/* Card 1: Offline Lectures */}
        <div className="p-4 rounded-xl border border-border bg-card/40 flex items-start justify-between hover:border-border/80 transition-all duration-200 shadow-sm relative group overflow-hidden">
          <div className="flex flex-col gap-1 z-10">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Offline Lectures
            </span>
            <span className="text-xl font-bold mt-1">
              {report ? report.healthy_files.length : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Size: {report ? formatBytes(report.total_healthy_size_bytes) : "—"}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary z-10 transition-transform duration-200 group-hover:scale-105">
            <Video size={18} />
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        </div>

        {/* Card 2: Wasted Cache (Orphans) */}
        <div className="p-4 rounded-xl border border-border bg-card/40 flex items-start justify-between hover:border-border/80 transition-all duration-200 shadow-sm relative group overflow-hidden">
          <div className="flex flex-col gap-1 z-10">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Wasted Cache
            </span>
            <span className="text-xl font-bold mt-1 text-amber-500">
              {report ? report.orphaned_files.length : "—"}
            </span>
            <span className="text-[10px] text-amber-500/90 font-medium mt-0.5">
              Space: {report ? formatBytes(report.total_orphaned_size_bytes) : "—"}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500 z-10 transition-transform duration-200 group-hover:scale-105">
            <ShieldAlert size={18} />
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        </div>

        {/* Card 3: Broken References */}
        <div className="p-4 rounded-xl border border-border bg-card/40 flex items-start justify-between hover:border-border/80 transition-all duration-200 shadow-sm relative group overflow-hidden">
          <div className="flex flex-col gap-1 z-10">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Broken DB Links
            </span>
            <span className="text-xl font-bold mt-1 text-rose-500">
              {report ? report.missing_files.length : "—"}
            </span>
            <span className="text-[10px] text-rose-500/90 font-medium mt-0.5">
              Requires heal: {report ? report.missing_files.length : "—"}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-500 z-10 transition-transform duration-200 group-hover:scale-105">
            <AlertCircle size={18} />
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        </div>

        {/* Card 4: Directory Size & Status */}
        <div className="p-4 rounded-xl border border-border bg-card/40 flex items-start justify-between hover:border-border/80 transition-all duration-200 shadow-sm relative group overflow-hidden">
          <div className="flex flex-col gap-1 z-10">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              App Directory Size
            </span>
            <span className="text-sm font-semibold mt-1 truncate max-w-[150px]">
              Total: {report ? formatBytes(report.app_dir_size_bytes) : "—"}
            </span>
            <span className="text-[9px] text-muted-foreground mt-0.5 leading-normal">
              SQLite DB: {report ? formatBytes(report.db_file_size_bytes) : "—"}
              <br />
              FFmpeg: {report?.ffmpeg_ready ? "🟢 Active" : "🔴 Missing"} | yt-dlp: {report?.ytdlp_ready ? "🟢 Active" : "🔴 Missing"}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 z-10 transition-transform duration-200 group-hover:scale-105">
            <HardDrive size={18} />
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
        </div>
      </div>

      {/* SEARCH AND TABS CONTROLLER (Enhanced Tab Switched design) */}
      <div className="px-6 py-4 flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 bg-card/10">
        {/* iOS style segment controller tabs */}
        <div className="flex bg-muted/40 p-1 rounded-lg border border-border shrink-0 select-none">
          <button
            onClick={() => {
              setActiveTab("healthy");
              setSearchQuery("");
            }}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              activeTab === "healthy"
                ? "bg-card text-primary font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Downloaded Videos ({report ? report.healthy_files.length : 0})
          </button>
          <button
            onClick={() => {
              setActiveTab("orphans");
              setSearchQuery("");
            }}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              activeTab === "orphans"
                ? "bg-card text-foreground font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Orphaned Files ({report ? report.orphaned_files.length : 0})
          </button>
          <button
            onClick={() => {
              setActiveTab("missing");
              setSearchQuery("");
            }}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              activeTab === "missing"
                ? "bg-card text-foreground font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Missing Links ({report ? report.missing_files.length : 0})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={`Search ${
              activeTab === "healthy"
                ? "downloads"
                : activeTab === "orphans"
                ? "orphans"
                : "missing links"
            }...`}
            className="pl-9 h-9 bg-card/30 border-border text-xs focus:ring-1 focus:ring-primary focus-visible:ring-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ACTIONS BAR FOR MASS CLEAN / HEAL */}
      {activeTab === "orphans" && report && report.orphaned_files.length > 0 && (
        <div className="px-6 py-2.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center justify-between text-xs text-amber-500/90 flex-shrink-0 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={14} className="text-amber-500" />
            <span>
              {selectedOrphans.size} of {filteredOrphans.length} file(s) selected (Wasted: {formatBytes(filteredOrphans.filter(o => selectedOrphans.has(o.file_path)).reduce((acc, curr) => acc + curr.file_size_bytes, 0))})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                if (selectedOrphans.size === filteredOrphans.length) {
                  setSelectedOrphans(new Set());
                } else {
                  setSelectedOrphans(new Set(filteredOrphans.map(o => o.file_path)));
                }
              }}
              className="text-[10px] h-7 px-2 font-semibold cursor-pointer border border-border bg-card text-foreground"
            >
              {selectedOrphans.size === filteredOrphans.length ? "Deselect All" : "Select All"}
            </Button>
            <Button
              variant="destructive"
              size="xs"
              disabled={selectedOrphans.size === 0 || isCleaning}
              onClick={() => {
                const arr = Array.from(selectedOrphans);
                if (confirm(`Are you sure you want to permanently delete these ${arr.length} orphaned files? This cannot be undone.`)) {
                  runCleanup(arr, []);
                }
              }}
              className="text-[10px] h-7 px-2.5 bg-rose-600 text-white hover:bg-rose-500 flex items-center gap-1 cursor-pointer font-bold disabled:opacity-50"
            >
              <Trash2 size={11} />
              Delete Selected
            </Button>
            <Button
              variant="destructive"
              size="xs"
              disabled={isCleaning}
              onClick={() => {
                const arr = report.orphaned_files.map((o) => o.file_path);
                if (confirm(`Permanently delete ALL ${arr.length} orphaned files from your laptop?`)) {
                  runCleanup(arr, []);
                }
              }}
              className="text-[10px] h-7 px-2.5 bg-rose-700/60 border border-rose-700/40 text-rose-200 hover:bg-rose-700/80 cursor-pointer font-bold"
            >
              Clean All ({report.orphaned_files.length})
            </Button>
          </div>
        </div>
      )}

      {activeTab === "missing" && report && report.missing_files.length > 0 && (
        <div className="px-6 py-2.5 bg-rose-500/5 border-b border-rose-500/10 flex items-center justify-between text-xs text-rose-400 flex-shrink-0 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle size={14} className="text-rose-500" />
            <span>
              {selectedMissing.size} of {filteredMissing.length} broken database record(s) selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                if (selectedMissing.size === filteredMissing.length) {
                  setSelectedMissing(new Set());
                } else {
                  setSelectedMissing(new Set(filteredMissing.map(m => m.video_id)));
                }
              }}
              className="text-[10px] h-7 px-2 font-semibold cursor-pointer border border-border bg-card text-foreground"
            >
              {selectedMissing.size === filteredMissing.length ? "Deselect All" : "Select All"}
            </Button>
            <Button
              variant="primary"
              size="xs"
              disabled={selectedMissing.size === 0 || isCleaning}
              onClick={() => {
                const arr = Array.from(selectedMissing);
                if (confirm(`Heal these ${arr.length} database entries? This resets their status to online streaming.`)) {
                  runCleanup([], arr);
                }
              }}
              className="text-[10px] h-7 px-2.5 bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-1 cursor-pointer font-bold disabled:opacity-50"
            >
              <Check size={11} />
              Heal Selected
            </Button>
            <Button
              variant="primary"
              size="xs"
              disabled={isCleaning}
              onClick={() => {
                const arr = report.missing_files.map((m) => m.video_id);
                if (confirm(`Reset and heal ALL ${arr.length} database entries?`)) {
                  runCleanup([], arr);
                }
              }}
              className="text-[10px] h-7 px-2.5 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 cursor-pointer font-bold"
            >
              Heal All ({report.missing_files.length})
            </Button>
          </div>
        </div>
      )}

      {/* SCROLLABLE DATA TABLE */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6 pt-4">
            {isScanning && !report && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-xs gap-3">
                <RefreshCw className="animate-spin text-primary" size={24} />
                <span>Auditing download folder and parsing database indexes...</span>
              </div>
            )}

            {/* TAB CONTENT: HEALTHY DOWNLOADS (Default / First Tab) */}
            {activeTab === "healthy" && report && (
              <>
                <div className="mb-3 px-1 text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>List of successfully downloaded lectures residing on this machine.</span>
                  <span>{filteredHealthy.length} items found</span>
                </div>

                {filteredHealthy.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground/80 border border-dashed border-border/80 rounded-xl bg-card/10 mt-2">
                    <FileText className="mx-auto text-muted-foreground mb-3 opacity-50" size={28} />
                    <span className="text-xs font-semibold block">No Offline Lectures Available</span>
                    <span className="text-[10px] opacity-75 mt-1 block">Import a course and download its lectures to see them audited here.</span>
                  </div>
                ) : (
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-card/25 shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-card/90 border-b border-border/80 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          <th className="p-3.5">Lecture Name (Jump to video)</th>
                          <th className="p-3.5">Course / Playlist</th>
                          <th className="p-3.5">File Path</th>
                          <th className="p-3.5 w-24 text-right">Size</th>
                          <th className="p-3.5 w-24 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHealthy.map((video, idx) => (
                          <tr key={idx} className="border-b border-border/40 hover:bg-muted/15 transition-colors">
                            <td className="p-3.5 font-medium truncate max-w-[260px]">
                              <button
                                onClick={() => onNavigateToPlaylist && onNavigateToPlaylist(video.playlist_id, video.video_id)}
                                className="text-left font-semibold text-primary hover:underline transition-colors flex items-center gap-1 group cursor-pointer"
                                title="Open in Player view"
                              >
                                {video.video_title}
                                <Play size={10} className="opacity-0 group-hover:opacity-100 transition-opacity text-primary flex-shrink-0" />
                              </button>
                            </td>
                            <td className="p-3.5 truncate max-w-[160px]">
                              {video.playlist_id ? (
                                <button
                                  onClick={() => onNavigateToPlaylist && onNavigateToPlaylist(video.playlist_id)}
                                  className="text-[11px] font-semibold text-muted-foreground hover:text-primary hover:underline transition-colors cursor-pointer flex items-center gap-1"
                                  title="Go to Course page"
                                >
                                  {getPlaylistName(video.playlist_id)}
                                  <ArrowRight size={9} className="opacity-60" />
                                </button>
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">Root Library</span>
                              )}
                            </td>
                            <td className="p-3.5 text-muted-foreground font-mono text-[10px] truncate max-w-[220px]" title={video.file_path}>
                              {video.file_path}
                            </td>
                            <td className="p-3.5 text-right font-medium text-muted-foreground">
                              {formatBytes(video.file_size_bytes)}
                            </td>
                            <td className="p-3.5 text-center flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleReveal(video.file_path)}
                                className="p-1.5 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                                title="Reveal in Finder/Explorer"
                              >
                                <FolderIcon size={13.5} />
                              </button>
                              <button
                                onClick={() => handleDeleteHealthyFile(video)}
                                className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 transition-all cursor-pointer"
                                title="Delete Offline File"
                              >
                                <Trash2 size={13.5} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* TAB CONTENT: ORPHANS */}
            {activeTab === "orphans" && report && (
              <>
                <div className="mb-3 px-1 text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>File caches left in downloads directory that do not have database references.</span>
                  <span>{filteredOrphans.length} files found</span>
                </div>

                {filteredOrphans.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground/80 border border-dashed border-border/80 rounded-xl bg-card/10 mt-2">
                    <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={28} />
                    <span className="text-xs font-semibold block">Cache is Clean</span>
                    <span className="text-[10px] opacity-75 mt-1 block">All local video files match active database references!</span>
                  </div>
                ) : (
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-card/25 shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-card/90 border-b border-border/80 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          <th className="p-3.5 w-10 text-center">
                            <button
                              onClick={() => {
                                if (selectedOrphans.size === filteredOrphans.length) {
                                  setSelectedOrphans(new Set());
                                } else {
                                  setSelectedOrphans(new Set(filteredOrphans.map(o => o.file_path)));
                                }
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              {selectedOrphans.size === filteredOrphans.length ? (
                                <CheckSquare size={15} className="text-primary" />
                              ) : (
                                <Square size={15} />
                              )}
                            </button>
                          </th>
                          <th className="p-3.5">File Name</th>
                          <th className="p-3.5">Disk Location</th>
                          <th className="p-3.5 w-24 text-right">File Size</th>
                          <th className="p-3.5 w-20 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrphans.map((file, idx) => {
                          const isChecked = selectedOrphans.has(file.file_path);
                          return (
                            <tr
                              key={idx}
                              onClick={() => toggleOrphan(file.file_path)}
                              className={`border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer ${
                                isChecked ? "bg-primary/5 hover:bg-primary/10" : ""
                              }`}
                            >
                              <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => toggleOrphan(file.file_path)}
                                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                >
                                  {isChecked ? (
                                    <CheckSquare size={15} className="text-primary" />
                                  ) : (
                                    <Square size={15} />
                                  )}
                                </button>
                              </td>
                              <td className="p-3.5 font-medium truncate max-w-[220px]" title={file.file_name}>
                                {file.file_name}
                              </td>
                              <td className="p-3.5 text-muted-foreground font-mono text-[10px] truncate max-w-[340px]" title={file.file_path}>
                                {file.file_path}
                              </td>
                              <td className="p-3.5 text-right font-medium text-muted-foreground">
                                {formatBytes(file.file_size_bytes)}
                              </td>
                              <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    if (confirm(`Permanently delete this orphaned cache file?\n${file.file_name}`)) {
                                      runCleanup([file.file_path], []);
                                    }
                                  }}
                                  className="p-1.5 rounded text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors cursor-pointer"
                                  title="Permanently Delete File"
                                >
                                  <Trash2 size={13.5} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* TAB CONTENT: MISSING */}
            {activeTab === "missing" && report && (
              <>
                <div className="mb-3 px-1 text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>Database entries marked downloaded but missing physical files on your disk.</span>
                  <span>{filteredMissing.length} records found</span>
                </div>

                {filteredMissing.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground/80 border border-dashed border-border/80 rounded-xl bg-card/10 mt-2">
                    <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={28} />
                    <span className="text-xs font-semibold block">All Links are Healthy</span>
                    <span className="text-[10px] opacity-75 mt-1 block">No missing local video files detected in database records!</span>
                  </div>
                ) : (
                  <div className="border border-border/60 rounded-xl overflow-hidden bg-card/25 shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-card/90 border-b border-border/80 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          <th className="p-3.5 w-10 text-center">
                            <button
                              onClick={() => {
                                if (selectedMissing.size === filteredMissing.length) {
                                  setSelectedMissing(new Set());
                                } else {
                                  setSelectedMissing(new Set(filteredMissing.map(m => m.video_id)));
                                }
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              {selectedMissing.size === filteredMissing.length ? (
                                <CheckSquare size={15} className="text-primary" />
                              ) : (
                                <Square size={15} />
                              )}
                            </button>
                          </th>
                          <th className="p-3.5">Lecture Title (Jump to video)</th>
                          <th className="p-3.5">Course / Playlist</th>
                          <th className="p-3.5">Expected Path</th>
                          <th className="p-3.5 w-20 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMissing.map((video, idx) => {
                          const isChecked = selectedMissing.has(video.video_id);
                          return (
                            <tr
                              key={idx}
                              onClick={() => toggleMissing(video.video_id)}
                              className={`border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer ${
                                isChecked ? "bg-primary/5 hover:bg-primary/10" : ""
                              }`}
                            >
                              <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => toggleMissing(video.video_id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                >
                                  {isChecked ? (
                                    <CheckSquare size={15} className="text-primary" />
                                  ) : (
                                    <Square size={15} />
                                  )}
                                </button>
                              </td>
                              <td className="p-3.5 font-medium truncate max-w-[240px]">
                                <button
                                  onClick={() => onNavigateToPlaylist && onNavigateToPlaylist(video.playlist_id, video.video_id)}
                                  className="text-left font-semibold text-rose-400 hover:underline transition-colors flex items-center gap-1 group cursor-pointer"
                                  title="Go to video page"
                                >
                                  {video.video_title}
                                  <Play size={10} className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 flex-shrink-0" />
                                </button>
                              </td>
                              <td className="p-3.5 truncate max-w-[160px]">
                                {video.playlist_id ? (
                                  <button
                                    onClick={() => onNavigateToPlaylist && onNavigateToPlaylist(video.playlist_id)}
                                    className="text-[11px] font-semibold text-muted-foreground hover:text-primary hover:underline transition-colors cursor-pointer flex items-center gap-1"
                                    title="Go to Course page"
                                  >
                                    {getPlaylistName(video.playlist_id)}
                                    <ArrowRight size={9} className="opacity-60" />
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground italic">Root Library</span>
                                )}
                              </td>
                              <td className="p-3.5 text-rose-400 font-mono text-[10px] truncate max-w-[240px]" title={video.expected_path}>
                                {video.expected_path}
                              </td>
                              <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    if (confirm(`Reset database link for "${video.video_title}" to restore online streaming?`)) {
                                      runCleanup([], [video.video_id]);
                                    }
                                  }}
                                  className="p-1.5 rounded text-primary hover:bg-primary/15 transition-colors cursor-pointer"
                                  title="Heal Database Link"
                                >
                                  <CheckCircle2 size={13.5} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
