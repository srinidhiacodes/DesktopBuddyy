// Desk Buddy settings window. Every change is sent straight to the main
// process, which saves it and updates her.

'use strict';

const api = window.buddy;
const $ = id => document.getElementById(id);

// Slider steps; the ranges themselves come from the main process.
const STEPS = { waterEvery: 5, snooze: 5, goal: 1, focus: 5, break: 1, eyesEvery: 5, postureEvery: 15 };
const SWITCHES = ['sound', 'startWithWindows', 'eyes', 'posture'];

let sendTimer = null;
let pending = {};

// Sliders send while dragging, at most a few times a second.
function queue(patch) {
  const messages = { ...pending.messages, ...patch.messages };
  Object.assign(pending, patch);
  if (patch.messages) pending.messages = messages;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(flush, 150);
}
function flush() {
  clearTimeout(sendTimer);
  if (Object.keys(pending).length) api.setSettings(pending);
  pending = {};
}

function label(input) {
  const unit = input.dataset.unit;
  const v = Number(input.value);
  return unit === 'glasses' ? `${v} glass${v === 1 ? '' : 'es'}` : `${v} ${unit}`;
}

function paintSlider(input) {
  const min = Number(input.min), max = Number(input.max);
  input.style.setProperty('--fill', `${((input.value - min) / (max - min)) * 100}%`);
  $(`${input.id}-out`).textContent = label(input);
}

function show(settings) {
  for (const key of Object.keys(STEPS)) {
    const input = $(key);
    if (document.activeElement !== input) input.value = settings[key];
    paintSlider(input);
  }
  $(`size-${settings.size}`).checked = true;
  for (const key of SWITCHES) $(key).checked = settings[key];
  // An interval slider is dimmed and locked while its reminder is off.
  document.querySelectorAll('[data-needs]').forEach(row => {
    const off = !settings[row.dataset.needs];
    row.classList.toggle('off', off);
    row.querySelector('input').disabled = off;
  });
  document.querySelectorAll('[data-msg]').forEach(el => {
    if (document.activeElement !== el) el.value = settings.messages[el.dataset.msg] || '';
  });
}

(async () => {
  const init = await api.init();
  $('name').textContent = init.name;
  document.title = `${init.name} settings`;

  for (const [key, step] of Object.entries(STEPS)) {
    const input = $(key);
    const [, min, max] = init.limits[key];
    Object.assign(input, { min, max, step });
    input.addEventListener('input', () => {
      paintSlider(input);
      queue({ [key]: Number(input.value) });
    });
    input.addEventListener('change', flush);
  }
  document.querySelectorAll('input[name="size"]').forEach(r =>
    r.addEventListener('change', () => api.setSettings({ size: r.value })));
  for (const key of SWITCHES) {
    $(key).addEventListener('change', () => api.setSettings({ [key]: $(key).checked }));
  }

  document.querySelectorAll('[data-msg]').forEach(el => {
    el.placeholder = init.defaultMessages[el.dataset.msg];
    el.addEventListener('input', () => queue({ messages: { [el.dataset.msg]: el.value } }));
    el.addEventListener('change', flush);
  });

  $('reset').onclick = () => api.resetSettings();
  $('done').onclick = () => { flush(); api.closeSettings(); };
  window.addEventListener('beforeunload', flush);

  show(init.settings);
  api.settingsReady(document.documentElement.scrollHeight);
  api.on('settings', ({ settings }) => show(settings));
})();
