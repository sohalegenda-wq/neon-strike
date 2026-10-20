const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 1280, height: 720, backgroundColor: '#07080c', autoHideMenuBar: true });
  w.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
