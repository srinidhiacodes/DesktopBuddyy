// Desk Buddy: what she plays, what her bubble says, and the water, focus and
// break timers. The behaviour follows the "What triggers what" table in the brief.

'use strict';

const $ = id => document.getElementById(id);
const api = window.buddy;
const MASKS = window.BUDDY_MASKS;
const MIN = 60 * 1000;
const IDLE = ['idle1', 'idle2'];
const SHORT_MESSAGE = 3500;     // how long "Nice!" style messages stay up
const COMPACT_AFTER = 8000;     // focus bubble drops its title after this

let settings, water;
let on = true, locked = false;

// ---- Clips ------------------------------------------------------------------
// Two stacked videos: the next clip loads in the hidden one, then they crossfade.
// Action clips play once, then she goes back to alternating idle clips.

const videos = [$('vid-a'), $('vid-b')];
let front = 0, clip = null, idleTurn = 0;

function play(name) {
  const cur = videos[front], next = videos[1 - front];
  clip = name;
  document.body.dataset.clip = name;
  next.onended = () => { if (clip === name) playIdle(); };
  next.src = `../media/${name}.webm`;
  const swap = () => {
    if (clip !== name) return;
    next.classList.add('on');
    cur.classList.remove('on');
    front = videos.indexOf(next);
    setTimeout(() => { if (videos[front] !== cur) cur.pause(); }, 300);
  };
  if (!paused()) next.play().catch(() => {});
  if (next.readyState >= 2) swap(); else next.addEventListener('loadeddata', swap, { once: true });
}

function playIdle() { play(IDLE[idleTurn++ % IDLE.length]); }

function paused() { return !on || locked; }

function applyPause() {
  for (const v of videos) {
    if (paused()) v.pause();
    else if (v === videos[front] && v.src) v.play().catch(() => {});
  }
}

// ---- Sound ------------------------------------------------------------------
// A soft two-note chime, made on the fly so no sound file is needed.

let audio = null;
function chime() {
  if (!settings.sound) return;
  audio = audio || new AudioContext();
  const t = audio.currentTime + 0.02;
  [[880, 0, 0.16], [1318.5, 0.16, 0.13]].forEach(([freq, delay, peak]) => {
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(peak, t + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 1.5);
  });
}

// ---- Water count ------------------------------------------------------------

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A new day starts the count again.
function checkDay() {
  if (water.day !== today()) {
    water = { day: today(), count: 0 };
    api.setWater(water);
    updateBar();
  }
}

// ---- State ------------------------------------------------------------------
// base:   idle | focus | focusDone | break | breakDone
// prompt: 'water' while the water question is open
// note:   a short message (greeting, "Nice!", ...) that clears itself

const state = {
  base: 'idle',
  focusStart: 0, focusEnd: 0,
  breakStart: 0, breakEnd: 0,
  waterDue: 0, waterWaiting: false,
  prompt: null,
  note: null, noteUntil: 0, noteDone: null,
  pausedAt: 0,
};

function note(view, ms, done) {
  state.note = view;
  state.noteUntil = Date.now() + ms;
  state.noteDone = done || null;
  render();
}

function greet() {
  play('focus');
  note({ key: 'greet', title: "Hi! I'm here." }, 5000);
}

// Water waits while she is busy (focus, or a question already on screen).
function canAskWater() {
  return !state.prompt && !state.note && (state.base === 'idle' || state.base === 'break');
}

function askWater() {
  state.waterWaiting = false;
  state.prompt = 'water';
  play('drink');
  chime();
  render();
}

function drank() {
  checkDay();
  water = { day: water.day, count: water.count + 1 };
  api.setWater(water);
  state.prompt = null;
  state.waterDue = Date.now() + settings.waterEvery * MIN;
  updateBar();
  const msg = water.count >= settings.goal
    ? `Goal reached! ${water.count} of ${settings.goal} today.`
    : `Nice! ${water.count} of ${settings.goal} glasses today.`;
  note({ key: 'drank', title: msg }, SHORT_MESSAGE);
}

function later() {
  state.prompt = null;
  state.waterDue = Date.now() + settings.snooze * MIN;
  note({ key: 'later', title: `Okay! I'll ask again in ${settings.snooze} min.` }, SHORT_MESSAGE);
}

function startFocus() {
  const now = Date.now();
  if (state.prompt === 'water') { state.prompt = null; state.waterWaiting = true; }
  state.note = null;
  state.base = 'focus';
  state.focusStart = now;
  state.focusEnd = now + settings.focus * MIN;
  play('focus');
  render();
}

function stopFocus() { state.base = 'idle'; render(); }

function focusDone() {
  state.base = 'focusDone';
  play('stretch');
  chime();
  render();
}

function startBreak() {
  const now = Date.now();
  state.base = 'break';
  state.breakStart = now;
  state.breakEnd = now + settings.break * MIN;
  render();
}

