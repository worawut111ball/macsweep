const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diskCleaner', {
  getDiskInfo: () => ipcRenderer.invoke('disk:info'),
  scan: () => ipcRenderer.invoke('disk:scan'),
  browse: (dirPath) => ipcRenderer.invoke('disk:browse', dirPath),
  deleteItems: (items) => ipcRenderer.invoke('disk:delete', items),
  breakdown: (segment) => ipcRenderer.invoke('disk:breakdown', segment),
  showInFinder: (itemPath) => ipcRenderer.invoke('shell:showInFinder', itemPath),
  onMenuScan: (callback) => ipcRenderer.on('menu:scan', callback),
});
