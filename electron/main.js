const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const { getDiskInfo, scan, browse, deleteItems, breakdown, findLargeFiles } = require('../scanner');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0c0e14',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    roundedCorners: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Scan',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.send('menu:scan'),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'selectAll' },
        { type: 'separator' },
        { role: 'copy' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('disk:info', () => getDiskInfo());
ipcMain.handle('disk:scan', () => scan());
ipcMain.handle('disk:browse', (_event, dirPath) => browse(dirPath));
ipcMain.handle('disk:delete', (_event, items) => deleteItems(items));
ipcMain.handle('disk:breakdown', (_event, segment) => breakdown(segment));
ipcMain.handle('disk:findLargeFiles', (_event, minMB) => findLargeFiles(minMB));

ipcMain.handle('shell:showInFinder', (_event, itemPath) => {
  shell.showItemInFolder(itemPath);
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
