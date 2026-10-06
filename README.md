# Desk Buddy

A small animated character that floats on your desktop, on top of every app, and reminds you to drink water, rest your eyes, sit up straight, focus and take breaks. For **Windows 10 / 11** and **Mac**.

## Download

Direct downloads, always the newest version. These links never expire and need no GitHub account.

| Computer | Download |
|---|---|
| **Windows** 10 or 11 (64-bit) | https://github.com/srinidhiacodes/DesktopBuddyy/releases/latest/download/DeskBuddy.zip |
| **Mac** with Intel or Apple Silicon (M1, M2, M3, M4…), macOS 12 or newer | https://github.com/srinidhiacodes/DesktopBuddyy/releases/latest/download/DeskBuddy-Mac.zip |

Or step by step from the repo page:

1. Open https://github.com/srinidhiacodes/DesktopBuddyy
2. On the right side, under **Releases**, click the newest one (for example **Desk Buddy 0.1.0**).
3. Under **Assets**, click **DeskBuddy.zip** (Windows) or **DeskBuddy-Mac.zip** (Mac).

## Install and start on Windows

1. Find `DeskBuddy.zip` in your Downloads folder, right-click it and choose **Extract All…**, then **Extract**.
2. Open the new `DeskBuddy` folder and double-click **`DeskBuddy.exe`**.
3. The first time, Windows shows a blue box saying **"Windows protected your PC"**. Click **More info**, then **Run anyway**. This happens because the app isn't signed; it won't ask again.
4. She appears in the bottom-right corner and waves.

Tip: keep the `DeskBuddy` folder somewhere permanent, such as Documents, before turning on **Start with Windows**. If you move the folder later, turn that setting off and on again.

## Install and start on a Mac

1. Double-click `DeskBuddy-Mac.zip` in your Downloads folder. It unzips to **Desk Buddy**.
2. Drag **Desk Buddy** into your **Applications** folder.
3. Open it from Applications. The first time, the Mac says it can't check the app for malicious software (the app isn't registered with Apple). Click **Done** (or **Cancel**).
4. Open **System Settings → Privacy & Security**, scroll down to the message about Desk Buddy and click **Open Anyway**, then enter your password. On older macOS you can instead right-click the app and choose **Open**.
5. She appears in the bottom-right corner and waves. Her pink drop icon is in the **menu bar** at the top right of the screen; she has no Dock icon.

If the Mac says the app **"is damaged"**, open **Terminal** and run this once, then open her again:

```
xattr -dr com.apple.quarantine "/Applications/Desk Buddy.app"
```

## Using her

To see which version you have, open **Settings** (the version is under her name) or hover over her tray icon.


- **Hover over her** for the control bar: turn off, start focus, today's glasses of water, mute.
- **Drag her** anywhere on the screen. She remembers the spot.
- **Right-click her**, or click her **pink drop icon** (near the clock on Windows, in the menu bar on a Mac), for the menu: turn on or off, start focus, sound, eye-rest and posture reminders, size, start at login, settings, quit.
- When she's **off**, click the grey drop icon to turn her back on. (On Windows, if you can't see it, click the small **^** arrow near the clock.)
- **Click her** for a wave and a cute line.
- On a Mac she follows you to every desktop (Space), and stays visible over full-screen apps.

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

Download and install as above on the new laptop. Her settings, water count and position are saved only on each laptop, in:

- Windows: `%APPDATA%\Desk Buddy\desk-buddy.json`
- Mac: `~/Library/Application Support/Desk Buddy/desk-buddy.json`

To bring your settings along, copy that file to the same place on the new laptop while she isn't running. It works between Windows and Mac too.

## For developers

### Run from the code

```
npm install
npm start
```

### Build the apps

```
npm run dist                        # Windows: dist/DeskBuddy/DeskBuddy.exe (from any computer)
npm run dist -- darwin universal    # Mac: dist/DeskBuddy-mac/Desk Buddy.app (on a Mac)
```

A Mac build must be signed on a Mac before it opens: `codesign --force --deep --sign - "dist/DeskBuddy-mac/Desk Buddy.app"`.

GitHub builds both on every push (**Actions** tab → **Build for Windows and Mac**): Windows on a Windows machine, Mac on a Mac (one app for Intel and Apple Silicon, signed ad-hoc). Pushes to the main branch publish `DeskBuddy.zip` and `DeskBuddy-Mac.zip` as a GitHub Release, one per app version: raise `version` in `package.json` to start a new release, otherwise the current version's release is replaced with the newest build. To rebuild without a code change, open **Actions** → **Build for Windows and Mac** → **Run workflow**.

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
- `tools/make_icons.py` – draws the tray icons and the Windows (`.ico`) and Mac (`.icns`) app icons.
- `tools/build.mjs` – packages the app for Windows or Mac (`npm run dist`).
- `.github/workflows/build.yml` – builds the Windows and Mac apps on GitHub and publishes the release.

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
