// Exposes a minimal, safe bridge to the renderer (contextIsolation on).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jnDesktop', {
  // Opens the OS folder picker; resolves to the chosen absolute path, or null.
  pickFolder: () => ipcRenderer.invoke('jn-pick-folder'),
});
