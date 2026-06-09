import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sliders, WifiOff, Globe, Maximize, Minimize, SkipBack, SkipForward } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import { Badge } from "@/components/ui/badge";

export function PlayerView({
  activeVideo,
  videos,
  videoPlayerRef,
  playbackSpeed,
  setPlaybackSpeed,
  handleUpdateProgress,
  handleSelectVideo,
}) {
  // Compute adjacent lecture navigation
  const currentIndex = videos ? videos.findIndex((v) => v.id === activeVideo.id) : -1;
  const prevVideo = currentIndex > 0 ? videos[currentIndex - 1] : null;
  const nextVideo = currentIndex !== -1 && currentIndex < videos.length - 1 ? videos[currentIndex + 1] : null;
  const isOffline =
    activeVideo.download_status === "completed" && activeVideo.local_path;

  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const savedTimeRef = useRef(0);
  const speedHudTimerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedHUD, setShowSpeedHUD] = useState(false);

  // Ref to hold the latest playback speed so that callbacks don't capture stale state
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Show a transient speed HUD overlay when speed changes in fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    // Flash the HUD
    setShowSpeedHUD(true);
    if (speedHudTimerRef.current) clearTimeout(speedHudTimerRef.current);
    speedHudTimerRef.current = setTimeout(() => setShowSpeedHUD(false), 1500);
    return () => {
      if (speedHudTimerRef.current) clearTimeout(speedHudTimerRef.current);
    };
  }, [playbackSpeed, isFullscreen]);

  // Adjust playback speed bounds when switching between online and offline modes
  useEffect(() => {
    if (!isOffline) {
      if (playbackSpeed > 2.0) {
        setPlaybackSpeed(2.0);
      } else if (playbackSpeed < 0.25) {
        setPlaybackSpeed(0.25);
      }
    }
  }, [isOffline, playbackSpeed, setPlaybackSpeed]);

  // Sync state if OS window changes fullscreen state independently
  useEffect(() => {
    let unlisten;
    const setupListener = async () => {
      try {
        unlisten = await appWindow.onResized(async () => {
          const isWinFullscreen = await appWindow.isFullscreen();
          setIsFullscreen(isWinFullscreen);
        });
      } catch (err) {
        console.error("Failed to setup window listener:", err);
      }
    };
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Load YouTube Iframe API Script globally if not present
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      if (firstScriptTag) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }, []);

  // Initialize/Destroy YT Player instance on the active iframe
  useEffect(() => {
    let player;
    
    const initPlayer = () => {
      if (window.YT && window.YT.Player && iframeRef.current) {
        player = new window.YT.Player(iframeRef.current, {
          events: {
            onReady: (event) => {
              ytPlayerRef.current = event.target;
              // Reset saved time now that it has been loaded
              savedTimeRef.current = 0;
              // Apply the initial/saved playback speed from ref
              if (typeof event.target.setPlaybackRate === "function") {
                event.target.setPlaybackRate(playbackSpeedRef.current);
              }
            }
          }
        });
      }
    };

    if (!isOffline && activeVideo) {
      if (window.YT && window.YT.Player) {
        initPlayer();
      } else {
        // Fallback wait for YT API to be fully loaded
        const prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (prevReady) prevReady();
          initPlayer();
        };
      }
    }

    return () => {
      if (player && typeof player.destroy === "function") {
        player.destroy();
      }
      ytPlayerRef.current = null;
    };
  }, [isOffline, activeVideo, isFullscreen]);

  // Sync playbackSpeed with YouTube Player when it changes
  useEffect(() => {
    if (!isOffline && ytPlayerRef.current && typeof ytPlayerRef.current.setPlaybackRate === "function") {
      ytPlayerRef.current.setPlaybackRate(playbackSpeed);
    }
  }, [playbackSpeed, isOffline]);

  const toggleFullscreen = async () => {
    if (!isOffline && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
      savedTimeRef.current = Math.round(ytPlayerRef.current.getCurrentTime());
    } else if (isOffline && videoPlayerRef.current) {
      savedTimeRef.current = videoPlayerRef.current.currentTime;
    }
    try {
      const nextFullscreen = !isFullscreen;
      await appWindow.setFullscreen(nextFullscreen);
      setIsFullscreen(nextFullscreen);
    } catch (err) {
      console.error("Failed to toggle native window fullscreen:", err);
      setIsFullscreen(!isFullscreen);
    }
  };

  // Keyboard Shortcuts (Space, K, Arrows, M, J, L, Numbers, F, Esc)
  useEffect(() => {
    const handleKeyDown = async (e) => {
      // Ignore repeated keydown events from key being held down
      if (e.repeat) return;

      // Ignore if typing in text input fields or select dropdowns
      const tag = document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement.isContentEditable) {
        return;
      }

      // For spacebar: immediately prevent default to stop:
      // 1. Page scrolling
      // 2. Focused <button> from receiving a synthetic click on keyup
      // 3. Native <video controls> spacebar toggle competing with our handler
      if (e.key === " ") {
        e.preventDefault();
        // Also blur any focused button/element so it doesn't intercept the keyup
        if (document.activeElement && document.activeElement !== document.body) {
          document.activeElement.blur();
        }
      }

      // Exit fullscreen on Esc key
      if (e.key === "Escape" && isFullscreen) {
        if (!isOffline && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
          savedTimeRef.current = Math.round(ytPlayerRef.current.getCurrentTime());
        } else if (isOffline && videoPlayerRef.current) {
          savedTimeRef.current = videoPlayerRef.current.currentTime;
        }
        try {
          await appWindow.setFullscreen(false);
        } catch (err) {
          console.error(err);
        }
        setIsFullscreen(false);
        return;
      }

      // Fullscreen shortcut F works for both online/offline
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      if (isOffline) {
        if (!videoPlayerRef.current) return;
        const video = videoPlayerRef.current;

        switch (e.key.toLowerCase()) {
          case "d":
            e.preventDefault();
            setPlaybackSpeed(parseFloat(Math.min(6.0, playbackSpeed + 0.1).toFixed(2)));
            break;
          case "s":
            e.preventDefault();
            setPlaybackSpeed(parseFloat(Math.max(0.1, playbackSpeed - 0.1).toFixed(2)));
            break;
          case " ":
          case "k":
            // e.preventDefault() already called above for space; call for k too
            e.preventDefault();
            if (video.paused) {
              video.play().catch(console.error);
            } else {
              video.pause();
            }
            // Blur the video element so its native controls don't also respond
            video.blur();
            break;
          case "arrowright":
            e.preventDefault();
            video.currentTime = Math.min(video.duration, video.currentTime + 5);
            break;
          case "arrowleft":
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 5);
            break;
          case "l":
            e.preventDefault();
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
            break;
          case "j":
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 10);
            break;
          case "arrowup":
            e.preventDefault();
            video.volume = Math.min(1.0, video.volume + 0.05);
            break;
          case "arrowdown":
            e.preventDefault();
            video.volume = Math.max(0.0, video.volume - 0.05);
            break;
          case "m":
            e.preventDefault();
            video.muted = !video.muted;
            break;
          case "n":
            e.preventDefault();
            if (nextVideo) handleSelectVideo(nextVideo);
            break;
          case "p":
            e.preventDefault();
            if (prevVideo) handleSelectVideo(prevVideo);
            break;
          default:
            // Handle number keys 0-9 to seek to percentage (0% to 90%)
            if (e.key >= "0" && e.key <= "9") {
              e.preventDefault();
              const percentage = parseInt(e.key) / 10;
              video.currentTime = video.duration * percentage;
            }
            break;
        }
      } else {
        // Online YouTube Player
        if (!ytPlayerRef.current) return;
        const yt = ytPlayerRef.current;

        switch (e.key.toLowerCase()) {
          case "d":
            e.preventDefault();
            setPlaybackSpeed(parseFloat(Math.min(2.0, playbackSpeed + 0.1).toFixed(2)));
            break;
          case "s":
            e.preventDefault();
            setPlaybackSpeed(parseFloat(Math.max(0.25, playbackSpeed - 0.1).toFixed(2)));
            break;
          case " ":
          case "k":
            e.preventDefault();
            if (typeof yt.getPlayerState === "function") {
              const state = yt.getPlayerState();
              if (state === window.YT.PlayerState.PLAYING) {
                yt.pauseVideo();
              } else if (state === window.YT.PlayerState.PAUSED || state === window.YT.PlayerState.CUED || state === window.YT.PlayerState.UNSTARTED) {
                yt.playVideo();
              }
            }
            break;
          case "arrowright":
            e.preventDefault();
            if (typeof yt.getCurrentTime === "function" && typeof yt.getDuration === "function") {
              yt.seekTo(Math.min(yt.getDuration(), yt.getCurrentTime() + 5), true);
            }
            break;
          case "arrowleft":
            e.preventDefault();
            if (typeof yt.getCurrentTime === "function") {
              yt.seekTo(Math.max(0, yt.getCurrentTime() - 5), true);
            }
            break;
          case "l":
            e.preventDefault();
            if (typeof yt.getCurrentTime === "function" && typeof yt.getDuration === "function") {
              yt.seekTo(Math.min(yt.getDuration(), yt.getCurrentTime() + 10), true);
            }
            break;
          case "j":
            e.preventDefault();
            if (typeof yt.getCurrentTime === "function") {
              yt.seekTo(Math.max(0, yt.getCurrentTime() - 10), true);
            }
            break;
          case "arrowup":
            e.preventDefault();
            if (typeof yt.getVolume === "function" && typeof yt.setVolume === "function") {
              yt.setVolume(Math.min(100, yt.getVolume() + 5));
            }
            break;
          case "arrowdown":
            e.preventDefault();
            if (typeof yt.getVolume === "function" && typeof yt.setVolume === "function") {
              yt.setVolume(Math.max(0, yt.getVolume() - 5));
            }
            break;
          case "m":
            e.preventDefault();
            if (typeof yt.isMuted === "function" && typeof yt.mute === "function" && typeof yt.unMute === "function") {
              if (yt.isMuted()) {
                yt.unMute();
              } else {
                yt.mute();
              }
            }
            break;
          case "n":
            e.preventDefault();
            if (nextVideo) handleSelectVideo(nextVideo);
            break;
          case "p":
            e.preventDefault();
            if (prevVideo) handleSelectVideo(prevVideo);
            break;
          default:
            // Handle number keys 0-9 to seek to percentage (0% to 90%)
            if (e.key >= "0" && e.key <= "9") {
              e.preventDefault();
              if (typeof yt.getDuration === "function") {
                const percentage = parseInt(e.key) / 10;
                yt.seekTo(yt.getDuration() * percentage, true);
              }
            }
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOffline, isFullscreen, playbackSpeed, setPlaybackSpeed]);

  const startParam = savedTimeRef.current > 0 ? `&start=${savedTimeRef.current}&autoplay=1` : "";

  const playerMarkup = (
    <div 
      ref={containerRef}
      className={
        isFullscreen 
          ? "fixed inset-0 z-[9999] bg-black w-screen h-screen flex items-center justify-center rounded-none" 
          : "aspect-video w-full rounded-xl bg-black overflow-hidden relative border border-border shadow-md group"
      }
    >
      {isOffline ? (
        <video
          ref={videoPlayerRef}
          src={convertFileSrc(activeVideo.local_path)}
          controls
          tabIndex={-1}
          className="w-full h-full object-contain focus:outline-none"
          onLoadedMetadata={(e) => {
            // Restore playback speed
            e.currentTarget.playbackRate = playbackSpeed;
            // Restore playback time
            if (savedTimeRef.current > 0) {
              e.currentTarget.currentTime = savedTimeRef.current;
              e.currentTarget.play().catch(console.error);
              savedTimeRef.current = 0;
            }
          }}
          onTimeUpdate={(e) => {
            const curTime = e.currentTarget.currentTime;
            const isDone =
              curTime >= e.currentTarget.duration - 10;
            if (Math.round(curTime) % 5 === 0) {
              handleUpdateProgress(activeVideo.id, Math.round(curTime), isDone);
            }
          }}
        />
      ) : (
        <iframe
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${activeVideo.id}?enablejsapi=1${startParam}`}
          title={activeVideo.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      )}

      {/* Floating Custom Fullscreen Trigger Button */}
      <button
        onClick={toggleFullscreen}
        className={`absolute bottom-4 right-4 z-[10000] p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white border border-white/10 hover:scale-105 active:scale-95 shadow-lg transition-all duration-200 cursor-pointer ${
          isFullscreen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>

      {/* Fullscreen Speed HUD — fades in/out when speed changes */}
      {isFullscreen && (
        <div
          className={`absolute top-5 left-1/2 -translate-x-1/2 z-[10001] flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 border border-white/10 backdrop-blur-sm shadow-xl transition-all duration-300 pointer-events-none select-none ${
            showSpeedHUD ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <Sliders size={13} className="text-white/70" />
          <span className="text-white font-bold text-sm tabular-nums tracking-tight">
            {playbackSpeed}×
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {isFullscreen 
        ? createPortal(playerMarkup, document.body)
        : playerMarkup
      }

      {/* Metadata & Controls Card */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm transition-colors duration-300">
        <div className="flex justify-between items-start gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2">
              {isOffline ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 py-0.5 rounded-md text-[9px] font-semibold flex items-center gap-1 shrink-0"
                >
                  <WifiOff size={10} />
                  <span>Offline Mode (Local)</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 py-0.5 rounded-md text-[9px] font-semibold flex items-center gap-1 shrink-0"
                >
                  <Globe size={10} />
                  <span>Online Streaming</span>
                </Badge>
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground leading-snug mt-1">
              {activeVideo.title}
            </h3>
          </div>

          {playbackSpeed && (
            <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border border-border flex-shrink-0">
              <Sliders size={12} className="text-primary" />
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Speed</label>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="bg-transparent text-xs text-primary font-bold focus:outline-none cursor-pointer outline-none border-none pr-1"
              >
                {(() => {
                  const baseOptions = isOffline
                    ? ["0.25", "0.5", "0.75", "1", "1.25", "1.5", "2", "2.5", "3", "4", "5", "6"]
                    : ["0.25", "0.5", "0.75", "1", "1.25", "1.5", "1.75", "2"];
                  const currentStr = playbackSpeed.toString();
                  if (!baseOptions.includes(currentStr)) {
                    baseOptions.push(currentStr);
                    baseOptions.sort((a, b) => parseFloat(a) - parseFloat(b));
                  }
                  return baseOptions.map(v => (
                    <option key={v} value={v} className="bg-card text-foreground">{v}x</option>
                  ));
                })()}
              </select>
            </div>
          )}
        </div>

      </div>

      {/* ───── Prev / Next Lecture Navigation ───── */}
      {videos && videos.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          {/* Previous */}
          <button
            onClick={() => prevVideo && handleSelectVideo(prevVideo)}
            disabled={!prevVideo}
            className={`group flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-150 ${
              prevVideo
                ? "bg-card border-border hover:bg-muted/60 hover:border-border/80 cursor-pointer"
                : "bg-muted/20 border-border/40 opacity-40 cursor-not-allowed"
            }`}
            title={prevVideo ? `Previous: ${prevVideo.title}` : "No previous lecture"}
          >
            <SkipBack size={15} className={`flex-shrink-0 transition-colors ${prevVideo ? "text-muted-foreground group-hover:text-foreground" : "text-muted-foreground/40"}`} />
            <div className="flex flex-col text-left min-w-0">
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60">Previous</span>
              <span className="text-[11px] font-medium text-foreground/80 truncate leading-snug mt-0.5">
                {prevVideo ? prevVideo.title : "—"}
              </span>
            </div>
          </button>

          {/* Lecture counter */}
          <span className="text-[10px] font-semibold text-muted-foreground/50 tabular-nums flex-shrink-0">
            {currentIndex + 1} / {videos.length}
          </span>

          {/* Next */}
          <button
            onClick={() => nextVideo && handleSelectVideo(nextVideo)}
            disabled={!nextVideo}
            className={`group flex-1 flex items-center justify-end gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-150 ${
              nextVideo
                ? "bg-card border-border hover:bg-muted/60 hover:border-border/80 cursor-pointer"
                : "bg-muted/20 border-border/40 opacity-40 cursor-not-allowed"
            }`}
            title={nextVideo ? `Next: ${nextVideo.title}` : "No next lecture"}
          >
            <div className="flex flex-col text-right min-w-0">
              <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60">Next</span>
              <span className="text-[11px] font-medium text-foreground/80 truncate leading-snug mt-0.5">
                {nextVideo ? nextVideo.title : "—"}
              </span>
            </div>
            <SkipForward size={15} className={`flex-shrink-0 transition-colors ${nextVideo ? "text-muted-foreground group-hover:text-foreground" : "text-muted-foreground/40"}`} />
          </button>
        </div>
      )}
    </div>
  );
}
