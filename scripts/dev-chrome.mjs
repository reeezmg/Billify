import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const port = process.env.PORT ?? '5173';
const url = process.env.DEV_CHROME_URL ?? `http://127.0.0.1:${port}`;

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env['PROGRAMFILES(X86)'] &&
    path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
].filter(Boolean);

const chromeExecutable =
  chromeCandidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? 'chrome';

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port],
  {
    stdio: 'inherit',
  },
);

let browserOpened = false;
const openChrome = () => {
  if (browserOpened) {
    return;
  }
  browserOpened = true;

  const chrome = spawn(chromeExecutable, [url], {
    detached: true,
    stdio: 'ignore',
  });

  chrome.unref();
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        openChrome();
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  openChrome();
};

waitForServer().catch((error) => {
  console.error(error);
  openChrome();
});

const shutdown = () => {
  if (!server.killed) {
    server.kill();
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);
