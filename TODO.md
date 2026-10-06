# Desk Buddy – to-do

- [x] **Step 1 – Clean the clips.** Green removed, she's lined up in every clip, saved as see-through WebM.
- [x] **Step 2 – Her window.** Floats on top with no frame, speech bubble, control bar on hover, drag to move, clicks pass through empty space, tray icon, water / focus / break timers, water count saved, chime, pauses when locked.
- [x] **Step 3 – Settings window.** Sliders for water interval, snooze, daily goal, focus and break length; size, chime and start with Windows; reset to defaults. Open it from the tray icon or by right-clicking her.
- [x] **Step 4 – Build `DeskBuddy.exe`.** `npm run dist` builds it; Permanent download: https://github.com/srinidhiacodes/DesktopBuddyy/releases/latest/download/DeskBuddy.zip (GitHub rebuilds it on every push). About 155 MB. No internet use at all.
- [ ] **Step 5 – Test on your Windows laptop.** Run it and report anything that looks or feels wrong.
- [ ] **Step 6 – Fix what you find.**

## Decided
- Water reminders wait until a focus session ends.
- Water count resets at midnight.
- Start with Windows is off by default.
- Chime is a soft two-note sound made by the app (no sound file).
- Name: Desk Buddy.
