import React from "react";
import { Folder, ChevronRight, ChevronDown, Trash2, Library } from "lucide-react";

export function FolderTree({
  folders,
  playlists,
  selectedPlaylist,
  expandedFolders,
  toggleFolder,
  handleSelectPlaylist,
  handleDeleteFolder,
  isCollapsed,
  onExpandSidebar,
}) {
  const renderFolderTree = (parentId = null, depth = 0) => {
    const levelFolders = folders.filter((f) => f.parent_id === parentId);

    return levelFolders.map((folder) => {
      const isExpanded = expandedFolders[folder.id];
      const subfolders = folders.filter((f) => f.parent_id === folder.id);
      const folderPlaylists = playlists.filter(
        (p) => p.folder_id === folder.id
      );
      const hasContent = subfolders.length > 0 || folderPlaylists.length > 0;

      return (
        <div
          key={folder.id}
          className="select-none w-full"
          style={{
            paddingLeft: !isCollapsed && depth > 0 ? "12px" : "0px",
          }}
        >
          {/* Folder row */}
          <div
            className={`group flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ${
              isCollapsed ? "justify-center h-8 w-8 mx-auto" : ""
            }`}
            title={isCollapsed ? folder.name : undefined}
          >
            <div
              className={`flex items-center gap-2.5 flex-grow min-w-0 ${
                isCollapsed ? "justify-center" : ""
              }`}
              onClick={() => {
                if (isCollapsed) {
                  onExpandSidebar();
                } else {
                  toggleFolder(folder.id);
                }
              }}
            >
              {!isCollapsed && (
                <span className="text-muted-foreground/50 flex-shrink-0 transition-colors">
                  {isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </span>
              )}
              <Folder
                size={16}
                className={`transition-colors flex-shrink-0 ${
                  isExpanded && !isCollapsed
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              />
              {!isCollapsed && (
                <span className="text-xs font-medium truncate">
                  {folder.name}
                </span>
              )}
            </div>

            {!isCollapsed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFolder(folder.id);
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
              {/* Recursive render child folders */}
              {renderFolderTree(folder.id, depth + 1)}

              {/* Render playlists nested in this folder */}
              {folderPlaylists.map((playlist) => {
                const isSelected = selectedPlaylist?.id === playlist.id;
                return (
                  <button
                    key={playlist.id}
                    onClick={() => handleSelectPlaylist(playlist)}
                    className={`flex items-center gap-2.5 py-2 px-4 rounded-lg cursor-pointer transition-colors text-sm w-full text-left ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Library
                      size={14}
                      className="flex-shrink-0"
                    />
                    <span className="truncate text-xs">{playlist.title}</span>
                  </button>
                );
              })}

              {/* Nested empty state */}
              {!hasContent && (
                <span className="text-[10px] text-muted-foreground/40 pl-5 py-1 italic">
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
