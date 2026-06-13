import React, { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Brush, 
  Eraser, 
  Type, 
  Undo, 
  Trash2, 
  HelpCircle, 
  Bookmark, 
  Save, 
  X,
  Sparkles,
} from "lucide-react";

export function BookmarkModal({
  isOpen,
  onClose,
  screenshotUrl, // Data URL or Image URL
  videoId,
  timestamp,
  videoTitle,
  onSave, // (label, notes, finalScreenshotDataUrl, isDoubt) => Promise
  initialLabel = "",
  initialNotes = "",
  initialIsDoubt = false,
  container,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  const [tool, setTool] = useState("brush"); // "brush", "eraser", "text"
  const [color, setColor] = useState("#8b5cf6"); // Purple/Primary default
  const [brushSize, setBrushSize] = useState(4);
  const [isDoubt, setIsDoubt] = useState(false);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLabel(initialLabel || "");
      setNotes(initialNotes || "");
      setIsDoubt(!!initialIsDoubt);
    } else {
      setLabel("");
      setNotes("");
      setIsDoubt(false);
    }
  }, [isOpen, initialLabel, initialNotes, initialIsDoubt]);

  useEffect(() => {
    if (!isOpen) {
      setIsMounted(false);
    }
  }, [isOpen]);

  // Undo history
  const [history, setHistory] = useState([]);

  // Text tool state
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState(null); // {x, y}

  const brushColors = [
    { value: "#8b5cf6", name: "Violet" },
    { value: "#ef4444", name: "Red" },
    { value: "#10b981", name: "Green" },
    { value: "#f59e0b", name: "Amber" },
    { value: "#3b82f6", name: "Blue" },
    { value: "#ffffff", name: "White" },
    { value: "#eab30866", name: "Highlight", isHighlight: true }, // Semi-transparent yellow
  ];

  // Initialize and load image on canvas
  useEffect(() => {
    if (!isOpen || !screenshotUrl || !isMounted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const img = new Image();
    if (screenshotUrl && !screenshotUrl.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      // Set fixed canvas size matching the image dimensions
      canvas.width = img.width || 1280;
      canvas.height = img.height || 720;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Clear history on load
      setHistory([]);
      setTextPos(null);
      setTextInput("");
    };
    img.src = screenshotUrl;
  }, [isOpen, screenshotUrl, isMounted]);

  // Handle drawing coordinates
  const getCanvasMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Scale coordinates based on canvas internal width/height vs display clientWidth/clientHeight
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const saveHistoryState = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev, state]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory(prev => prev.slice(0, -1));
  };

  const handleMouseDown = (e) => {
    if (tool === "text") {
      const pos = getCanvasMousePos(e);
      saveHistoryState();
      setTextPos(pos);
      return;
    }

    isDrawingRef.current = true;
    const pos = getCanvasMousePos(e);
    lastPosRef.current = pos;
    saveHistoryState();

    // Draw single dot on click
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === "eraser" ? "#000000" : color;
    
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.globalCompositeOperation = "source-over";
    }
    
    ctx.fill();
  };

  const handleMouseMove = (e) => {
    if (!isDrawingRef.current || tool === "text") return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getCanvasMousePos(e);

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
    }

    ctx.stroke();
    lastPosRef.current = pos;
  };

  const handleMouseUp = () => {
    isDrawingRef.current = false;
  };

  const handleClear = () => {
    saveHistoryState();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    if (screenshotUrl && !screenshotUrl.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = screenshotUrl;
  };

  const handleAddText = (e) => {
    e.preventDefault();
    if (!textInput.trim() || !textPos) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    ctx.globalCompositeOperation = "source-over";
    // Scale font size relative to canvas width
    const fontSize = Math.max(16, Math.round(canvas.width * 0.025));
    ctx.font = `bold ${fontSize}px sans-serif`;
    
    // Draw background label box for readability
    ctx.textBaseline = "middle";
    const textWidth = ctx.measureText(textInput).width;
    const padding = fontSize * 0.4;
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.beginPath();
    ctx.roundRect(
      textPos.x - padding,
      textPos.y - fontSize/2 - padding,
      textWidth + padding * 2,
      fontSize + padding * 2,
      6
    );
    ctx.fill();

    // Draw text
    ctx.fillStyle = color.startsWith("#eab30866") ? "#f59e0b" : color; // Don't use translucent for text
    ctx.fillText(textInput, textPos.x, textPos.y);

    setTextInput("");
    setTextPos(null);
  };

  const handleSaveClick = async () => {
    setIsSaving(true);
    try {
      const canvas = canvasRef.current;
      // Export canvas to lossless PNG data URL
      const finalDataUrl = canvas.toDataURL("image/png");
      
      const finalLabel = label.trim() || `Bookmark @ ${formatTime(timestamp)}`;
      await onSave(finalLabel, notes.trim(), finalDataUrl, isDoubt);
      onClose();
    } catch (err) {
      console.error("Failed to save doubt/bookmark:", err);
      alert("Error saving doubt/bookmark. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent container={container} className="bg-card border-border text-foreground max-w-[95vw] w-full md:max-w-[95vw] lg:max-w-7xl xl:max-w-[92vw] 2xl:max-w-[90vw] p-5 flex flex-col gap-4 max-h-[95vh] overflow-hidden select-none">
        
        {/* Header */}
        <DialogHeader className="pb-2 border-b border-border flex-shrink-0 flex flex-row items-center justify-between gap-4">
          <div>
            <DialogTitle className="text-sm font-semibold tracking-wide uppercase flex items-center gap-1.5">
              <Sparkles size={14} className="text-primary animate-pulse" />
              Capture doubt / revision note
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs mt-0.5 max-w-[90%] truncate">
              Lecture: <strong className="text-foreground">{videoTitle}</strong> @ {formatTime(timestamp)}
            </DialogDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant={isDoubt ? "destructive" : "secondary"} className="h-5 shrink-0 select-none">
              {isDoubt ? "Doubt ❓" : "Bookmark 🔖"}
            </Badge>
          </div>
        </DialogHeader>

        {/* Workspace Split Panels */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-5">
          
          {/* Left Panel: Drawing Canvas Area */}
          <div className="flex-grow flex flex-col gap-3 min-w-0" ref={containerRef}>
            {/* Editor Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 bg-muted/40 border border-border rounded-xl flex-shrink-0">
              <div className="flex items-center gap-1.5">
                {/* Brush Tool */}
                <button
                  onClick={() => setTool("brush")}
                  className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                    tool === "brush" 
                      ? "bg-primary border-primary text-primary-foreground" 
                      : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  title="Pen Brush Tool"
                >
                  <Brush size={14} />
                </button>
                {/* Eraser Tool */}
                <button
                  onClick={() => setTool("eraser")}
                  className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                    tool === "eraser" 
                      ? "bg-primary border-primary text-primary-foreground" 
                      : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  title="Eraser"
                >
                  <Eraser size={14} />
                </button>
                {/* Text Tool */}
                <button
                  onClick={() => setTool("text")}
                  className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                    tool === "text" 
                      ? "bg-primary border-primary text-primary-foreground" 
                      : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  title="Text Annotations"
                >
                  <Type size={14} />
                </button>
              </div>

              {/* Color Selectors */}
              {tool !== "eraser" && (
                <div className="flex items-center gap-1.5">
                  {brushColors.map((bc) => (
                    <button
                      key={bc.value}
                      onClick={() => setColor(bc.value)}
                      style={{ 
                        backgroundColor: bc.isHighlight ? "#eab308" : bc.value,
                        opacity: bc.isHighlight ? 0.6 : 1 
                      }}
                      className={`w-5 h-5 rounded-full border cursor-pointer hover:scale-105 active:scale-95 transition-transform ${
                        color === bc.value 
                          ? "border-foreground ring-2 ring-primary/45 ring-offset-2 ring-offset-card" 
                          : "border-border"
                      }`}
                      title={bc.name}
                    />
                  ))}
                </div>
              )}

              {/* Brush Size */}
              {tool !== "text" && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Size</span>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-16 h-1 cursor-pointer accent-primary bg-muted rounded-lg appearance-none"
                  />
                  <span className="text-[10px] font-bold text-foreground tabular-nums w-4 text-right">{brushSize}px</span>
                </div>
              )}

              {/* Utility actions: Undo & Clear */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:bg-card disabled:cursor-not-allowed cursor-pointer transition-colors"
                  title="Undo last stroke"
                >
                  <Undo size={14} />
                </button>
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                  title="Clear drawing"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Interactive Canvas Canvas Container */}
            <div className="flex-grow min-h-0 bg-zinc-950 border border-border/80 rounded-xl overflow-hidden flex items-center justify-center relative aspect-video">
              <canvas
                ref={(node) => {
                  canvasRef.current = node;
                  if (node && !isMounted) {
                    setIsMounted(true);
                  }
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                className={`w-full h-full object-contain max-h-[70vh] touch-none ${
                  tool === "brush" 
                    ? "cursor-crosshair" 
                    : tool === "eraser" 
                    ? "cursor-cell" 
                    : "cursor-text"
                }`}
              />

              {/* Interactive Text Tool Overlay Form */}
              {textPos && (
                <form 
                  onSubmit={handleAddText}
                  className="absolute p-2 bg-card border border-border rounded-lg shadow-xl z-20 flex gap-1.5 items-center"
                  style={{
                    // Approximate position mapping based on container size
                    left: `${Math.max(10, Math.min(80, (textPos.x / (canvasRef.current?.width || 1)) * 100))}%`,
                    top: `${Math.max(10, Math.min(80, (textPos.y / (canvasRef.current?.height || 1)) * 100))}%`,
                  }}
                >
                  <Input
                    type="text"
                    placeholder="Enter annotation..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    autoFocus
                    className="h-8 text-xs bg-background border-border max-w-[150px]"
                  />
                  <Button type="submit" size="sm" className="h-8 text-[10px] px-2 bg-primary">
                    Apply
                  </Button>
                  <button 
                    onClick={() => setTextPos(null)}
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer hover:bg-muted"
                  >
                    <X size={12} />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Right Panel: Bookmark Form Info */}
          <div className="w-full md:w-80 flex flex-col gap-4 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-5 flex-shrink-0 select-text">
            
            {/* Type Switcher */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Note Category</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-lg border border-border">
                <button
                  onClick={() => setIsDoubt(false)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                    !isDoubt 
                      ? "bg-card text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Bookmark size={13} className={!isDoubt ? "text-primary" : ""} />
                  Bookmark
                </button>
                <button
                  onClick={() => setIsDoubt(true)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                    isDoubt 
                      ? "bg-destructive/10 border-destructive/20 text-destructive shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <HelpCircle size={13} className={isDoubt ? "text-destructive" : ""} />
                  Doubt / Qs
                </button>
              </div>
            </div>

            {/* Title / Topic */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Topic / Title</label>
              <Input
                type="text"
                placeholder={isDoubt ? "e.g., Understanding Euler's Formula" : "e.g., Important equation to revise"}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                className="bg-background border-border text-xs focus:ring-primary focus-visible:ring-primary text-foreground"
              />
            </div>

            {/* Description Notes */}
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {isDoubt ? "Doubt Question Details" : "Study Notes / Revision Details"}
              </label>
              <textarea
                placeholder={
                  isDoubt 
                    ? "Explain what is confusing or what you want to clarify later..." 
                    : "Add extra definitions, study explanations, or key takeaways..."
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex-grow w-full bg-background border border-border rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none text-foreground min-h-[120px]"
              />
            </div>
            
            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 text-xs border-border bg-muted/20 hover:bg-muted/65"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/80 flex items-center justify-center gap-1.5"
                onClick={handleSaveClick}
                disabled={isSaving}
              >
                <Save size={13} />
                {isSaving ? "Saving..." : "Save Note"}
              </Button>
            </div>

          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
