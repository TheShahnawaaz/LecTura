import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sliders, AlertCircle, WifiOff, Globe, Maximize, Minimize } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import { Badge } from "@/components/ui/badge";

export function PlayerView({
  activeVideo,
  videoPlayerRef,
  playbackSpeed,
  setPlaybackSpeed,
  handleUpdateProgress,
}) {
  const isOffline =
    activeVideo.download_status === "completed" && activeVideo.local_path;

  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const savedTimeRef = useRef(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Ref to hold the latest playback speed so that callbacks don't capture stale state
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

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
      // Ignore if typing in text input fields
      const tag = document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement.isContentEditable) {
        return;
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
            e.preventDefault();
            if (video.paused) {
              video.play().catch(console.error);
            } else {
              video.pause();
            }
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

        {!isOffline && (
          <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-lg flex items-center gap-1.5">
            <AlertCircle size={12} className="flex-shrink-0" />
            Playback speeds up to 2.0x are supported online. Speeds up to 6.0x are supported after downloading this lecture offline.
          </p>
        )}
      </div>
    </div>
  );
}
