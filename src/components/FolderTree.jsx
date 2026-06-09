import React from "react";
import {
  Folder,
  Trash2,
  Library,
  FolderPlus,
  Download,
  ExternalLink,
  Copy,
  Play,
  FolderOpen,
  Smile,
} from "lucide-react";
import { useContextMenu } from "../context/ContextMenuContext";
import { open as openBrowser } from "@tauri-apps/api/shell";

export function FolderTree({
  folders,
  playlists,
  selectedPlaylist,
  selectedFolderId,
  expandedFolders,
  toggleFolder,
  handleSelectPlaylist,
  handleSelectFolder,
  handleDeleteFolder,
  handleDownloadPlaylist,
  handleDeletePlaylistWithAssets,
  openNewSubfolderModal,
  openImportModal,
  isCollapsed,
  onExpandSidebar,
  handleDragDropMove,
  draggedItem,
  setDraggedItem,
  onSelectFolderEmoji,
}) {
  const { showMenu } = useContextMenu();
  const [dragOverFolderId, setDragOverFolderId] = React.useState(null);

  const isDescendantOf = (parentFolderId, childFolderId) => {
    let current = folders.find((f) => f.id === childFolderId);
    while (current && current.parent_id) {
      if (current.parent_id === parentFolderId) return true;
      current = folders.find((f) => f.id === current.parent_id);
    }
    return false;
  };

  const isValidDropTarget = (targetFolderId) => {
    if (!draggedItem) return false;
    if (draggedItem.type === "folder") {
      if (draggedItem.id === targetFolderId) return false;
      if (isDescendantOf(draggedItem.id, targetFolderId)) return false;
    }
    return true;
  };

  const handleFolderContextMenu = (e, folder) => {
    showMenu(e, [
      {
        icon: FolderOpen,
        label: "Open Folder",
        action: () => {
          handleSelectFolder(folder.id);
          if (!expandedFolders[folder.id]) toggleFolder(folder.id);
          if (isCollapsed) onExpandSidebar();
        },
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
        action: () => handleDeleteFolder(folder),
      },
    ]);
  };

  const handlePlaylistContextMenu = (e, playlist) => {
    showMenu(e, [
      {
        icon: Play,
        label: "Open Playlist",
        shortcut: "Enter",
        action: () => handleSelectPlaylist(playlist),
      },
      {
        icon: Download,
        label: "Download All Lectures",
        action: () => handleDownloadPlaylist && handleDownloadPlaylist(playlist.id),
        disabled: !handleDownloadPlaylist,
      },
      { type: "separator" },
      {
        icon: Copy,
        label: "Copy URL",
        action: () => {
          if (playlist.url) navigator.clipboard.writeText(playlist.url);
        },
        disabled: !playlist.url,
      },
      {
        icon: ExternalLink,
        label: "Open in Browser",
        action: () => {
          if (playlist.url) openBrowser(playlist.url);
        },
        disabled: !playlist.url,
      },
      { type: "separator" },
      {
        icon: Trash2,
        label: "Delete Course",
        danger: true,
        action: () => handleDeletePlaylistWithAssets && handleDeletePlaylistWithAssets(playlist),
        disabled: !handleDeletePlaylistWithAssets,
      },
    ]);
  };

  const renderFolderTree = (parentId = null, depth = 0) => {
    const levelFolders = folders.filter((f) => f.parent_id === parentId);

    return levelFolders.map((folder) => {
      const isExpanded = expandedFolders[folder.id];
      const subfolders = folders.filter((f) => f.parent_id === folder.id);
      const folderPlaylists = playlists.filter((p) => p.folder_id === folder.id);
      const hasContent = subfolders.length > 0 || folderPlaylists.length > 0;
      const isSelected = selectedFolderId === folder.id && !selectedPlaylist;

      return (
        <div
          key={folder.id}
          className="select-none w-full"
          style={{
            paddingLeft: "0px",
          }}
        >
          {/* Folder row */}
          <div
            onClick={() => {
              handleSelectFolder(folder.id);
              toggleFolder(folder.id);
              if (isCollapsed) onExpandSidebar();
            }}
            onContextMenu={(e) => handleFolderContextMenu(e, folder)}
            draggable={true}
            onDragStart={(e) => {
              e.stopPropagation();
              console.log("Folder Drag Start:", folder.name, folder.id);
              setDraggedItem({ type: "folder", id: folder.id });
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", folder.id);
              e.dataTransfer.setData("itemType", "folder");
              e.dataTransfer.setData("itemId", folder.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isValidDropTarget(folder.id)) {
                e.dataTransfer.dropEffect = "move";
              } else {
                e.dataTransfer.dropEffect = "none";
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const valid = isValidDropTarget(folder.id);
              console.log("Folder Drag Enter:", folder.name, "Valid target:", valid);
              if (valid) {
                setDragOverFolderId(folder.id);
              }
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragOverFolderId === folder.id) {
                setDragOverFolderId(null);
              }
            }}
            onDragEnd={() => {
              console.log("Folder Drag End:", folder.name);
              setDragOverFolderId(null);
              setTimeout(() => setDraggedItem(null), 50);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverFolderId(null);
              const targetFolderId = folder.id;
              const draggedType = draggedItem?.type || e.dataTransfer.getData("itemType");
              const draggedId = draggedItem?.id || e.dataTransfer.getData("itemId");
              console.log("Folder Drop Target:", targetFolderId, "Dragged Type:", draggedType, "Dragged ID:", draggedId);
              
              if (draggedId && draggedType) {
                if (draggedType === "folder") {
                  if (draggedId === targetFolderId || isDescendantOf(draggedId, targetFolderId)) {
                    console.log("Drop rejected: invalid target (cycle or self)");
                    setDraggedItem(null);
                    return;
                  }
                }
                
                if (handleDragDropMove) {
                  console.log("Moving item:", draggedType, draggedId, "to folder:", targetFolderId);
                  handleDragDropMove(draggedType, draggedId, targetFolderId);
                }
              }
              setDraggedItem(null);
            }}
            className={`group drag-target-row flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors ${
              isCollapsed ? "justify-center h-8 w-8 mx-auto" : ""
            } ${
              isSelected
                ? "bg-primary/15 text-primary font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            } ${
              dragOverFolderId === folder.id ? "ring-2 ring-primary ring-dashed bg-primary/10" : ""
            }`}
            title={isCollapsed ? folder.name : undefined}
          >
            <div
              className={`flex items-center gap-2 flex-grow min-w-0 ${
                isCollapsed ? "justify-center" : ""
              }`}
            >
              {folder.emoji ? (
                <span className="text-sm shrink-0 leading-none select-none w-4 h-4 flex items-center justify-center">
                  {folder.emoji}
                </span>
              ) : isExpanded && !isCollapsed ? (
                <FolderOpen
                  size={16}
                  className={`transition-colors flex-shrink-0 ${
                    isSelected
                      ? "text-primary"
                      : "text-foreground/80"
                  }`}
                />
              ) : (
                <Folder
                  size={16}
                  className={`transition-colors flex-shrink-0 ${
                    isSelected
                      ? "text-primary"
                      : "text-muted-foreground/80"
                  }`}
                />
              )}
              {!isCollapsed && (
                <span className="text-xs font-medium truncate ml-1">
                  {folder.name}
                </span>
              )}
            </div>

            {!isCollapsed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFolder(folder);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                title="Delete folder"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Expanded folder contents */}
          {isExpanded && !isCollapsed && (
            <div className="border-l border-border/60 ml-[18px] my-0.5 flex flex-col gap-0.5">
              {/* Recursive child folders */}
              {renderFolderTree(folder.id, depth + 1)}

              {/* Playlists nested in this folder */}
              {folderPlaylists.map((playlist) => {
                const isPlaylistSelected = selectedPlaylist?.id === playlist.id;
                return (
                  <button
                    key={playlist.id}
                    onClick={() => handleSelectPlaylist(playlist)}
                    onContextMenu={(e) => handlePlaylistContextMenu(e, playlist)}
                    draggable={true}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      console.log("Nested Playlist Drag Start:", playlist.title, playlist.id);
                      setDraggedItem({ type: "playlist", id: playlist.id });
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", playlist.id);
                      e.dataTransfer.setData("itemType", "playlist");
                      e.dataTransfer.setData("itemId", playlist.id);
                    }}
                    onDragEnd={() => {
                      console.log("Nested Playlist Drag End:", playlist.title);
                      setTimeout(() => setDraggedItem(null), 50);
                    }}
                    className={`flex drag-target-row items-center gap-2.5 py-2 px-2 rounded-lg cursor-pointer transition-colors text-sm w-full text-left ${
                      isPlaylistSelected
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Library size={14} className="flex-shrink-0" />
                    <span className="truncate text-xs">{playlist.title}</span>
                  </button>
                );
              })}

              {/* Empty folder hint */}
              {!hasContent && (
                <span className="text-[10px] text-muted-foreground/45 pl-2 py-1.5 italic">
                  Empty folder
                </span>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col gap-0.5 w-full">
      {renderFolderTree(null, 0)}
    </div>
  );
}
