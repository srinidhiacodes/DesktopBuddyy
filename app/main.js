// Desk Buddy main process: her see-through window, the tray icon near the
// clock, saving, and pausing when the screen is locked.

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, powerMonitor, nativeImage } = require('electron');
const path = require('path');
const { Store } = require('./store');

const NAME = 'Desk Buddy';
const CHAR_WIDTH = { small: 200, medium: 260, large: 330 };
const VIDEO = { w: 532, h: 810 };     // size of the cleaned clips
const BUBBLE_W = 290;                 // speech bubble width
const BUBBLE_SPACE = 240;             // room above her head for the bubble
const BAR_SPACE = 64;                 // room under her for the control bar
const SIDE = 10;
const EDGE = 8;                       // gap from the screen edge on first run

let store, win, tray;
let interactive = false;
let drag = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setPower(true));
  app.whenReady().then(start);
}

function layout(size) {
  const charW = CHAR_WIDTH[size] || CHAR_WIDTH.medium;
  const charH = Math.round(charW * VIDEO.h / VIDEO.w);
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
  store = new Store(app.getPath('userData'));
  app.setAppUserModelId('com.deskbuddy.app');

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
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (store.data.on) win.showInactive(); });

  makeTray();
  applyStartWithWindows();

  powerMonitor.on('lock-screen', () => send('locked', true));
  powerMonitor.on('unlock-screen', () => send('locked', false));
  powerMonitor.on('suspend', () => send('locked', true));
  powerMonitor.on('resume', () => send('locked', false));
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
  tray.on('click', () => {
    if (!store.data.on) setPower(true); else tray.popUpContextMenu();
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
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: on ? 'Turn off' : 'Turn on', click: () => setPower(!on) },
    { type: 'separator' },
    { label: 'Start focus', enabled: on, click: () => send('command', 'start-focus') },
    { label: 'Sound', type: 'checkbox', checked: s.sound, click: i => changeSettings({ sound: i.checked }) },
    { label: 'Size', submenu: ['small', 'medium', 'large'].map(size) },
    { label: 'Start with Windows', type: 'checkbox', checked: s.startWithWindows,
      click: i => changeSettings({ startWithWindows: i.checked }) },
    { label: 'Move back to corner', click: resetPosition },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function resetPosition() {
  const p = defaultPosition(layout(store.settings.size));
  win.setPosition(p.x, p.y);
  store.set('position', null);
}

// ---- Settings -------------------------------------------------------------

function changeSettings(patch) {
  const before = store.settings.size;
  const s = store.setSettings(patch);
  if (s.size !== before) resize(before, s.size);
  if ('startWithWindows' in patch) applyStartWithWindows();
  send('settings', { settings: s, layout: layout(s.size) });
  updateTray();
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
ipcMain.on('set-power', (_e, on) => setPower(Boolean(on)));

// Clicks on empty space go through to the apps behind her.
ipcMain.on('set-interactive', (_e, on) => {
  on = Boolean(on);
  if (on === interactive || drag) return;
  interactive = on;
  win.setIgnoreMouseEvents(!on, { forward: true });
});

// Dragging: positions come from the real cursor, so screen scaling can't throw it off.
ipcMain.on('drag-start', () => {
  const c = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  drag = { dx: c.x - x, dy: c.y - y };
});
ipcMain.on('drag-move', () => {
  if (!drag) return;
  const c = screen.getCursorScreenPoint();
  win.setPosition(c.x - drag.dx, c.y - drag.dy);
});
ipcMain.on('drag-end', () => {
  if (!drag) return;
  drag = null;
  const [x, y] = win.getPosition();
  store.set('position', { x, y });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => store && store.flush());
