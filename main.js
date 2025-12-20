const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const WebSocketServer = require('./src/websocket/websocket-server');

let wsServer;
let tray = null;

let isServerRunning = true;



function toggleServer() {
  if (isServerRunning) {
    if (wsServer) {
      wsServer.stop();
      isServerRunning = false;
    }
  } else {
    if (wsServer) {
      wsServer.start();
      isServerRunning = true;
    }
  }
  if (tray) {
    tray.setContextMenu(createTrayMenu());
  }
}

function createTrayMenu() {
  const port = 42123;
  const wsUrl = `ws://127.0.0.1:${port}`;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'BillForge Print Client',
      enabled: false,
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.png' : 'tray-icon.png')).resize({ width: 16, height: 16 })
    },
    { type: 'separator' },
    {
      label: `Status: ${isServerRunning ? 'Running' : 'Stopped'}`,
      enabled: false
    },
    {
      label: isServerRunning ? 'Turn Off Server' : 'Turn On Server',
      click: () => {
        toggleServer();
      }
    },
    { type: 'separator' },
    {
      label: `WebSocket: ${wsUrl}`,
      enabled: false
    },
    {
      label: `Port: ${port}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Copy WebSocket URL',
      enabled: isServerRunning,
      click: () => {
        const { clipboard } = require('electron');
        clipboard.writeText(wsUrl);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  return contextMenu;
}

function createTray() {
  const iconFileName = process.platform === 'win32' ? 'icon.png' : 'tray-icon.png';
  const iconSize = process.platform === 'win32' ? 32 : 24;
  const iconPath = path.join(__dirname, 'assets', iconFileName);
  const icon = nativeImage.createFromPath(iconPath);

  const resizedIcon = icon.resize({ width: iconSize, height: iconSize });

  tray = new Tray(resizedIcon);
  tray.setToolTip('BillForge Print Client');
  tray.setContextMenu(createTrayMenu());

  setInterval(() => {
    if (tray) {
      tray.setContextMenu(createTrayMenu());
    }
  }, 5000);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  wsServer = new WebSocketServer(42123);
  wsServer.start();
  isServerRunning = true;

  createTray();

  console.log('BillForge Print Client running in system tray');
  console.log('WebSocket server: ws://127.0.0.1:42123');
});

app.on('window-all-closed', () => {
  // Don't quit on window close since we're a tray app
});

app.on('before-quit', () => {
  if (wsServer) {
    wsServer.stop();
  }
});
