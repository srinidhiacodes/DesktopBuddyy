// Settings, water count, position and on/off, saved as one JSON file in the
// user's app-data folder. Nothing leaves the laptop.

const fs = require('fs');
const path = require('path');

// [default, min, max] for number settings. Water, focus and break are from the brief.
const NUMBERS = {
  waterEvery: [30, 15, 120],  // minutes between water reminders
  snooze: [10, 5, 30],        // minutes "Later" waits
  goal: [8, 4, 15],           // glasses a day
  focus: [25, 10, 90],        // minutes
  break: [5, 2, 30],          // minutes
  eyesEvery: [20, 10, 60],    // minutes between eye-rest reminders (20-20-20 rule)
  postureEvery: [60, 15, 120],// minutes between posture reminders
};
const SWITCHES = { sound: true, startWithWindows: false, eyes: true, posture: true };
const SIZES = ['small', 'medium', 'large'];

// What she says. A custom message left empty uses these.
const DEFAULT_MESSAGES = {
  water: 'Time for water!',
  focus: "Let's focus! You've got this.",
  stretch: 'Great work! Stretch with me.',
  eyes: 'Rest your eyes!',
  posture: 'Sit up straight!',
  lines: [
    "You're doing great!",
    "Don't forget to blink!",
    'Proud of you!',
    'One step at a time.',
    "Hi! I'm still here.",
    'You make this desk look good.',
    'Deep breath in… and out.',
    'Small breaks, big focus.',
  ].join('\n'),
};
const MESSAGE_MAX = 60;       // characters for one bubble line
const LINES_MAX = 20;         // cute lines

function defaults() {
  const settings = {};
  for (const [k, [d]] of Object.entries(NUMBERS)) settings[k] = d;
  Object.assign(settings, SWITCHES, { size: 'medium' });
  settings.messages = Object.fromEntries(Object.keys(DEFAULT_MESSAGES).map(k => [k, '']));
  return { settings, water: { day: '', count: 0 }, position: null, on: true };
}

function cleanMessages(m) {
  const out = defaults().settings.messages;
  if (!m || typeof m !== 'object') return out;
  for (const key of Object.keys(out)) {
    if (typeof m[key] !== 'string') continue;
    out[key] = key === 'lines'
      ? m[key].split('\n').map(l => l.trim().slice(0, MESSAGE_MAX)).filter(Boolean).slice(0, LINES_MAX).join('\n')
      : m[key].replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX);
  }
  return out;
}

function cleanSettings(s) {
  const out = defaults().settings;
  for (const [k, [, min, max]] of Object.entries(NUMBERS)) {
    const v = Math.round(Number(s?.[k]));
    if (Number.isFinite(v)) out[k] = Math.min(max, Math.max(min, v));
  }
  for (const k of Object.keys(SWITCHES)) {
    if (typeof s?.[k] === 'boolean') out[k] = s[k];
  }
  if (SIZES.includes(s?.size)) out.size = s.size;
  out.messages = cleanMessages(s?.messages);
  return out;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'desk-buddy.json');
    this.data = defaults();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data.settings = cleanSettings(raw.settings);
      if (raw.water && typeof raw.water.day === 'string') {
        this.data.water = { day: raw.water.day, count: Math.max(0, Math.round(raw.water.count) || 0) };
      }
      if (raw.position && Number.isFinite(raw.position.x) && Number.isFinite(raw.position.y)) {
        this.data.position = { x: Math.round(raw.position.x), y: Math.round(raw.position.y) };
      }
      if (typeof raw.on === 'boolean') this.data.on = raw.on;
    } catch {
      // First run, or the file is unreadable: start from defaults.
    }
    this.timer = null;
  }

  get settings() { return this.data.settings; }

  // Back to the defaults. "Start with Windows" and custom messages are kept.
  resetSettings() {
    const { startWithWindows, messages } = this.data.settings;
    return this.setSettings({ ...defaults().settings, startWithWindows, messages });
  }

  // Messages are merged key by key, so one field can change on its own.
  setSettings(patch) {
    const next = { ...this.data.settings, ...patch };
    if (patch && patch.messages) next.messages = { ...this.data.settings.messages, ...patch.messages };
    this.data.settings = cleanSettings(next);
    this.save();
    return this.data.settings;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  // Writes are batched and go through a temp file so a crash can't leave half a file.
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('Could not save settings:', err);
    }
  }
}

module.exports = { Store, SIZES, NUMBERS, DEFAULT_MESSAGES, defaults };
