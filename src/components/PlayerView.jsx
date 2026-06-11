import React, { useRef, useState, useEffect, useMemo } from "react";

import { Sliders, WifiOff, Globe, Maximize, Minimize, SkipBack, SkipForward, CheckCircle2 } from "lucide-react";
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
  onStudyTimeLogged,
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
  const [iframeLoaded, setIframeLoaded] = useState(0);
  const [showTitleOverlay, setShowTitleOverlay] = useState(false);
  const titleOverlayTimerRef = useRef(null);

  // Autoplay preferences (stored in localStorage)
  const [autoplayEnabled, setAutoplayEnabled] = useState(() => {
    return localStorage.getItem("lectura_autoplay") !== "false";
  });

  useEffect(() => {
    localStorage.setItem("lectura_autoplay", autoplayEnabled);
  }, [autoplayEnabled]);

  // Ref to flag that the next video should start playing automatically
  const shouldAutoplayNextRef = useRef(false);

  // Memoized autoplay flag for the active video load
  const autoplayThisVideo = useMemo(() => {
    const val = shouldAutoplayNextRef.current;
    shouldAutoplayNextRef.current = false;
    return val;
  }, [activeVideo?.id]);

  // Keep references updated for listener callbacks to prevent stale closures
  const autoplayEnabledRef = useRef(autoplayEnabled);
  useEffect(() => {
    autoplayEnabledRef.current = autoplayEnabled;
  }, [autoplayEnabled]);

  const nextVideoRef = useRef(nextVideo);
  useEffect(() => {
    nextVideoRef.current = nextVideo;
  }, [nextVideo]);

  const activeVideoRef = useRef(activeVideo);
  useEffect(() => {
    activeVideoRef.current = activeVideo;
  }, [activeVideo]);

  // Unified video completion and autoplay transition handler
  const handleVideoEnded = () => {
    const currentVid = activeVideoRef.current;
    if (!currentVid) return;

    // 1. Mark current video as completed
    handleUpdateProgress(currentVid.id, currentVid.duration || 0, true);

    // 2. Autoplay the next video if enabled and it exists
    if (autoplayEnabledRef.current && nextVideoRef.current) {
      shouldAutoplayNextRef.current = true;
      handleSelectVideo(nextVideoRef.current);
    }
  };

  // Ref to hold the progress tracking interval for YouTube
  const ytProgressIntervalRef = useRef(null);

  const clearYtProgressInterval = () => {
    if (ytProgressIntervalRef.current) {
      clearInterval(ytProgressIntervalRef.current);
      ytProgressIntervalRef.current = null;
    }
  };

  // Clean up interval on unmount
  useEffect(() => {
    return () => clearYtProgressInterval();
  }, []);

  // --- Study Heartbeat Log Tracking ---
  const isWatchingRef = useRef(false);
  const heartbeatCounterRef = useRef(0);
  const onStudyTimeLoggedRef = useRef(onStudyTimeLogged);
  const activeVideoIdRef = useRef(activeVideo.id);

  // Keep refs in sync without triggering the interval effect
  useEffect(() => {
    onStudyTimeLoggedRef.current = onStudyTimeLogged;
  }, [onStudyTimeLogged]);

  useEffect(() => {
    activeVideoIdRef.current = activeVideo.id;
  }, [activeVideo.id]);

  const flushHeartbeat = () => {
    if (heartbeatCounterRef.current > 0 && onStudyTimeLoggedRef.current) {
      onStudyTimeLoggedRef.current(activeVideoIdRef.current, heartbeatCounterRef.current);
      heartbeatCounterRef.current = 0;
    }
  };

  const setWatching = (watching) => {
    if (isWatchingRef.current === watching) return;
    isWatchingRef.current = watching;
    if (!watching) {
      flushHeartbeat();
    }
  };

  // Heartbeat interval — only resets when the video itself changes
  useEffect(() => {
    isWatchingRef.current = false;
    heartbeatCounterRef.current = 0;

    const interval = setInterval(() => {
      if (isWatchingRef.current && document.hasFocus()) {
        heartbeatCounterRef.current += 1;
        if (heartbeatCounterRef.current >= 10) {
          if (onStudyTimeLoggedRef.current) {
            onStudyTimeLoggedRef.current(activeVideoIdRef.current, 10);
          }
          heartbeatCounterRef.current = 0;
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      // Flush any remaining seconds on unmount or video change
      if (heartbeatCounterRef.current > 0 && onStudyTimeLoggedRef.current) {
        onStudyTimeLoggedRef.current(activeVideoIdRef.current, heartbeatCounterRef.current);
        heartbeatCounterRef.current = 0;
      }
    };
  }, [activeVideo.id]);

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

  // --- Fullscreen Offline Title Overlay ---
  const handleMouseMove = () => {
    if (!isFullscreen || !isOffline) return;
    setShowTitleOverlay(true);
    if (titleOverlayTimerRef.current) clearTimeout(titleOverlayTimerRef.current);
    titleOverlayTimerRef.current = setTimeout(() => {
      setShowTitleOverlay(false);
    }, 3000);
  };

  useEffect(() => {
    if (isFullscreen && isOffline) {
      setShowTitleOverlay(true);
      if (titleOverlayTimerRef.current) clearTimeout(titleOverlayTimerRef.current);
      titleOverlayTimerRef.current = setTimeout(() => {
        setShowTitleOverlay(false);
      }, 3000);
    } else {
      setShowTitleOverlay(false);
    }
    return () => {
      if (titleOverlayTimerRef.current) clearTimeout(titleOverlayTimerRef.current);
    };
  }, [isFullscreen, isOffline, activeVideo?.id]);



  // Listen for HTML5 fullscreen change events to synchronize state
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      
      setIsFullscreen(isCurrentlyFullscreen);
      
      // Sync the Tauri window fullscreen state to match the HTML5 fullscreen state
      appWindow.setFullscreen(isCurrentlyFullscreen).catch((err) => {
        console.error("Failed to sync Tauri window fullscreen:", err);
      });
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
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
              // Apply the initial/saved playback speed from ref
              if (typeof event.target.setPlaybackRate === "function") {
                event.target.setPlaybackRate(playbackSpeedRef.current);
              }
              // Restore time if we have a saved time from fullscreen toggle
              if (savedTimeRef.current > 0) {
                if (typeof event.target.seekTo === "function") {
                  event.target.seekTo(savedTimeRef.current, true);
                }
                event.target.playVideo();
                savedTimeRef.current = 0;
              } else if (autoplayThisVideo) {
                event.target.playVideo();
              }
            },
            onStateChange: (event) => {
              const yt = event.target;
              if (event.data === window.YT.PlayerState.ENDED) {
                setWatching(false);
                clearYtProgressInterval();
                handleVideoEnded();
              } else if (event.data === window.YT.PlayerState.PLAYING) {
                setWatching(true);
                clearYtProgressInterval();
                ytProgressIntervalRef.current = setInterval(() => {
                  if (typeof yt.getCurrentTime === "function" && typeof yt.getDuration === "function") {
                    const curTime = yt.getCurrentTime();
                    const duration = yt.getDuration();
                    const isDone = curTime >= duration - 10;
                    if (Math.round(curTime) % 5 === 0) {
                      handleUpdateProgress(activeVideoRef.current.id, Math.round(curTime), isDone);
                    }
                  }
                }, 1000);
              } else {
                setWatching(false);
                clearYtProgressInterval();
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
      // Note: We do NOT call player.destroy() here because the YouTube API's destroy() method
      // physically deletes the <iframe> element from the DOM, breaking React's virtual DOM reconciliation.
      // The browser naturally cleans up the iframe context on unmount.
      ytPlayerRef.current = null;
      clearYtProgressInterval();
    };
  }, [isOffline, activeVideo, autoplayThisVideo, iframeLoaded]);

  // Sync playbackSpeed with YouTube Player when it changes
  useEffect(() => {
    if (!isOffline && ytPlayerRef.current && typeof ytPlayerRef.current.setPlaybackRate === "function") {
      ytPlayerRef.current.setPlaybackRate(playbackSpeed);
    }
  }, [playbackSpeed, isOffline]);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    if (!isOffline && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
      savedTimeRef.current = Math.round(ytPlayerRef.current.getCurrentTime());
    } else if (isOffline && videoPlayerRef.current) {
      savedTimeRef.current = videoPlayerRef.current.currentTime;
    }

    // Set a timeout to clear the saved time after 10 seconds if no reload occurred (fallback)
    setTimeout(() => {
      savedTimeRef.current = 0;
    }, 10000);

    try {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );

      if (!isCurrentlyFullscreen) {
        // Request browser/webview fullscreen
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          await container.webkitRequestFullscreen();
        } else if (container.mozRequestFullScreen) {
          await container.mozRequestFullScreen();
        } else if (container.msRequestFullscreen) {
          await container.msRequestFullscreen();
        } else {
          // If HTML5 fullscreen is not supported, fallback to Tauri-only window fullscreen
          const nextFullscreen = !isFullscreen;
          await appWindow.setFullscreen(nextFullscreen);
          setIsFullscreen(nextFullscreen);
        }
      } else {
        // Exit browser/webview fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        } else {
          // Fallback exit Tauri fullscreen
          await appWindow.setFullscreen(false);
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.error("Fullscreen toggle failed, falling back to Tauri-only:", err);
      try {
        const nextFullscreen = !isFullscreen;
        await appWindow.setFullscreen(nextFullscreen);
        setIsFullscreen(nextFullscreen);
      } catch (tauriErr) {
        console.error("Tauri setFullscreen fallback failed:", tauriErr);
      }
    }
  };

  // Keyboard Shortcuts (Space, K, Arrows, M, J, L, Numbers, F, Esc)
  useEffect(() => {
    const handleKeyDown = async (e) => {
      // Ignore repeated keydown events only for toggles/navigation, allowing continuous seeking/speed/volume keys
      const nonRepeatableKeys = [" ", "k", "f", "m", "n", "p", "escape", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
      if (e.repeat && nonRepeatableKeys.includes(e.key.toLowerCase())) {
        return;
      }

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
        e.preventDefault();
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          } else if (document.mozCancelFullScreen) {
            await document.mozCancelFullScreen();
          } else if (document.msExitFullscreen) {
            await document.msExitFullscreen();
          }
        } catch (err) {
          console.error("Failed to exit fullscreen:", err);
          // Fallback exit Tauri fullscreen
          try {
            await appWindow.setFullscreen(false);
          } catch (tauriErr) {
            console.error("Tauri fallback exit failed:", tauriErr);
          }
          setIsFullscreen(false);
        }
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

  // Reset saved time when active video changes to prevent carry-over
  useEffect(() => {
    savedTimeRef.current = 0;
  }, [activeVideo?.id]);

  const startParam = useMemo(() => {
    if (isOffline) return ""; // Do not touch savedTimeRef for offline videos!

    if (savedTimeRef.current > 0) {
      const time = savedTimeRef.current;
      // Note: We do NOT clear savedTimeRef.current here so it can be programmatically
      // read and cleared inside the YT player's onReady event handler.
      return `&start=${time}&autoplay=1`;
    }
    return autoplayThisVideo ? "&autoplay=1" : "";
  }, [activeVideo.id, autoplayThisVideo, isOffline]);

  const playerMarkup = (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
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
          onPlay={() => setWatching(true)}
          onPause={() => setWatching(false)}
          onLoadedMetadata={(e) => {
            // Restore playback speed
            e.currentTarget.playbackRate = playbackSpeed;
            // Restore playback time or autoplay if naturally advanced
            if (savedTimeRef.current > 0) {
              e.currentTarget.currentTime = savedTimeRef.current;
              e.currentTarget.play().catch(console.error);
              savedTimeRef.current = 0;
            } else if (autoplayThisVideo) {
              e.currentTarget.play().catch(console.error);
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
          onEnded={() => {
            setWatching(false);
            handleVideoEnded();
          }}
        />
      ) : (
        <iframe
          key={activeVideo.id}
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${activeVideo.id}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}${startParam}`}
          title={activeVideo.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
          onLoad={() => setIframeLoaded((prev) => prev + 1)}
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

      {/* Fullscreen Video Title Overlay (Offline Only) */}
      {isFullscreen && isOffline && (
        <div
          className={`absolute top-5 left-16 z-[10001] max-w-[85%] md:max-w-[60%] px-4 py-2.5 rounded-xl bg-black/75 border border-white/10 backdrop-blur-md shadow-2xl transition-all duration-300 pointer-events-none select-none flex items-center gap-2 ${
            showTitleOverlay ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-95"
          }`}
        >
          <WifiOff size={13} className="text-emerald-400 shrink-0" />
          <span className="text-white font-semibold text-xs md:text-sm truncate leading-none">
            {activeVideo.title}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div 
      className="flex flex-col gap-4 animate-fade-in"
      style={isFullscreen ? { transform: "none", animation: "none" } : {}}
    >
      {playerMarkup}

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

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Completion Toggle Button */}
            <button
              onClick={() => {
                handleUpdateProgress(
                  activeVideo.id,
                  activeVideo.is_completed ? 0 : activeVideo.duration,
                  !activeVideo.is_completed
                );
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all duration-150 h-[34px] ${
                activeVideo.is_completed
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/25"
                  : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              <CheckCircle2 size={13} className={activeVideo.is_completed ? "fill-emerald-500/10 text-emerald-500" : "text-muted-foreground/60"} />
              <span>{activeVideo.is_completed ? "Completed" : "Mark Completed"}</span>
            </button>

            {/* Autoplay Toggle Switch */}
            <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border border-border h-[34px] select-none">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Autoplay</span>
              <button
                onClick={() => setAutoplayEnabled(!autoplayEnabled)}
                className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  autoplayEnabled ? "bg-primary" : "bg-muted-foreground/20"
                }`}
                title={autoplayEnabled ? "Disable Autoplay" : "Enable Autoplay"}
              >
                <span
                  className={`pointer-events-none block h-2.5 w-2.5 rounded-full bg-background shadow-md transition-transform duration-200 ${
                    autoplayEnabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {playbackSpeed && (
              <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border border-border h-[34px]">
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
