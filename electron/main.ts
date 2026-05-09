import { app, BrowserWindow, ipcMain } from 'electron';
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
let updateWindow: BrowserWindow | null = null;
let updateCheckInProgress = false;
let updateWindowLoaded = false;
let allowUpdateWindowCloseWithoutQuit = false;
let updateWindowCanClose = false;
const { autoUpdater } = updaterPkg;

type UpdateWindowState = {
  title: string;
  message: string;
  progress?: number | null;
  detail?: string | null;
  error?: boolean;
  showRetry?: boolean;
  showContinue?: boolean;
};

async function createMainWindow() {
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

function getUpdateWindowHtml() {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Billify Update</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #020617;
          --panel: #0f172a;
          --panel-2: #111827;
          --border: rgba(148, 163, 184, 0.2);
          --text: #f8fafc;
          --muted: #94a3b8;
          --accent: #22c55e;
          --danger: #ef4444;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          font-family: "Segoe UI", Arial, sans-serif;
          background:
            radial-gradient(circle at top, rgba(34,197,94,0.14), transparent 38%),
            linear-gradient(180deg, #0b1220 0%, var(--bg) 100%);
          color: var(--text);
        }
        .shell {
          width: min(92vw, 520px);
          border: 1px solid var(--border);
          background: linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98));
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 28px 80px rgba(0,0,0,0.45);
        }
        .eyebrow {
          color: var(--accent);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        h1 {
          margin: 14px 0 10px;
          font-size: 28px;
          line-height: 1.15;
        }
        p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.6;
        }
        .detail {
          margin-top: 12px;
          min-height: 20px;
          color: #cbd5e1;
          font-size: 13px;
        }
        .progress-wrap {
          margin-top: 22px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(15,23,42,0.72);
          border: 1px solid var(--border);
        }
        .progress-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
          font-size: 13px;
          color: var(--muted);
        }
        .bar {
          width: 100%;
          height: 12px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(148,163,184,0.15);
        }
        .fill {
          height: 100%;
          width: 0%;
          border-radius: inherit;
          background: linear-gradient(90deg, #22c55e, #86efac);
          transition: width 220ms ease;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }
        button {
          border: 0;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .retry { background: #1d4ed8; color: white; }
        .continue { background: #16a34a; color: white; }
        .exit { background: rgba(239,68,68,0.16); color: #fecaca; border: 1px solid rgba(239,68,68,0.24); }
        .hidden { display: none; }
      </style>
    </head>
    <body>
      <div class="shell">
        <div class="eyebrow">Billify Update</div>
        <h1 id="title">Checking for updates</h1>
        <p id="message">Please wait while Billify verifies the latest version.</p>
        <div class="detail" id="detail"></div>
        <div class="progress-wrap">
          <div class="progress-head">
            <span id="progressLabel">Status</span>
            <span id="progressValue">0%</span>
          </div>
          <div class="bar"><div class="fill" id="fill"></div></div>
        </div>
        <div class="actions">
          <button class="retry hidden" id="retry">Retry</button>
          <button class="continue hidden" id="continue">Open Current Version</button>
          <button class="exit hidden" id="exit">Close App</button>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        const title = document.getElementById('title');
        const message = document.getElementById('message');
        const detail = document.getElementById('detail');
        const progressValue = document.getElementById('progressValue');
        const fill = document.getElementById('fill');
        const retry = document.getElementById('retry');
        const continueBtn = document.getElementById('continue');
        const exit = document.getElementById('exit');

        retry.addEventListener('click', () => ipcRenderer.send('update:retry'));
        continueBtn.addEventListener('click', () => ipcRenderer.send('update:continue'));
        exit.addEventListener('click', () => ipcRenderer.send('update:exit'));

        ipcRenderer.on('update-state', (_event, state) => {
          title.textContent = state.title;
          message.textContent = state.message;
          detail.textContent = state.detail || '';
          const progress = typeof state.progress === 'number' ? Math.max(0, Math.min(100, Math.round(state.progress))) : 0;
          progressValue.textContent = state.progress == null ? '' : progress + '%';
          fill.style.width = state.progress == null ? '0%' : progress + '%';
          retry.classList.toggle('hidden', !state.showRetry);
          continueBtn.classList.toggle('hidden', !state.showContinue);
          exit.classList.toggle('hidden', !state.showRetry);
        });
      </script>
    </body>
  </html>`;
}

async function ensureUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    return updateWindow;
  }

  updateWindowLoaded = false;
  updateWindow = new BrowserWindow({
    width: 560,
    height: 420,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: '#020617',
    title: 'Billify Update',
    closable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  updateWindow.on('close', (event) => {
    if (!updateWindowCanClose && !allowUpdateWindowCloseWithoutQuit) {
      event.preventDefault();
    }
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
    updateWindowLoaded = false;
    if (!mainWindow && !allowUpdateWindowCloseWithoutQuit) {
      app.quit();
    }
  });

  updateWindow.webContents.once('did-finish-load', () => {
    updateWindowLoaded = true;
  });

  await updateWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(getUpdateWindowHtml())}`);
  return updateWindow;
}

function sendUpdateState(state: UpdateWindowState) {
  if (!updateWindow || updateWindow.isDestroyed()) {
    return;
  }

  updateWindowCanClose = Boolean(state.showRetry || state.showContinue);
  updateWindow.setClosable(updateWindowCanClose);

  const dispatch = () => {
    updateWindow?.webContents.send('update-state', state);
  };

  if (updateWindowLoaded) {
    dispatch();
  } else {
    updateWindow.webContents.once('did-finish-load', dispatch);
  }
}

async function openMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = await createMainWindow();
}

async function startBlockingUpdateFlow() {
  if (updateCheckInProgress) {
    return;
  }
  updateCheckInProgress = true;

  try {
    await ensureUpdateWindow();
    sendUpdateState({
      title: 'Checking for updates',
      message: 'Please wait while Billify verifies the latest version.',
      progress: null,
      detail: 'Checking GitHub releases for the latest Billify build.',
      showRetry: false,
    });

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = true;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let updateStarted = false;
      let downloadFinished = false;
      const checkTimeoutMs = 15000;
      let checkTimeout: NodeJS.Timeout | null = null;

      const finishResolve = () => {
        if (settled) return;
        settled = true;
        if (checkTimeout) {
          clearTimeout(checkTimeout);
          checkTimeout = null;
        }
        cleanup();
        resolve();
      };

      const finishReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        if (checkTimeout) {
          clearTimeout(checkTimeout);
          checkTimeout = null;
        }
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        autoUpdater.removeListener('update-available', onAvailable);
        autoUpdater.removeListener('update-not-available', onNotAvailable);
        autoUpdater.removeListener('download-progress', onProgress);
        autoUpdater.removeListener('update-downloaded', onDownloaded);
        autoUpdater.removeListener('error', onError);
      };

      const onAvailable = async (info: { version: string }) => {
        updateStarted = true;
        sendUpdateState({
          title: 'New update found',
          message: `Version ${info.version} is required before Billify can open. Downloading now.`,
          progress: 0,
          detail: 'Starting secure download.',
          showRetry: false,
        });
        try {
          await autoUpdater.downloadUpdate();
        } catch (error) {
          finishReject(error);
        }
      };

      const onNotAvailable = () => {
        finishResolve();
      };

      const formatBytes = (value: number) => {
        if (!Number.isFinite(value) || value <= 0) return '0 MB';
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      };

      const onProgress = (progress: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => {
        sendUpdateState({
          title: 'Downloading update',
          message: 'Billify is downloading the required update. The app will open after it finishes.',
          progress: progress.percent,
          detail: `${Math.round(progress.percent)}% • ${formatBytes(progress.transferred)} / ${formatBytes(progress.total)} • ${formatBytes(progress.bytesPerSecond)}/s`,
          showRetry: false,
        });
      };

      const onDownloaded = (info: { version: string }) => {
        downloadFinished = true;
        sendUpdateState({
          title: 'Installing update',
          message: `Version ${info.version} is ready. Billify will restart and install it now.`,
          progress: 100,
          detail: 'Closing Billify and starting the installer automatically.',
          showRetry: false,
        });
        setTimeout(() => {
          autoUpdater.quitAndInstall(false, true);
        }, 1200);
      };

      const onError = (error: Error) => {
        finishReject(error);
      };

      autoUpdater.once('update-available', onAvailable);
      autoUpdater.once('update-not-available', onNotAvailable);
      autoUpdater.on('download-progress', onProgress);
      autoUpdater.once('update-downloaded', onDownloaded);
      autoUpdater.once('error', onError);

      checkTimeout = setTimeout(() => {
        if (settled || updateStarted || downloadFinished) {
          return;
        }
        sendUpdateState({
          title: 'Opening current version',
          message: 'Update check is taking too long. Billify will open the current version now.',
          progress: null,
          detail: 'No update was confirmed within the timeout window.',
          showRetry: false,
        });
        finishResolve();
      }, checkTimeoutMs);

      void autoUpdater
        .checkForUpdates()
        .then((result) => {
          // Some updater/provider combinations resolve without firing update-not-available.
          if (settled || updateStarted || downloadFinished) {
            return;
          }

          const version = result?.updateInfo?.version;
          if (!version || version === app.getVersion()) {
            finishResolve();
            return;
          }

          // If a different version is reported but no update-available event fired,
          // move into the download phase explicitly instead of hanging on "Checking".
          void onAvailable({ version });
        })
        .catch((error) => {
          finishReject(error);
        });
    });

    allowUpdateWindowCloseWithoutQuit = true;
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.close();
    }
    await openMainWindow();
    allowUpdateWindowCloseWithoutQuit = false;
  } catch (error: any) {
    console.error('Auto update error:', error);
    sendUpdateState({
      title: 'Update required',
      message: error?.message
        ? `Billify could not complete the required update.\n${error.message}`
        : 'Billify could not complete the required update. Please retry or close the app.',
      progress: null,
      detail: 'You can retry the update check, or open the current version while the release metadata is fixed.',
      showRetry: true,
      showContinue: true,
      error: true,
    });
  } finally {
    updateCheckInProgress = false;
  }
}

ipcMain.on('update:retry', () => {
  void startBlockingUpdateFlow();
});

ipcMain.on('update:continue', async () => {
  allowUpdateWindowCloseWithoutQuit = true;
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
  await openMainWindow();
  allowUpdateWindowCloseWithoutQuit = false;
});

ipcMain.on('update:exit', () => {
  app.quit();
});

app.whenReady().then(async () => {
  registerAuthIpc();
  registerTenantsIpc();
  registerBillsIpc();
  registerSplitsIpc();
  registerUsersIpc();
  registerSettingsIpc();
  if (app.isPackaged && process.platform === 'win32') {
    await startBlockingUpdateFlow();
    return;
  }
  await openMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await openMainWindow();
  }
});
