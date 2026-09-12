// Thin Electron shell around the existing Express server.
// It picks a free port, points the server's data dir at the OS user-data folder,
// starts server/index.js unchanged, then opens a window on http://localhost:<port>.
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(base, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${base}/api/config`); if (r.status < 500) return true; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

let win;

async function start() {
  const port = await freePort();
  process.env.PORT = String(port);
  // config-store.js reads this to keep drafts/config in a writable location.
  process.env.JN_USER_DATA = app.getPath('userData');

  // Must be a file:// URL — a raw Windows path (C:\…) breaks the ESM loader.
  await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.js')).href); // starts Express on PORT
  const base = `http://localhost:${port}`;
  await waitForServer(base);

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'JekyllNote',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  if (win.removeMenu) win.removeMenu();
  // Open any external (non-localhost) links in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(base)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.loadURL(base);
}

app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) start(); });
