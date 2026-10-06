// Desk Buddy main process: her see-through window, the tray icon near the
// clock (the menu bar on a Mac), saving, and pausing when the screen is locked.
// Runs on Windows and macOS.

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, powerMonitor, nativeImage, session } = require('electron');
const path = require('path');
const { Store, NUMBERS, DEFAULT_MESSAGES } = require('./store');

const NAME = 'Desk Buddy';
const IS_MAC = process.platform === 'darwin';
const LOGIN_LABEL = IS_MAC ? 'Open at login' : 'Start with Windows';
// Her clip height on screen per size (medium is about a palm's height). Sized by
// height so she stays the same size when the clips get wider room at the sides.
const CHAR_HEIGHT = { small: 305, medium: 396, large: 502 };
const VIDEO = require('./media/clips.json');   // size of the cleaned clips, written by tools/clean_clips.py
const BUBBLE_W = 290;                 // speech bubble width
const BUBBLE_SPACE = 240;             // room above her head for the bubble
const BAR_SPACE = 64;                 // room under her for the control bar
const SIDE = 10;
const EDGE = 8;                       // gap from the screen edge on first run

let store, win, tray, menu, settingsWin;
let interactive = false;
let drag = null;
// Her animation pauses while the screen is locked or the laptop is asleep.
// The two are tracked apart: waking from sleep can still leave the screen locked.
const resting = { locked: false, asleep: false };

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setPower(true));
  app.whenReady().then(start);
}

function layout(size) {
  const charH = CHAR_HEIGHT[size] || CHAR_HEIGHT.medium;
  const charW = Math.round(charH * VIDEO.width / VIDEO.height);
  return {
    charW, charH, bubbleW: BUBBLE_W, barH: BAR_SPACE,
    width: Math.max(charW, BUBBLE_W) + SIDE * 2,
    height: BUBBLE_SPACE + charH + BAR_SPACE,
  };
}

// Bottom-right corner of the main screen, above the taskbar.
function defaultPosition(l) {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - l.width - EDGE, y: wa.y + wa.height - l.height };
}

// A saved spot is used only if her body would still be on some screen
// (a monitor may have been unplugged since).
function onScreen(pos, l) {
  const cx = pos.x + l.width / 2;
  const cy = pos.y + l.height - BAR_SPACE - l.charH / 2;
  return screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height;
  });
}

function start() {
  // No internet: switch off the spell-checker, which would download a dictionary.
  session.defaultSession.setSpellCheckerEnabled(false);
  session.defaultSession.setSpellCheckerLanguages([]);
  store = new Store(app.getPath('userData'));
  app.setAppUserModelId('com.deskbuddy.app');
  if (IS_MAC) {
    // She lives in the menu bar, not the Dock. The Edit menu makes copy and
    // paste work in the settings window's text boxes.
    if (app.dock) app.dock.hide();
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
  }

  const l = layout(store.settings.size);
  let pos = store.data.position;
  if (!pos || !onScreen(pos, l)) pos = defaultPosition(l);

  win = new BrowserWindow({
    ...pos, width: l.width, height: l.height,
    transparent: true, backgroundColor: '#00000000', frame: false, hasShadow: false,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false, title: NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      spellcheck: false,   // the spell-checker would download dictionaries; she stays offline
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // On a Mac, stay with the user on every desktop (Space), full-screen apps included.
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (store.data.on) win.showInactive(); });

  makeTray();
  applyStartWithWindows();

  const rest = (key, value) => {
    resting[key] = value;
    send('locked', resting.locked || resting.asleep);
  };
  powerMonitor.on('lock-screen', () => rest('locked', true));
  powerMonitor.on('unlock-screen', () => rest('locked', false));
  powerMonitor.on('suspend', () => rest('asleep', true));
  powerMonitor.on('resume', () => rest('asleep', false));
  screen.on('display-removed', keepOnScreen);
  screen.on('display-metrics-changed', keepOnScreen);
}

function send(channel, value) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}

function keepOnScreen() {
  const l = layout(store.settings.size);
  const [x, y] = win.getPosition();
  if (!onScreen({ x, y }, l)) {
    const p = defaultPosition(l);
    win.setPosition(p.x, p.y);
    store.set('position', null);
  }
}

// ---- On / off -------------------------------------------------------------

function setPower(on) {
  store.set('on', on);
  if (on) win.showInactive(); else win.hide();
  send('power', on);
  updateTray();
}

// ---- Tray icon --------------------------------------------------------------

function trayImage(on) {
  return nativeImage.createFromPath(path.join(__dirname, 'icons', on ? 'tray-on.png' : 'tray-off.png'));
}

function makeTray() {
  tray = new Tray(trayImage(store.data.on));
  // A click turns her on when she's off. On Windows it also opens the menu; on a
  // Mac the menu opens by itself, as menu-bar icons do.
  tray.on('click', () => {
    if (!store.data.on) setPower(true); else if (!IS_MAC) tray.popUpContextMenu();
  });
  updateTray();
}

