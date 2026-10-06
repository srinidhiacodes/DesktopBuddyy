// Settings, water count, position and on/off, saved as one JSON file in the
// user's app-data folder. Nothing leaves the laptop.

const fs = require('fs');
const path = require('path');

// [default, min, max] for number settings, from the brief.
const NUMBERS = {
  waterEvery: [30, 15, 120],  // minutes between water reminders
  snooze: [10, 5, 30],        // minutes "Later" waits
  goal: [8, 4, 15],           // glasses a day
  focus: [25, 10, 90],        // minutes
  break: [5, 2, 30],          // minutes
};
const SIZES = ['small', 'medium', 'large'];

function defaults() {
  const settings = {};
  for (const [k, [d]] of Object.entries(NUMBERS)) settings[k] = d;
  Object.assign(settings, { size: 'medium', sound: true, startWithWindows: false });
  return { settings, water: { day: '', count: 0 }, position: null, on: true };
}

function cleanSettings(s) {
  const out = defaults().settings;
  for (const [k, [, min, max]] of Object.entries(NUMBERS)) {
    const v = Math.round(Number(s?.[k]));
    if (Number.isFinite(v)) out[k] = Math.min(max, Math.max(min, v));
  }
  if (SIZES.includes(s?.size)) out.size = s.size;
  if (typeof s?.sound === 'boolean') out.sound = s.sound;
  if (typeof s?.startWithWindows === 'boolean') out.startWithWindows = s.startWithWindows;
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

  setSettings(patch) {
    this.data.settings = cleanSettings({ ...this.data.settings, ...patch });
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

module.exports = { Store, SIZES };
