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
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Sidebar({
  folders,
  playlists,
  selectedPlaylist,
  expandedFolders,
  ytdlpReady,
  ffmpegReady,
  toggleFolder,
  handleSelectPlaylist,
  handleDeleteFolder,
  setIsImportOpen,
  setIsFolderOpen,
  setIsSettingsOpen,
  checkSystemStatus,
  isCollapsed,
  onToggleCollapse,
  appVersion,
}) {
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const rootPlaylists = playlists.filter((p) => !p.folder_id);
  const isSystemReady = ytdlpReady && ffmpegReady;

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
              <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-base flex-shrink-0 shadow-sm border border-border">
                L
              </div>
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
              <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-base shadow-sm border border-border transition-all duration-150">
                L
              </div>
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
              onClick={() => setIsImportOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/80 transition-colors cursor-pointer"
            >
              <Plus size={14} /> Playlist
            </button>
            <button
              onClick={() => setIsFolderOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            >
              <FolderPlus size={14} /> Folder
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setIsImportOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors cursor-pointer"
              title="Import Playlist"
            >
              <Plus size={15} />
            </button>
            <button
              onClick={() => setIsFolderOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              title="Create Folder"
            >
              <FolderPlus size={15} />
            </button>
          </>
        )}
      </div>

      {/* ───── Library Navigation Tree (Scrollable) ───── */}
      <nav className="flex-1 py-4 flex flex-col gap-4 px-3 overflow-y-auto overflow-x-hidden">
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
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            handleSelectPlaylist={handleSelectPlaylist}
            handleDeleteFolder={handleDeleteFolder}
            isCollapsed={isCollapsed}
            onExpandSidebar={() => isCollapsed && onToggleCollapse()}
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
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm w-full text-left cursor-pointer ${
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
