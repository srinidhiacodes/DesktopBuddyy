# Desk Buddy – to-do

- [x] **Step 1 – Clean the clips.** Green removed, she's lined up in every clip, saved as see-through WebM.
- [x] **Step 2 – Her window.** Floats on top with no frame, speech bubble, control bar on hover, drag to move, clicks pass through empty space, tray icon, water / focus / break timers, water count saved, chime, pauses when locked.
- [x] **Step 3 – Settings window.** Sliders for water interval, snooze, daily goal, focus and break length; size, chime and start with Windows; reset to defaults. Open it from the tray icon or by right-clicking her.
- [x] **Step 4 – Build `DeskBuddy.exe`.** `npm run dist` builds it; Permanent download: https://github.com/srinidhiacodes/DesktopBuddyy/releases/latest/download/DeskBuddy.zip (GitHub rebuilds it on every push). About 155 MB. No internet use at all.
- [x] **Step 5 – Test on your Windows laptop.** Tested and working.
- [x] **Step 6 – Bug review.** Fixed: animation restarting behind the lock screen after sleep; window size changing when dragged between screens with different scaling; a timer ending during the water question replacing her drinking clip; a start-up timing crash.

## Round 2
- [x] Eye-rest reminder (20-20-20), every 20 min, with a 20-second countdown.
- [x] Posture reminder, every 60 min.
- [x] Click her for a wave and a cute line.
- [x] Custom messages in Settings (each reminder line and the cute lines).
- [x] App ready for a laptop "work" clip during focus.
- [x] Laptop clip made in Google Flow and added: she types on her laptop during focus.
- [x] Fixed: bubble buttons couldn't be clicked (her video box covered the bubble).
- [x] Fixed: bubble buttons still unclickable on Windows. The app now checks where the pointer is itself (about 12 times a second) instead of relying on mouse events reaching a click-through window. Version 0.2.0; the version shows in Settings and in the tray tooltip.

## Mac
- [x] Works on Mac: menu-bar icon, no Dock icon, on every desktop and over full-screen apps, copy/paste in Settings, "Open at login".
- [x] Mac download (`DeskBuddy-Mac.zip`, Intel + Apple Silicon) built and signed on a GitHub Mac.
- [ ] Test on a real Mac.

## Decided
- Water reminders wait until a focus session ends.
- Water count resets at midnight.
- Start with Windows is off by default.
- Chime is a soft two-note sound made by the app (no sound file).
- Name: Desk Buddy.
- During focus, eye-rest and posture reminders are skipped; water waits.
- One reminder at a time, in this order: water, eye rest, posture.
