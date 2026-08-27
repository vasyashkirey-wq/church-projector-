const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Projector
  openProjector: () => ipcRenderer.invoke('open-projector'),
  closeProjector: () => ipcRenderer.invoke('close-projector'),
  projectorStatus: () => ipcRenderer.invoke('projector-status'),

  // Stream
  openStream: () => ipcRenderer.invoke('open-stream'),
  closeStream: () => ipcRenderer.invoke('close-stream'),
  streamStatus: () => ipcRenderer.invoke('stream-status'),
  openBothOutputs: () => ipcRenderer.invoke('open-both-outputs'),

  // Content
  sendToProjector: (type, payload) => ipcRenderer.invoke('send-to-projector', { type, payload }),
  convertMedia: (filePath) => ipcRenderer.invoke('convert-media', { filePath }),
  readFileDataUri: (filePath) => ipcRenderer.invoke('read-file-datauri', { filePath }),
  clearProjector: () => ipcRenderer.invoke('clear-projector'),
  onOutputClosed: (cb) => ipcRenderer.on('output-closed', (e, kind) => cb(kind)),

  // Theme
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  getTheme: () => ipcRenderer.invoke('get-theme'),

  // Remote phone control
  // Велике сховище файлами (синхронне — щоб працювало як localStorage)
  dataReadSync: (key) => ipcRenderer.sendSync('data-read-sync', key),
  // ФІКС (підвисання на Windows з великою базою даних, напр. 3300+ пісень):
  // раніше це були sendSync-виклики — рендерер БЛОКУВАВСЯ, доки головний
  // процес синхронно писав на диск (кілька мегабайт кожне збереження).
  // Тепер — fire-and-forget send() на окремому "async"-каналі; головний
  // процес сам гарантує, що запис дійде до диска перед виходом (дивись
  // pendingDataWrites/maybeFinishQuit у main.js). Назви методів лишили ті ж
  // самі (dataWriteSync/dataDeleteSync) — рендерер-код їх не викликає інакше.
  dataWriteSync: (key, content) => { ipcRenderer.send('data-write-async', { key, content }); return true; },
  dataDeleteSync: (key) => { ipcRenderer.send('data-delete-async', key); return true; },
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),

  cacheAsset: (name, content) => ipcRenderer.invoke('cache-asset', { name, content }),
  readCachedAsset: (name) => ipcRenderer.invoke('read-cached-asset', name),

  onOutputWarning: (cb) => ipcRenderer.on('output-warning', (e, d) => cb(d)),
  startRemote: (pin, users) => ipcRenderer.invoke('start-remote', pin, users),
  setRemoteUsers: (users) => ipcRenderer.invoke('set-remote-users', users),
  stopRemote: () => ipcRenderer.invoke('stop-remote'),
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  onRemoteCommand: (cb) => ipcRenderer.on('remote-command', (e, data) => cb(data)),
  broadcastState: (state) => ipcRenderer.invoke('broadcast-state', state),

  // Displays / monitors
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  setOutputDisplay: (kind, displayId) => ipcRenderer.invoke('set-output-display', { kind, displayId }),
  getOutputConfig: () => ipcRenderer.invoke('get-output-config'),
  onDisplaysChanged: (cb) => ipcRenderer.on('displays-changed', (e, list) => cb(list)),

  // 4 виходи: відкриття/закриття/статус/адресна відправка/фон
  openOutput: (kind) => ipcRenderer.invoke('open-output', kind),
  closeOutput: (kind) => ipcRenderer.invoke('close-output', kind),
  outputStatus: (kind) => ipcRenderer.invoke('output-status', kind),
  outputsStatus: () => ipcRenderer.invoke('outputs-status'),
  sendToOutput: (kind, type, payload) => ipcRenderer.invoke('send-to-output', { kind, type, payload }),
  setOutputBg: (kind, color) => ipcRenderer.invoke('set-output-bg', { kind, color }),
  setMirrorKinds: (kinds) => ipcRenderer.invoke('set-mirror-kinds', kinds),

  // PPTX / DOCX — витяг тексту (парситься в main-процесі)
  parseOffice: (filePath, ext) => ipcRenderer.invoke('parse-office', { filePath, ext }),

  // Вивід як у SoftProjector: поверх усіх вікон, режим одного монітора, кнопки на екрані
  setAlwaysOnTop: (on) => ipcRenderer.invoke('set-always-on-top', on),
  setSingleScreen: (on, controls) => ipcRenderer.invoke('set-single-screen', { on, controls }),
  onDisplayControl: (cb) => ipcRenderer.on('display-control', (e, action) => cb(action)),

  // GDD-графіка (H2R / CasparCG): update / play / stop
  gddCommand: (kind, action, data) => ipcRenderer.invoke('gdd-command', { kind, action, data }),
  generateQRCode: (text, size) => ipcRenderer.invoke('qrcode-generate', { text, size }),

  // Станції: хост ↔ клієнти
  startSyncServer: (pin) => ipcRenderer.invoke('start-sync-server', { pin }),
  stopSyncServer: () => ipcRenderer.invoke('stop-sync-server'),
  stationClients: () => ipcRenderer.invoke('station-clients'),
  stationBroadcast: (msg) => ipcRenderer.invoke('station-broadcast', msg),
  onStationCommand: (cb) => ipcRenderer.on('station-command', (e, c) => cb(c)),
  onStationClients: (cb) => ipcRenderer.on('station-clients', (e, list) => cb(list)),
  onStationError: (cb) => ipcRenderer.on('station-error', (e, err) => cb(err)),

  // OBS Studio
  obsConnect: (url, password) => ipcRenderer.invoke('obs-connect', { url, password }),
  obsDisconnect: () => ipcRenderer.invoke('obs-disconnect'),
  obsAction: (action, value) => ipcRenderer.invoke('obs-action', { action, value }),
  onObsState: (cb) => ipcRenderer.on('obs-state', (e, s) => cb(s)),

  // Автовміщення тексту
  setAutoFit: (on) => ipcRenderer.invoke('set-autofit', on),

  // Шари екрана
  setBgVideo: (cfg, kind) => ipcRenderer.invoke('set-bg-video', { cfg, kind }),
  setFitGroup: (slides, kind) => ipcRenderer.invoke('set-fit-group', { slides, kind }),
  setLockedSize: (size, kind) => ipcRenderer.invoke('set-locked-size', { size, kind: kind || null }),
  showLogo: (dataUrl, kind) => ipcRenderer.invoke('show-logo', { dataUrl, kind }),
  showWatermark: (cfg, kind) => ipcRenderer.invoke('show-watermark', { cfg, kind }),
  freezeOutput: (on, kind) => ipcRenderer.invoke('freeze-output', { on, kind }),
  onLogoAutoHidden: (cb) => ipcRenderer.on('logo-auto-hidden', () => cb()),
  sendAlert: (cfg, kind) => ipcRenderer.invoke('send-alert', { cfg, kind }),

  // Керування під час служби
  blackout: (on) => ipcRenderer.invoke('blackout', on),
  setMasterVolume: (v) => ipcRenderer.invoke('set-master-volume', v),
  sendStageTimer: (data) => ipcRenderer.invoke('send-stage-timer', data),
  setStageOutput: (kind) => ipcRenderer.invoke('set-stage-output', kind),

  // Stage Monitor — окреме вікно сцени (не плутати з setStageOutput вище,
  // яка лише накладає таймер поверх одного зі звичайних 4 виходів)
  openStageWindow: () => ipcRenderer.invoke('open-stage-window'),
  closeStageWindow: () => ipcRenderer.invoke('close-stage-window'),
  stageWindowStatus: () => ipcRenderer.invoke('stage-window-status'),
  updateStageWindow: (data) => ipcRenderer.invoke('stage-content-update', data),
  setStageMonitor: (displayId) => ipcRenderer.invoke('set-stage-monitor', displayId),
  bindStageMonitorFingerprint: (fp) => ipcRenderer.invoke('bind-stage-monitor-fingerprint', fp),
  onStageWindowClosed: (cb) => ipcRenderer.on('stage-window-closed', () => cb()),

  // Діагностика і бекап
  logError: (where, message) => ipcRenderer.invoke('log-error', { where, message }),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  readLog: () => ipcRenderer.invoke('read-log'),
  clearLog: () => ipcRenderer.invoke('clear-log'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  writeAutoBackup: (jsonStr) => ipcRenderer.invoke('write-auto-backup', jsonStr),
  openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),

  // Оновлення
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (e, d) => cb(d)),

  // Автозапуск
  setAutoLaunch: (on) => ipcRenderer.invoke('set-auto-launch', on),

  // Монітори
  identifyDisplays: (seconds) => ipcRenderer.invoke('identify-displays', seconds),
  testPattern: (kind, on) => ipcRenderer.invoke('test-pattern', { kind, on }),
  bindOutputFingerprint: (kind, fingerprint) => ipcRenderer.invoke('bind-output-fingerprint', { kind, fingerprint }),
  restoreOutputBindings: (map) => ipcRenderer.invoke('restore-output-bindings', map),

  // Chroma key
  setStreamChroma: (color) => ipcRenderer.invoke('set-stream-chroma', color),
  setOutputChroma: (kind, color) => ipcRenderer.invoke('set-output-chroma', { kind, color }),

  // PC Sync

  // HTML Overlay — записує в temp файл, повертає file:// шлях
  writeHtmlOverlay: (html) => ipcRenderer.invoke('write-html-overlay', html),

  // ATEM
  atemConnect: (ip) => ipcRenderer.invoke('atem-connect', ip),
  atemDisconnect: () => ipcRenderer.invoke('atem-disconnect'),
  atemCommand: (cmd) => ipcRenderer.invoke('atem-command', cmd),
  ptzCommand: (cfg) => ipcRenderer.invoke('ptz-command', cfg),
  ptzDiscover: () => ipcRenderer.invoke('ptz-discover'),
  ptzPing: (cfg) => ipcRenderer.invoke('ptz-ping', cfg),
  ptzSnapshot: (cfg) => ipcRenderer.invoke('ptz-snapshot', cfg),
  onAtemStatus: (cb) => ipcRenderer.on('atem-status', (e, d) => cb(d)),
  onAtemState: (cb) => ipcRenderer.on('atem-state', (e, d) => cb(d)),

  // OSC-тригери
  startOscServer: () => ipcRenderer.invoke('start-osc-server'),
  stopOscServer: () => ipcRenderer.invoke('stop-osc-server'),
  oscLearn: (action) => ipcRenderer.invoke('osc-learn', action),
  oscClear: (action) => ipcRenderer.invoke('osc-clear', action),
  oscGetMap: () => ipcRenderer.invoke('osc-get-map'),
  onOscAction: (cb) => ipcRenderer.on('osc-action', (e, d) => cb(d)),
  onOscLearned: (cb) => ipcRenderer.on('osc-learned', (e, d) => cb(d)),

  // Хмарна синхронізація
  pickCloudSyncFolder: () => ipcRenderer.invoke('pick-cloud-sync-folder'),
  getCloudSyncFolder: () => ipcRenderer.invoke('get-cloud-sync-folder'),
  syncToCloud: (data) => ipcRenderer.invoke('sync-to-cloud', data),
  syncFromCloud: () => ipcRenderer.invoke('sync-from-cloud')
});
