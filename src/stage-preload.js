const { contextBridge, ipcRenderer } = require('electron');

// Preload вікна Stage Monitor. Ізольований контекст (як у головного вікна) —
// цій сторінці не потрібен webview чи доступ до Node, лише прийом контенту.
contextBridge.exposeInMainWorld('stageAPI', {
  onContent: (cb) => ipcRenderer.on('stage-content', (e, data) => cb(data))
});
