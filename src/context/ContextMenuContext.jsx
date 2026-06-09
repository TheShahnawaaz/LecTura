import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";

// ─── Context ─────────────────────────────────────────────────────────
const ContextMenuCtx = createContext(null);

// ─── Menu Item Types ─────────────────────────────────────────────────
// { type: 'separator' }
// { icon: LucideIcon, label: string, shortcut?: string, action: fn, danger?: bool, disabled?: bool }

// ─── Menu Panel ──────────────────────────────────────────────────────
function MenuPanel({ x, y, items, onClose }) {
  const panelRef = useRef(null);

  // Clamp position so menu never goes off-screen
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    if (!panelRef.current) return;
    const { width, height } = panelRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      left: x + width > vw ? Math.max(0, vw - width - 8) : x,
      top: y + height > vh ? Math.max(0, vh - height - 8) : y,
    });
  }, [x, y]);

  return (
    <div
      ref={panelRef}
      className="fixed z-[9995] min-w-[200px] py-1 rounded-xl border border-border bg-card shadow-2xl shadow-black/30 animate-fade-in overflow-hidden"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return (
            <div
              key={i}
              className="my-1 mx-3 h-px bg-border"
            />
          );
        }

        const Icon = item.icon;
        return (
          <button
            key={i}
            disabled={!!item.disabled}
            onClick={() => {
              if (!item.disabled && item.action) {
                item.action();
              }
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors duration-100 text-left select-none
              ${item.disabled
                ? "opacity-40 cursor-not-allowed text-muted-foreground"
                : item.danger
                ? "text-destructive hover:bg-destructive/10 cursor-pointer"
                : "text-foreground hover:bg-muted/60 cursor-pointer"
              }
            `}
          >
            {Icon && (
              <Icon
                size={13}
                className={`flex-shrink-0 ${
                  item.disabled
                    ? "text-muted-foreground"
                    : item.danger
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              />
            )}
            <span className="flex-grow">{item.label}</span>
            {item.shortcut && (
              <kbd className="text-[9px] font-mono text-muted-foreground/60 bg-muted border border-border px-1.5 py-0.5 rounded-md ml-auto flex-shrink-0">
                {item.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────
export function ContextMenuProvider({ children }) {
  const [menu, setMenu] = useState(null);

  const showMenu = useCallback((e, items) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const hideMenu = useCallback(() => setMenu(null), []);

  // Global dismiss — mousedown outside or Escape
  useEffect(() => {
    if (!menu) return;
    const onMouseDown = () => hideMenu();
    const onKeyDown = (e) => {
      if (e.key === "Escape") hideMenu();
    };
    // Slight delay so the triggering click doesn't immediately close it
    const t = setTimeout(() => {
      window.addEventListener("mousedown", onMouseDown);
      window.addEventListener("keydown", onKeyDown);
    }, 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu, hideMenu]);

  return (
    <ContextMenuCtx.Provider value={{ showMenu, hideMenu }}>
      {children}
      {menu &&
        createPortal(
          <MenuPanel
            x={menu.x}
            y={menu.y}
            items={menu.items}
            onClose={hideMenu}
          />,
          document.body
        )}
    </ContextMenuCtx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────
export function useContextMenu() {
  const ctx = useContext(ContextMenuCtx);
  if (!ctx) throw new Error("useContextMenu must be used inside ContextMenuProvider");
  return ctx;
}
