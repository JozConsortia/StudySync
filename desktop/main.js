const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

// The desktop app wraps the StudySync web app.
//  - Dev:      `npm run dev` (--dev) loads the Vite dev server; override with STUDYSYNC_DEV_URL
//  - Local:    ../web/dist (run `npm run build:web` first)
//  - Packaged: <resources>/web, copied in by electron-builder
function webEntry() {
  if (app.isPackaged) return path.join(process.resourcesPath, "web", "index.html");
  return path.join(__dirname, "..", "web", "dist", "index.html");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 420,
    minHeight: 560,
    title: "StudySync",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Open external links in the user's browser instead of inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl =
    process.env.STUDYSYNC_DEV_URL || (process.argv.includes("--dev") ? "http://localhost:5173" : null);
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(webEntry());
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
