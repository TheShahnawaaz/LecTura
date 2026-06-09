import React, { useState, useEffect, useRef } from "react";
import { Search, Folder, Library, Play, CornerDownLeft, Loader2, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/tauri";

export function CommandPalette({ isOpen, onClose, onSelectResult, folders = [] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Query database as user types
  useEffect(() => {
    if (!isOpen) return;
    if (query.trim() === "") {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const delayDebounce = setTimeout(() => {
      invoke("search_library", { query })
        .then((data) => {
          setResults(data || []);
          setSelectedIndex(0);
        })
        .catch((err) => {
          console.error("Search failed:", err);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 150);

    return () => clearTimeout(delayDebounce);
  }, [query, isOpen]);

  // Handle keyboard navigation inside the list
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIndex]) {
          triggerSelect(results[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      const activeEl = listRef.current.children[selectedIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, results]);

  const triggerSelect = (item) => {
    onSelectResult(item);
    onClose();
  };

  if (!isOpen) return null;

  const getItemIcon = (item) => {
    switch (item.item_type) {
      case "folder": {
        if (item.emoji) {
          return (
            <span className="text-sm shrink-0 leading-none select-none w-[15px] h-[15px] flex items-center justify-center">
              {item.emoji}
            </span>
          );
        }
        const folderMatch = folders.find((f) => f.id === item.id);
        if (folderMatch?.emoji) {
          return (
            <span className="text-sm shrink-0 leading-none select-none w-[15px] h-[15px] flex items-center justify-center">
              {folderMatch.emoji}
            </span>
          );
        }
        return <Folder size={15} className="text-blue-500 flex-shrink-0" />;
      }
      case "playlist":
        return <Library size={15} className="text-violet-500 flex-shrink-0" />;
      case "video":
        return <Play size={14} className="text-emerald-500 flex-shrink-0" fill="currentColor" />;
      default:
        return <Search size={15} className="text-muted-foreground flex-shrink-0" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[450px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input area */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
          <Search size={16} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none border-none h-6"
            placeholder="Search folders, courses, lectures..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading ? (
            <Loader2 size={14} className="text-muted-foreground animate-spin flex-shrink-0" />
          ) : query ? (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground cursor-pointer flex-shrink-0"
            >
              <X size={14} />
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded border border-border bg-muted/40 font-mono flex-shrink-0">
              ESC
            </span>
          )}
        </div>

        {/* Results area */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 max-h-[360px]"
        >
          {query.trim() === "" ? (
            <div className="py-8 px-4 text-center flex flex-col items-center justify-center gap-1.5 text-muted-foreground/75 select-none">
              <Search size={22} className="text-muted-foreground/45" />
              <p className="text-xs font-semibold">Search LecTura Library</p>
              <p className="text-[10px] text-muted-foreground/50 max-w-[280px]">
                Search for any folder, downloaded course, or video title instantly.
              </p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-8 px-4 text-center flex flex-col items-center justify-center gap-1.5 text-muted-foreground/75 select-none">
              <span className="text-muted-foreground/45 text-lg">🔍</span>
              <p className="text-xs font-semibold">No results found</p>
              <p className="text-[10px] text-muted-foreground/50 max-w-[280px]">
                No match for "{query}" in folders, courses, or videos.
              </p>
            </div>
          ) : (
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={`${item.item_type}-${item.id}`}
                  onClick={() => triggerSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors text-left w-full select-none gap-3 ${
                    isSelected
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground/80 hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getItemIcon(item)}
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span className="text-xs font-bold truncate">
                        {item.title}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-semibold truncate leading-none">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex items-center gap-1 text-[9px] text-primary/70 font-semibold flex-shrink-0 animate-fade-in">
                      <span>Select</span>
                      <CornerDownLeft size={10} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