function breakDone() {
  state.base = 'breakDone';
  play('focus');
  chime();
  render();
}

function toIdle() { state.base = 'idle'; render(); }

function turnOff() {
  note({ key: 'bye', title: 'See you soon' }, 1200, () => api.setPower(false));
}

// ---- Timers -------------------------------------------------------------------

let ticker = null;

function tick() {
  const now = Date.now();
  checkDay();
  if (state.note && now >= state.noteUntil) {
    const done = state.noteDone;
    state.note = null;
    state.noteDone = null;
    render();
    if (done) done();
  }
  if (state.base === 'focus' && now >= state.focusEnd) focusDone();
  if (state.base === 'break' && now >= state.breakEnd) breakDone();
  if (state.waterDue && now >= state.waterDue) { state.waterDue = 0; state.waterWaiting = true; }
  if (state.waterWaiting && canAskWater()) askWater();
  updateLive();
}

function startTicking() { if (!ticker) ticker = setInterval(tick, 1000); }
function stopTicking() { clearInterval(ticker); ticker = null; }

// Off pauses every timer; they carry on from where they were when she's back.
function setOn(value) {
  if (value === on) return;
  on = value;
  const now = Date.now();
  if (!on) {
    state.pausedAt = now;
    state.note = null;
    stopTicking();
    render();
  } else {
    const gap = now - (state.pausedAt || now);
    for (const k of ['focusStart', 'focusEnd', 'breakStart', 'breakEnd', 'waterDue']) {
      if (state[k]) state[k] += gap;
    }
    startTicking();
    greet();
  }
  applyPause();
}

// ---- Bubble -------------------------------------------------------------------

function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function waterView() {
  return {
    key: 'water',
    title: 'Time for water!',
    text: `You've had ${water.count} of ${settings.goal} glasses today.`,
    glasses: true,
    primary: ['Done, I drank', drank],
    secondary: ['Later', later],
  };
}

function baseView() {
  switch (state.base) {
    case 'focus': return {
      key: 'focus',
      title: "Let's focus! You've got this.",
      compact: () => Date.now() >= state.focusStart + COMPACT_AFTER,
      timer: () => state.focusEnd - Date.now(),
      progress: () => (Date.now() - state.focusStart) / (state.focusEnd - state.focusStart),
      timerButton: ['Stop', stopFocus],
    };
    case 'focusDone': return {
      key: 'focusDone',
      title: 'Great work! Stretch with me.',
      text: `${settings.break} minute break. Look away from the screen.`,
      primary: ['Start break', startBreak],
      secondary: ['Skip', toIdle],
    };
    case 'break': return {
      key: 'break',
      title: 'Break time. Rest your eyes.',
      timer: () => state.breakEnd - Date.now(),
      progress: () => (Date.now() - state.breakStart) / (state.breakEnd - state.breakStart),
      timerButton: ['Skip', toIdle],
    };
    case 'breakDone': return {
      key: 'breakDone',
      title: 'Ready for another round?',
      primary: ['Start focus', startFocus],
      secondary: ['Not now', toIdle],
    };
    default: return null;
  }
}

function currentView() {
  if (!on) return null;
  if (state.note) return state.note;
  if (state.prompt === 'water') return waterView();
  return baseView();
}

const bubble = $('bubble');
let shown = null;   // the view on screen, so buttons are only rebuilt when it changes

function render() {
  const view = currentView();
  updateBar();
  if (!view) { bubble.hidden = true; shown = null; return; }
  const key = view.key + '|' + (view.text || '') + '|' + (view.glasses ? water.count + '/' + settings.goal : '');
  if (shown && shown.k === key) { shown.view = view; updateLive(); return; }
  shown = { k: key, view };

  $('b-title').textContent = view.title || '';
  $('b-text').textContent = view.text || '';
  $('b-text').hidden = !view.text;

  const glasses = $('b-glasses');
  glasses.hidden = !view.glasses;
  glasses.replaceChildren();
  if (view.glasses) {
    for (let i = 0; i < settings.goal; i++) {
      const g = document.createElement('span');
      g.className = 'glass' + (i < water.count ? ' full' : '');
      glasses.append(g);
    }
  }

  $('b-timer').hidden = !view.timer;
  $('b-progress').hidden = !view.progress;
  setButton($('b-timer-btn'), view.timerButton);

  $('b-actions').hidden = !view.primary;
  setButton($('b-primary'), view.primary);
  setButton($('b-secondary'), view.secondary);

  bubble.classList.remove('compact');
  bubble.hidden = false;
  updateLive();
}

function setButton(el, spec) {
  el.hidden = !spec;
  if (!spec) { el.onclick = null; return; }
  el.textContent = spec[0];
  el.onclick = spec[1];
}

