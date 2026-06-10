import React, { useState } from "react";
import { FolderTree } from "./FolderTree";
import {
  Video,
  Plus,
  Library,
  Settings,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  ChevronsUpDown,
  Download,
  Copy,
  ExternalLink,
  Trash2,
  Play,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useContextMenu } from "../context/ContextMenuContext";
import { open as openBrowser } from "@tauri-apps/api/shell";
import logoIcon from "../assets/logo.png";

export function Sidebar({
  folders,
  playlists,
  selectedPlaylist,
  selectedFolderId,
  handleSelectFolder,
  expandedFolders,
  ytdlpReady,
  ffmpegReady,
  toggleFolder,
  handleSelectPlaylist,
  handleDeleteFolder,
  handleDownloadPlaylist,
  handleDeletePlaylistWithAssets,
  openNewSubfolderModal,
  openImportModal,
  setIsSettingsOpen,
  checkSystemStatus,
  isCollapsed,
  onToggleCollapse,
  appVersion,
  handleDragDropMove,
  draggedItem,
  setDraggedItem,
  onSelectFolderEmoji,
}) {
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const rootPlaylists = playlists.filter((p) => !p.folder_id);
  const isSystemReady = ytdlpReady && ffmpegReady;
  const { showMenu } = useContextMenu();

  const handleRootPlaylistContextMenu = (e, playlist) => {
    showMenu(e, [
      {
        icon: Play,
        label: "Open Course",
        shortcut: "Enter",
        action: () => handleSelectPlaylist(playlist),
      },
      {
        icon: Download,
        label: "Download All Lectures",
        disabled: !handleDownloadPlaylist,
        action: () => handleDownloadPlaylist && handleDownloadPlaylist(playlist.id),
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

  return (
    <aside
      className={`border-r border-border bg-card flex flex-col flex-shrink-0 select-none transition-all duration-200 ease-in-out h-full ${
        isCollapsed ? "w-[68px]" : "w-60"
      }`}
    >
      {/* ───── Sidebar Header / Branding ───── */}
      <div className="flex items-center justify-between p-4 h-14 border-b border-border">
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <img 
                src={logoIcon} 
                alt="LecTura Logo" 
                className="w-7 h-7 rounded-lg flex-shrink-0 shadow-sm border border-border object-cover" 
              />
              <div className="flex flex-col text-left leading-none min-w-0">
                <span className="font-bold text-sm text-foreground truncate">
                  LecTura
                </span>
                <span className="text-[10px] text-muted-foreground font-medium truncate">
                  Offline Player {appVersion ? `v${appVersion}` : ""}
                </span>
              </div>
            </div>
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors border border-border/40"
              title="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ) : (
          <div
            onMouseEnter={() => setIsHeaderHovered(true)}
            onMouseLeave={() => setIsHeaderHovered(false)}
            onClick={onToggleCollapse}
            className="w-full flex justify-center cursor-pointer py-1.5"
            title="Expand sidebar"
          >
            {isHeaderHovered ? (
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center transition-all duration-150">
                <ChevronRight size={16} />
              </div>
            ) : (
              <img 
                src={logoIcon} 
                alt="LecTura Logo" 
                className="w-7 h-7 rounded-lg flex-shrink-0 shadow-sm border border-border transition-all duration-150 object-cover" 
              />
            )}
          </div>
        )}
      </div>

      {/* ───── Primary Action Buttons ───── */}
      <div
        className={`px-3 py-3 flex border-b border-border/60 ${
          isCollapsed ? "flex-col gap-2.5 items-center" : "gap-2.5"
        }`}
      >
        {!isCollapsed ? (
          <>
            <button
              onClick={() => openImportModal && openImportModal(null)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/80 transition-colors cursor-pointer"
            >
              <Plus size={14} /> Playlist
            </button>
            <button
              onClick={() => openNewSubfolderModal && openNewSubfolderModal(null)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            >
              <FolderPlus size={14} /> Folder
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => openImportModal && openImportModal(null)}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors cursor-pointer"
              title="Import Playlist"
            >
              <Plus size={15} />
            </button>
            <button
              onClick={() => openNewSubfolderModal && openNewSubfolderModal(null)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              title="Create Folder"
            >
              <FolderPlus size={15} />
            </button>
          </>
        )}
      </div>

      {/* ───── Library Navigation Tree (Scrollable) ───── */}
      <nav
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOverRoot(true);
          e.dataTransfer.dropEffect = "move";
        }}
        onDragLeave={() => setIsDragOverRoot(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOverRoot(false);
          console.log("Root Drop Target - Dragged Item:", draggedItem);
          if (handleDragDropMove) {
            const draggedType = draggedItem?.type || e.dataTransfer.getData("itemType");
            const draggedId = draggedItem?.id || e.dataTransfer.getData("itemId");
            if (draggedId && draggedType) {
              console.log("Moving item to root:", draggedType, draggedId);
              handleDragDropMove(draggedType, draggedId, null);
            }
          }
          if (setDraggedItem) {
            setDraggedItem(null);
          }
        }}
        className={`flex-1 py-4 flex flex-col gap-4 px-3 overflow-y-auto overflow-x-hidden transition-all duration-150 ${
          isDragOverRoot ? "ring-2 ring-primary/45 ring-dashed bg-primary/5 rounded-lg" : ""
        }`}
      >
        {/* Section Label */}
        {!isCollapsed && (
          <span className="px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Library
          </span>
        )}

        {/* Recursive folder trees */}
        <div className="flex flex-col gap-1">
          <FolderTree
            folders={folders}
            playlists={playlists}
            selectedPlaylist={selectedPlaylist}
            selectedFolderId={selectedFolderId}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            handleSelectPlaylist={handleSelectPlaylist}
            handleSelectFolder={handleSelectFolder}
            handleDeleteFolder={handleDeleteFolder}
            handleDownloadPlaylist={handleDownloadPlaylist}
            handleDeletePlaylistWithAssets={handleDeletePlaylistWithAssets}
            openNewSubfolderModal={openNewSubfolderModal}
            openImportModal={openImportModal}
            isCollapsed={isCollapsed}
            onExpandSidebar={() => isCollapsed && onToggleCollapse()}
            handleDragDropMove={handleDragDropMove}
            draggedItem={draggedItem}
            setDraggedItem={setDraggedItem}
            onSelectFolderEmoji={onSelectFolderEmoji}
          />
        </div>

        {/* Root level playlists */}
        {rootPlaylists.length > 0 && (
          <div className="flex flex-col gap-1">
            {!isCollapsed && (
              <span className="px-3 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-1">
                Root Playlists
              </span>
            )}
            {rootPlaylists.map((playlist) => {
              const isSelected = selectedPlaylist?.id === playlist.id;
              return (
                <button
                  key={playlist.id}
                  onClick={() => {
                    handleSelectPlaylist(playlist);
                    if (isCollapsed) onToggleCollapse();
                  }}
                  onContextMenu={(e) => handleRootPlaylistContextMenu(e, playlist)}
                  draggable={true}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    console.log("Root Playlist Drag Start:", playlist.title, playlist.id);
                    if (setDraggedItem) {
                      setDraggedItem({ type: "playlist", id: playlist.id });
                    }
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", playlist.id);
                    e.dataTransfer.setData("itemType", "playlist");
                    e.dataTransfer.setData("itemId", playlist.id);
                  }}
                  onDragEnd={() => {
                    console.log("Root Playlist Drag End:", playlist.title);
                    if (setDraggedItem) {
                      setTimeout(() => setDraggedItem(null), 50);
                    }
                  }}
                  className={`flex drag-target-row items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm w-full text-left cursor-pointer ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  } ${isCollapsed ? "justify-center" : ""}`}
                  title={isCollapsed ? playlist.title : undefined}
                >
                  <Library size={18} className="flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="truncate text-xs">{playlist.title}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Empty state placeholder */}
        {folders.length === 0 && playlists.length === 0 && !isCollapsed && (
          <div className="text-center py-10 px-4 text-muted-foreground text-xs border border-dashed border-border rounded-lg mt-1 mx-1">
            <p className="italic opacity-60">
              No courses imported yet.
              <br />
              Use the buttons above to get started.
            </p>
          </div>
        )}
      </nav>

      {/* ───── Settings Button ───── */}
      <div
        className={`px-3 pb-2 ${
          isCollapsed ? "flex justify-center" : ""
        }`}
      >
        <button
          onClick={() => {
            setIsSettingsOpen(true);
            checkSystemStatus();
          }}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm w-full text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer ${
            isCollapsed ? "justify-center" : ""
          }`}
          title={isCollapsed ? "Settings" : undefined}
        >
          <Settings size={18} className="flex-shrink-0" />
          {!isCollapsed && <span className="truncate text-xs font-semibold">Settings</span>}
        </button>
      </div>

      {/* ───── Sidebar Footer / System Status ───── */}
      <div className="p-3 border-t border-border relative">
        <div
          className={`flex items-center gap-2 p-1.5 rounded-lg text-left w-full ${
            isCollapsed ? "justify-center" : ""
          }`}
        >
          {/* Status dot */}
          <span className="relative flex h-2 w-2 flex-shrink-0">
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
          {!isCollapsed && (
            <div className="flex flex-col leading-tight min-w-0 pr-1">
              <span className="text-[10px] font-semibold text-foreground truncate">
                {isSystemReady ? "System Ready" : "Setup Required"}
              </span>
              <span className="text-[9px] text-muted-foreground truncate">
                {isSystemReady ? "All dependencies OK" : "Missing binaries"}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
