# LecTura: YouTube Lecture Manager & Offline Player Handover Document

This document summarizes the exact state of the project, what has been completed, what has been verified, and the detailed architecture + step-by-step roadmap. Use this file to seed the next AI assistant or coding context to start building immediately.

* **Project Directory**: `/Users/shahnawaz/Desktop/Projects/Playground/LecTura`
* **Target OS**: macOS (Apple Silicon `aarch64-apple-darwin`) and Windows (`x86_64-pc-windows-msvc`)
* **Core Technology Stack**: Tauri v1 + React (Vite) + Tailwind CSS v4 + shadcn/ui

---

## 1. Executive Summary & Core Goals
**LecTura** is a lightweight, local-first native desktop application designed for students and self-learners to watch, organize, and study from YouTube playlists and video lectures.

### Key Features:
1. **Interactive Study Dashboard**: Import YouTube playlists/videos without needing Google API keys.
2. **Dual-Mode Video Player**: Play videos online using YouTube Embeds, or switch automatically to an HTML5 `<video>` tag playing local files once downloaded.
3. **Markdown Notebook**: Take notes side-by-side with the player. Clickable timestamp badges (e.g. `[04:12]`) automatically seek the player to that exact second.
4. **Custom Speeds**: Native speeds up to **5x** playback for accelerated learning.
5. **Zero-Setup Offline Downloads**: Bundled `yt-dlp` sidecar handles downloading. `ffmpeg` is automatically downloaded in the background on first launch (Option C) to merge high-quality tracks (1080p/720p) and extract audio.
6. **Local Storage**: Notes, checklists, progress state, and folders are saved in a simple, local `db.json` file in the system's App Data directory.

---

## 2. Completed Steps (Project Current State)

### Feasibility Proof of Concept (Verified)
* We verified that `yt-dlp` can scrape playlist structures and download files programmatically from Node.
* Installed `yt-dlp` via Homebrew on the host Mac.
* Wrote a scratch script at `/Users/shahnawaz/.gemini/antigravity/scratch/test_yt_poc.js` to fetch metadata and download a 360p video.
* Checked download logs, parsed percentage/speed progress in real-time, verified the downloaded `poc_download.mp4` byte stream size (8.11 MB), and opened it in Finder. Feasibility is 100% confirmed.

### Workspace Setup & Scaffolding
* Project folder initialized at `/Users/shahnawaz/Desktop/Projects/Playground/LecTura`.
* Run `create-tauri-app` using the `react` template.
* Completed `npm install` for core React and Tauri dependencies.
* Installed Tailwind CSS, PostCSS, and Autoprefixer.
* Configured Path Aliasing:
  * Created `/Users/shahnawaz/Desktop/Projects/Playground/LecTura/jsconfig.json` mapping `@/*` to `./src/*`.
  * Updated `/Users/shahnawaz/Desktop/Projects/Playground/LecTura/vite.config.js` to include `resolve.alias` configuration.
  * Created `/Users/shahnawaz/Desktop/Projects/Playground/LecTura/postcss.config.js` to process styles.
* Configured shadcn/ui:
  * Created `components.json` mapping components to `@/components` and utils to `@/lib/utils`.
  * Wrote `/Users/shahnawaz/Desktop/Projects/Playground/LecTura/src/index.css` defining default HSL variables for an ultra-premium dark obsidian theme.
  * Executed `npx shadcn@latest init -y` which ran successfully, generating `src/components/ui/button.jsx`, `src/lib/utils.js` (with the class merger helper `cn`), and merging tailwind styles.

---

## 3. Configuration Files Reference

### `jsconfig.json`
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### `vite.config.js`
```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

---

## 4. Step-by-Step Implementation Roadmap (For the Next Session)

The next AI developer should follow these steps to implement the rest of the application:

### Step 1: Rust Backend Commands (`src-tauri/src/main.rs`)
Write Rust command handlers to perform database and process operations:
1. **Local Database Operations**:
   * Create structure `Database` to store playlists, videos, folders, bookmarks, and notes.
   * Expose commands `get_db()`, `save_db(data: String)`.
   * Initialize `db.json` in the user's App Data directory. Use Tauri's `tauri::api::path::app_data_dir()` helper.
2. **Auto-Downloader Engine for `ffmpeg`**:
   * Implement a Rust command `check_or_download_ffmpeg()` on startup.
   * If `ffmpeg` is missing in the local app directory, fetch the pre-compiled binary (from GitHub releases or Evermeet) dynamically based on OS:
     * macOS: `https://evermeet.cx/ffmpeg/ffmpeg-8.0.1.zip`
     * Windows: `https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip`
   * Unpack the zip, rename it to `ffmpeg`, and save it in the app directory.
3. **Execute `yt-dlp` for Scraping**:
   * Expose command `import_playlist(url: String)`: Executed as a sidecar, parses JSON output via `yt-dlp -J <url>`.
4. **Execute `yt-dlp` for Downloading**:
   * Expose command `download_video(video_id: String, url: String)`.
   * Stream `stdout` progress lines (e.g., matching percentages) and emit a Tauri event `download-progress` containing `{ video_id, percent, speed }`.

### Step 2: Tauri Bundler Config & Sidecar setup (`src-tauri/tauri.conf.json`)
Configure the sidecar links to allow bundling `yt-dlp`:
1. Download standalone `yt-dlp` for Mac and save it inside `/src-tauri/bin/yt-dlp-aarch64-apple-darwin`.
2. In `tauri.conf.json`, declare:
   ```json
   "bundle": {
     "externalBinaries": [
       "bin/yt-dlp",
       "bin/ffmpeg"
     ]
   }
   ```
3. Enable standard FS and Protocol allowlists to play local files via `assetScope`:
   ```json
   "allowlist": {
     "fs": { "all": true, "scope": ["$APPDIR/*", "$DOCUMENT/*"] },
     "protocol": { "asset": true, "assetScope": ["$DOCUMENT/*", "$APPDIR/*"] }
   }
   ```

### Step 3: Frontend Components (`src/components/`)
Construct UI components using shadcn controls (install cards, sliders, progress bars, scrollareas):
1. **Layout Grid**: Collapsible navigation sidebar + central view.
2. **Dashboard**: Empty state containing a beautiful glassmorphic import card with a text field for YouTube links.
3. **Video Area**:
   * Combines a custom-styled YouTube embed (using Iframe Player API) and a HTML5 `<video>` player.
   * If local video file path exists in database, load video src using Tauri's `convertFileSrc` function.
   * Provide unified speed slider (supporting `0.25x` to `5.0x`).
4. **Markdown Notebook**:
   * Side-by-side textbox.
   * Parse timestamp references using regex `/(\d{2}):(\d{2})(:\d{2})?/g`. Convert them into interactive link badges.
   * When clicked, invoke `player.seekTo(seconds)`.

---

## 5. Helpful Commands to Get Started

To run the app in development:
```bash
npm run tauri dev
```

To compile the standalone distributable package (`.dmg` or `.app`):
```bash
npm run tauri build
```