function updateTray() {
  const on = store.data.on;
  const s = store.settings;
  tray.setImage(trayImage(on));
  tray.setToolTip(on ? NAME : `${NAME} (off)`);
  const size = name => ({
    label: name[0].toUpperCase() + name.slice(1), type: 'radio', checked: s.size === name,
    click: () => changeSettings({ size: name }),
  });
  menu = Menu.buildFromTemplate([
    { label: on ? 'Turn off' : 'Turn on', click: () => setPower(!on) },
    { type: 'separator' },
    { label: 'Start focus', enabled: on, click: () => send('command', 'start-focus') },
    { label: 'Sound', type: 'checkbox', checked: s.sound, click: i => changeSettings({ sound: i.checked }) },
    { label: 'Eye-rest reminders', type: 'checkbox', checked: s.eyes, click: i => changeSettings({ eyes: i.checked }) },
    { label: 'Posture reminders', type: 'checkbox', checked: s.posture, click: i => changeSettings({ posture: i.checked }) },
    { label: 'Size', submenu: ['small', 'medium', 'large'].map(size) },
    { label: LOGIN_LABEL, type: 'checkbox', checked: s.startWithWindows,
      click: i => changeSettings({ startWithWindows: i.checked }) },
    { label: 'Move back to corner', click: resetPosition },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function resetPosition() {
  const p = defaultPosition(layout(store.settings.size));
  win.setPosition(p.x, p.y);
  store.set('position', null);
}

// ---- Settings -------------------------------------------------------------

function changeSettings(patch, reset = false) {
  const before = store.settings;
  const s = reset ? store.resetSettings() : store.setSettings(patch);
  if (s.size !== before.size) resize(before.size, s.size);
  if (s.startWithWindows !== before.startWithWindows) applyStartWithWindows();
  const payload = { settings: s, layout: layout(s.size) };
  send('settings', payload);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings', payload);
  updateTray();
}

// A normal small window with a frame, opened from the menu.
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 420, height: 660, useContentSize: true, resizable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    title: `${NAME} settings`, icon: path.join(__dirname, 'icons', 'app.png'),
    autoHideMenuBar: true, backgroundColor: '#fbf6f9', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      spellcheck: false,   // the spell-checker would download dictionaries; she stays offline
    },
  });
  settingsWin.setMenu(null);
  settingsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWin.webContents.on('will-navigate', e => e.preventDefault());
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// Keep her feet in the same spot when she changes size.
function resize(from, to) {
  const a = layout(from), b = layout(to);
  const [x, y] = win.getPosition();
  const nx = Math.round(x + (a.width - b.width) / 2);
  const ny = y + a.height - b.height;
  win.setBounds({ x: nx, y: ny, width: b.width, height: b.height });
  if (store.data.position) store.set('position', { x: nx, y: ny });
}

function applyStartWithWindows() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: store.settings.startWithWindows });
}

// ---- Messages from her window ---------------------------------------------

ipcMain.handle('init', () => ({
  name: NAME,
  loginLabel: LOGIN_LABEL,
  limits: NUMBERS,
  defaultMessages: DEFAULT_MESSAGES,
  settings: store.settings,
  layout: layout(store.settings.size),
  water: store.data.water,
  on: store.data.on,
}));

ipcMain.on('set-water', (_e, water) => {
  if (water && typeof water.day === 'string' && Number.isFinite(water.count)) {
    store.set('water', { day: water.day, count: Math.max(0, Math.round(water.count)) });
  }
});

ipcMain.on('set-settings', (_e, patch) => changeSettings(patch || {}));
ipcMain.on('reset-settings', () => changeSettings({}, true));
ipcMain.on('open-settings', openSettings);
// The settings page reports its height so the window fits it (and the screen).
ipcMain.on('settings-ready', (_e, height) => {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  const wa = screen.getDisplayMatching(settingsWin.getBounds()).workArea;
  const h = Math.min(Math.round(Number(height)) || 660, 760, wa.height - 40);
  settingsWin.setContentSize(420, h);
  settingsWin.center();
  settingsWin.show();
});
ipcMain.on('close-settings', () => settingsWin && settingsWin.close());
ipcMain.on('show-menu', () => menu.popup({ window: win }));
ipcMain.on('set-power', (_e, on) => setPower(Boolean(on)));

// Clicks on empty space go through to the apps behind her.
ipcMain.on('set-interactive', (_e, on) => {
  on = Boolean(on);
  if (on === interactive || drag) return;
  interactive = on;
  win.setIgnoreMouseEvents(!on, { forward: true });
});

// Dragging: positions come from the real cursor, so screen scaling can't throw it off.
// The size is set on every move too: Windows can resize a see-through window
// when it crosses onto a screen with different scaling.
ipcMain.on('drag-start', () => {
  const c = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  const l = layout(store.settings.size);
  drag = { dx: c.x - x, dy: c.y - y, width: l.width, height: l.height };
});
ipcMain.on('drag-move', () => {
  if (!drag) return;
  const c = screen.getCursorScreenPoint();
  win.setBounds({ x: c.x - drag.dx, y: c.y - drag.dy, width: drag.width, height: drag.height });
});
ipcMain.on('drag-end', () => {
  if (!drag) return;
  drag = null;
  const [x, y] = win.getPosition();
  store.set('position', { x, y });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => store && store.flush());
