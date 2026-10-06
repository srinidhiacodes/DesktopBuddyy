// The only bridge between her window and the main process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  init: () => ipcRenderer.invoke('init'),
  setWater: water => ipcRenderer.send('set-water', water),
  setSettings: patch => ipcRenderer.send('set-settings', patch),
  setPower: on => ipcRenderer.send('set-power', on),
  setInteractive: on => ipcRenderer.send('set-interactive', on),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: () => ipcRenderer.send('drag-move'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  on: (channel, fn) => {
    if (['power', 'locked', 'settings', 'command'].includes(channel)) {
      ipcRenderer.on(channel, (_e, value) => fn(value));
    }
  },
});
