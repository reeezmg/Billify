import { app, BrowserWindow, Notification } from 'electron';
import updaterPkg from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAuthIpc } from './ipc/auth.ipc';
import { registerTenantsIpc } from './ipc/tenants.ipc';
import { registerBillsIpc } from './ipc/bills.ipc';
import { registerSplitsIpc } from './ipc/splits.ipc';
import { registerUsersIpc } from './ipc/users.ipc';
import { registerSettingsIpc } from './ipc/settings.ipc';

let mainWindow: BrowserWindow | null = null;
const { autoUpdater } = updaterPkg;

async function createWindow() {
  const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
  const win = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#020617',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  return win;
}

function setupAutoUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    console.log(`Update available: ${info.version}`);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('No update available.');
  });
  autoUpdater.on('download-progress', (progress) => {
    console.log(`Update download progress: ${Math.round(progress.percent)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`Update downloaded: ${info.version}. It will install when the app quits.`);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Billify update ready',
        body: 'A new version is ready and will install when you close the app.',
      }).show();
    }
  });
  autoUpdater.on('error', (error) => {
    console.error('Auto update error:', error);
  });

  void autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(async () => {
  registerAuthIpc();
  registerTenantsIpc();
  registerBillsIpc();
  registerSplitsIpc();
  registerUsersIpc();
  registerSettingsIpc();
  mainWindow = await createWindow();
  setupAutoUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = await createWindow();
  }
});