// The parts that change every second: countdown, progress, compact focus bubble.
function updateLive() {
  const view = shown && shown.view;
  if (!view) return;
  if (view.timer) $('b-clock').textContent = clockText(view.timer());
  if (view.progress) $('b-progress-fill').style.width = `${Math.min(100, Math.max(0, view.progress() * 100))}%`;
  bubble.classList.toggle('compact', Boolean(view.compact && view.compact()));
}

// ---- Control bar ----------------------------------------------------------------

const bar = $('bar');

function updateBar() {
  if (!settings) return;
  const focusing = state.base === 'focus';
  $('bar-focus-label').textContent = focusing ? 'Stop focus' : 'Start focus';
  $('bar-water-count').textContent = `${water.count}/${settings.goal}`;
  document.body.classList.toggle('muted', !settings.sound);
  const sound = $('bar-sound');
  sound.setAttribute('aria-label', settings.sound ? 'Mute' : 'Unmute');
  sound.title = settings.sound ? 'Mute' : 'Unmute';
}

$('bar-power').onclick = turnOff;
$('bar-focus').onclick = () => (state.base === 'focus' ? stopFocus() : startFocus());
$('bar-sound').onclick = () => api.setSettings({ sound: !settings.sound });

let hideBarTimer = null;
function showBar() {
  clearTimeout(hideBarTimer);
  bar.classList.add('show');
}
function hideBarSoon() {
  clearTimeout(hideBarTimer);
  hideBarTimer = setTimeout(() => bar.classList.remove('show'), 1200);
}

// ---- Clicks pass through empty space ---------------------------------------------
// The window ignores the mouse except over her, the bubble or the bar. Over her,
// the click map for the current clip says which spots are her and which are empty.

const charEl = $('char');
let interactive = false;

function overHer(x, y) {
  const r = charEl.getBoundingClientRect();
  if (x < r.left || x >= r.right || y < r.top || y >= r.bottom || !clip) return false;
  const rows = MASKS.clips[clip];
  const col = Math.floor(((x - r.left) / r.width) * MASKS.width / MASKS.cell);
  const row = Math.floor(((y - r.top) / r.height) * MASKS.height / MASKS.cell);
  return rows[row] ? rows[row][col] === '1' : false;
}

function hitTest(x, y) {
  const el = document.elementFromPoint(x, y);
  if (el && el.closest('#bubble, #bar')) return 'ui';
  return overHer(x, y) ? 'her' : null;
}

function setInteractive(value) {
  if (value === interactive) return;
  interactive = value;
  api.setInteractive(value);
}

document.addEventListener('mousemove', e => {
  if (dragging) return;
  const hit = hitTest(e.clientX, e.clientY);
  setInteractive(Boolean(hit));
  if (hit) showBar(); else hideBarSoon();
});
document.addEventListener('mouseleave', () => {
  if (dragging) return;
  setInteractive(false);
  hideBarSoon();
});

// ---- Drag her anywhere ----------------------------------------------------------

let pressed = null, dragging = false;

charEl.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  pressed = { x: e.screenX, y: e.screenY };
  charEl.setPointerCapture(e.pointerId);
});
charEl.addEventListener('pointermove', e => {
  if (!pressed) return;
  if (!dragging) {
    if (Math.hypot(e.screenX - pressed.x, e.screenY - pressed.y) < 4) return;
    dragging = true;
    api.dragStart();
  }
  api.dragMove();
});
const endDrag = () => {
  if (dragging) api.dragEnd();
  pressed = null;
  dragging = false;
};
charEl.addEventListener('pointerup', endDrag);
charEl.addEventListener('pointercancel', endDrag);

// ---- Start-up ---------------------------------------------------------------------

function applyLayout(l) {
  const root = document.documentElement.style;
  root.setProperty('--char-w', `${l.charW}px`);
  root.setProperty('--char-h', `${l.charH}px`);
  root.setProperty('--bar-h', `${l.barH}px`);
  root.setProperty('--bubble-w', `${l.bubbleW}px`);
}

api.on('power', value => setOn(value));
api.on('locked', value => { locked = value; applyPause(); });
api.on('command', cmd => { if (cmd === 'start-focus' && on) startFocus(); });
api.on('settings', ({ settings: s, layout }) => {
  const intervalChanged = s.waterEvery !== settings.waterEvery;
  settings = s;
  applyLayout(layout);
  if (intervalChanged && state.waterDue) state.waterDue = Date.now() + s.waterEvery * MIN;
  shown = null;
  render();
});

(async () => {
  const init = await api.init();
  settings = init.settings;
  water = init.water;
  applyLayout(init.layout);
  checkDay();
  state.waterDue = Date.now() + settings.waterEvery * MIN;
  on = init.on;
  if (on) {
    greet();
    startTicking();
  } else {
    state.pausedAt = Date.now();
    playIdle();
    applyPause();
  }
  updateBar();
})();
