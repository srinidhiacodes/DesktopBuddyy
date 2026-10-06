# Desk Buddy

A small animated character that floats on the Windows desktop and reminds you to drink water, focus and take breaks.

## Run it

```
npm install
npm start
```

## Build DeskBuddy.exe

```
npm run dist
```

This makes `dist/DeskBuddy/` with `DeskBuddy.exe` inside (Windows 64-bit; it can be built from Windows, Linux or macOS).
GitHub also builds it on every push: open the repo's **Actions** tab, pick the latest **Build for Windows** run and download **DeskBuddy** under Artifacts.

## Install on Windows

1. Download `DeskBuddy.zip` and unzip it.
2. Double-click `DeskBuddy.exe`.
3. On the blue "Windows protected your PC" warning, click **More info**, then **Run anyway** (first time only; the app isn't signed).
4. She appears in the bottom-right corner. Right-click her, or click the pink drop near the clock, for the menu.

## Folders

- `app/main.js` – the see-through window, tray icon, saving, screen-lock pause.
- `app/renderer/` – her window: clips, speech bubble, control bar, timers.
- `app/store.js` – settings and water count, saved in the user's app-data folder.

- `source/brief.html` – the project brief.
- `source/clips/` – original green-screen clips from Google Flow (idle1, idle2, idle3, focus, drink, stretch).
- `source/stills/` – the original drawing, the green start image and the cut-out PNGs.
- `tools/clean_clips.py` – removes the green background and lines her up across clips (run: `python3 tools/clean_clips.py`, needs ffmpeg, numpy, Pillow).
- `tools/make_masks.py` – builds the click maps (`app/renderer/masks.js`) so clicks on empty space go through to the apps behind her.
- `tools/build.mjs` – packages the app into `dist/DeskBuddy` (`npm run dist`).
- `.github/workflows/build-windows.yml` – builds `DeskBuddy.exe` on GitHub on every push.
- `tools/make_icons.py` – draws the tray and app icons.
- `app/media/` – the cleaned, see-through clips (`.webm`) and a first-frame picture of each (`.png`).

## How the cleaning works

1. Her face in each clip is matched to the Focus clip, so she has the same size and position in every clip (Drink and Stretch are shrunk to about 90%).
2. Green pixels become see-through, and green spill on her edges is removed.
3. Every clip is cropped to the same 532 × 810 box with a soft fade at the bottom.
4. Saved as VP9 WebM with transparency, which the app plays directly.
