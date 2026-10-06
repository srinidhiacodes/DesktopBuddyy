# Desk Buddy

A small animated character that floats on your Windows desktop and reminds you to drink water, focus and take breaks.

## Download

**Direct download (always the newest version):**
https://github.com/srinidhiacodes/DesktopBuddyy/releases/latest/download/DeskBuddy.zip

This link never expires and needs no GitHub account. It works on any Windows 10 or 11 laptop (64-bit).

Or step by step from the repo page:

1. Open https://github.com/srinidhiacodes/DesktopBuddyy
2. On the right side, under **Releases**, click the newest one (for example **Desk Buddy 0.1.0**).
3. Under **Assets**, click **DeskBuddy.zip**. It is about 155 MB.

## Install and start

1. Find `DeskBuddy.zip` in your Downloads folder, right-click it and choose **Extract All…**, then **Extract**.
2. Open the new `DeskBuddy` folder and double-click **`DeskBuddy.exe`**.
3. The first time, Windows shows a blue box saying **"Windows protected your PC"**. Click **More info**, then **Run anyway**. This happens because the app isn't signed; it won't ask again.
4. She appears in the bottom-right corner and waves.

Tip: keep the `DeskBuddy` folder somewhere permanent, such as Documents, before turning on **Start with Windows**. If you move the folder later, turn that setting off and on again.

## Using her

- **Hover over her** for the control bar: turn off, start focus, today's glasses of water, mute.
- **Drag her** anywhere on the screen. She remembers the spot.
- **Right-click her**, or click the **pink drop icon near the clock**, for the menu: turn on or off, start focus, sound, size, start with Windows, settings, quit.
- When she's **off**, click the grey drop near the clock to turn her back on. (If you can't see it, click the small **^** arrow near the clock.)
- **Click her** for a wave and a cute line.

## What she reminds you about

| Reminder | Default | What she does |
|---|---|---|
| Water | every 30 min | Drinks, asks if you drank; **Later** asks again in 10 min |
| Eye rest (20-20-20) | every 20 min | "Rest your eyes!" with a 20-second countdown |
| Posture | every 60 min | "Sit up straight!" (closes itself after 30 seconds) |
| Focus / break | 25 / 5 min | Countdown, then she stretches with you |

During focus she stays quiet: eye-rest and posture reminders are skipped, and water waits until focus ends. Only one reminder shows at a time; others wait their turn.

Everything can be changed in **Settings** (right-click her → Settings…), including her messages: write your own words for each reminder and your own cute lines for when you click her.

## Moving to another laptop

Download and install as above on the new laptop. Her settings, water count and position are saved only on each laptop, in `%APPDATA%\Desk Buddy\desk-buddy.json`. To bring your settings along, copy that file to the same folder on the new laptop while she isn't running.

## For developers

### Run from the code

```
npm install
npm start
```

### Build DeskBuddy.exe

```
npm run dist
```

This makes `dist/DeskBuddy/` with `DeskBuddy.exe` inside (Windows 64-bit; it can be built from Windows, Linux or macOS).

GitHub also builds it on every push (**Actions** tab → **Build for Windows**). Pushes to the main branch publish `DeskBuddy.zip` as a GitHub Release, one per app version: raise `version` in `package.json` to start a new release, otherwise the current version's release is replaced with the newest build. To rebuild without a code change, open **Actions** → **Build for Windows** → **Run workflow**.

### Folders

- `app/main.js` – the see-through window, tray icon, saving, screen-lock pause.
- `app/renderer/` – her window (clips, speech bubble, control bar, timers) and the settings window.
- `app/store.js` – settings and water count, saved in the user's app-data folder.
- `app/media/` – the cleaned, see-through clips (`.webm`) and a first-frame picture of each (`.png`).
- `source/brief.html` – the project brief.
- `source/clips/` – original green-screen clips from Google Flow (idle1, idle2, idle3, focus, drink, stretch).
- `source/stills/` – the original drawing, the green start image and the cut-out PNGs.
- `tools/clean_clips.py` – removes the green background and lines her up across clips (run: `python3 tools/clean_clips.py`, needs ffmpeg, numpy, Pillow).
- `tools/make_masks.py` – builds the click maps (`app/renderer/masks.js`) so clicks on empty space go through to the apps behind her.
- `tools/make_icons.py` – draws the tray and app icons.
- `tools/build.mjs` – packages the app into `dist/DeskBuddy` (`npm run dist`).
- `.github/workflows/build-windows.yml` – builds `DeskBuddy.exe` on GitHub and publishes the release.

### Adding the laptop clip (her working during focus)

During focus she waves, then works on her laptop (the `work` clip) until focus ends. The clip in `source/clips/work.mp4` was made this way; to replace it:

1. In Google Flow, use `source/stills/green.jpg` as the start image (9:16, 8–10 seconds) with a prompt like:
   > The same girl holds an open silver laptop at chest height and types on it, looking at the screen with a small focused smile, sometimes nodding. The camera is completely still, with the same framing and size as the start image. Solid bright green background, no shadows, no other objects. The first and last frames match so it loops smoothly.
2. Save it as `source/clips/work.mp4`.
3. Run `python3 tools/clean_clips.py` and then `python3 tools/make_masks.py`.
4. Only the typing part of the clip is used, and its end blends into its start so it loops smoothly: if a new clip is timed differently, adjust `TRIM` in `tools/clean_clips.py`.

### How the cleaning works

1. Her face in each clip is matched to the Focus clip, so she has the same size and position in every clip (Drink and Stretch are shrunk to about 90%).
2. Green pixels become see-through, and green spill on her edges is removed.
3. Every clip is cropped to the same 532 × 810 box with a soft fade at the bottom.
4. Saved as VP9 WebM with transparency, which the app plays directly.
