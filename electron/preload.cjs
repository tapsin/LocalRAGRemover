const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('localRag', {
  records: () => ipcRenderer.invoke('app:records'),
  scan: () => ipcRenderer.invoke('app:scan'),
  remove: (ids) => ipcRenderer.invoke('app:delete', ids),
  settings: () => ipcRenderer.invoke('app:settings'),
  saveSettings: (settings) => ipcRenderer.invoke('app:save-settings', settings),
  chooseFile: () => ipcRenderer.invoke('file:choose'),
  readPage: (startLine, limit) => ipcRenderer.invoke('file:read-page', { startLine, limit }),
  readOpenFile: () => ipcRenderer.invoke('file:read-open'),
  chooseFolder: () => ipcRenderer.invoke('file:choose-folder'),
  inspectPath: (filePath) => ipcRenderer.invoke('file:inspect-path', filePath),
  updateGguf: (key, value) => ipcRenderer.invoke('file:update-gguf', { key, value }),
  testApi: () => ipcRenderer.invoke('api:test'),
  deleteSqliteRow: (table, rowid) => ipcRenderer.invoke('sqlite:delete-row', { table, rowid }),
  deleteFileLines: (lineNumbers) => ipcRenderer.invoke('file:delete-lines', lineNumbers)
  ,exportClean: (lineNumbers) => ipcRenderer.invoke('file:export-clean', lineNumbers)
});
