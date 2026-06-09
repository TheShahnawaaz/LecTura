# High-Speed Offline Playback Optimization

This document outlines the technical causes behind performance lag in offline video playback when exceeding **2.0x** speed, and details a proposed future implementation plan (**Option B**) to mitigate it.

---

## Technical Context & Bottlenecks

In LecTura, offline lectures are loaded from local storage via Tauri's asset protocol and rendered inside an HTML5 `<video>` element. On macOS, Tauri runs the frontend inside a native **WebKit WebView** (equivalent to Safari).

When a user accelerates video playback past 2.0x (e.g. 3.0x to 6.0x), the player exhibits frame drops, stuttering, and audio desynchronization due to the following bottlenecks:

### 1. Audio DSP Pitch Correction (The Main Culprit)
By default, the browser engine tries to correct the pitch of sped-up audio so the speaker's voice doesn't sound high-pitched ("chipmunk" effect). 
This pitch correction relies on a highly CPU-intensive Digital Signal Processing (DSP) time-stretching algorithm. At extreme speeds like 3.0x or 4.0x, running this DSP on the real-time audio thread consumes massive CPU resources. In WebKit's architecture, this audio thread overhead bottlenecks the video decoding thread, causing severe frame drops.

### 2. Software Decoding Fallback
Most hardware GPU decoders (such as Apple's VideoToolbox framework) are optimized and verified for playback speeds up to 2.0x. Beyond this threshold, WebKit often drops back to software-based CPU decoding. Processing high-resolution video frames (1080p+) entirely on the CPU at high speeds creates a processing bottleneck.

---

## Future Implementation Plan: Audio Pitch Control Toggle (Option B)

To allow users to watch videos smoothly at high speeds, we propose introducing a settings configuration that allows them to bypass the audio DSP calculations. 

### Proposed Behavior
By setting the HTML5 video element's `preservesPitch` (and WebKit-specific `webkitPreservesPitch`) properties to `false`, the browser bypasses the pitch-shifting DSP. 
* **With Pitch Correction Disabled**: Audio pitch rises naturally with speed, but CPU usage drops dramatically, enabling **100% fluid, lag-free playback up to 6.0x**.
* **With Pitch Correction Enabled**: Playback maintains normal voice pitch, but may experience stuttering above 2.0x due to WebKit limitations.

---

## Proposed Changes Checklist (For Future Implementation)

### 1. App State & Persistence
Add a new state in [App.jsx](file:///Users/shahnawaz/Desktop/Projects/Playground/LecTura/src/App.jsx) to store the user preference, persisting it to `localStorage`:

```javascript
const [pitchCorrectionEnabled, setPitchCorrectionEnabled] = useState(() => {
  return localStorage.getItem("lectura_pitch_correction") !== "false";
});

useEffect(() => {
  localStorage.setItem("lectura_pitch_correction", pitchCorrectionEnabled);
}, [pitchCorrectionEnabled]);
```

### 2. Settings Panel UI Checkbox
Expose the setting inside the **Settings & System Configuration** modal in `App.jsx` right next to the playback speed retention settings:

```jsx
{/* Audio Pitch Correction setting */}
<div className="p-3 bg-muted/30 rounded-lg border border-border flex items-center justify-between select-none">
  <div className="min-w-0 pr-2">
    <h4 className="text-xs font-semibold">
      Audio Pitch Correction
    </h4>
    <p className="text-[9px] text-muted-foreground mt-0.5">
      Correct voice pitch during fast playback (may cause lag above 2x).
    </p>
  </div>
  <input
    type="checkbox"
    checked={pitchCorrectionEnabled}
    onChange={(e) => setPitchCorrectionEnabled(e.target.checked)}
    className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
  />
</div>
```

### 3. Video Element Integration
Pass `pitchCorrectionEnabled` as a prop to `PlayerView` and bind a `useEffect` hook in [PlayerView.jsx](file:///Users/shahnawaz/Desktop/Projects/Playground/LecTura/src/components/PlayerView.jsx) to sync the property to the video player DOM element:

```javascript
useEffect(() => {
  if (isOffline && videoPlayerRef.current) {
    const video = videoPlayerRef.current;
    
    // Set native playback properties
    if ("preservesPitch" in video) {
      video.preservesPitch = pitchCorrectionEnabled;
    } else if ("webkitPreservesPitch" in video) {
      video.webkitPreservesPitch = pitchCorrectionEnabled;
    }
  }
}, [playbackSpeed, pitchCorrectionEnabled, isOffline]);
```
