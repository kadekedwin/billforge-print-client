const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const WebSocketServer = require('./src/websocket/websocket-server');

let wsServer;
let tray = null;

let isServerRunning = true;

function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

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
  const ipAddress = getLocalIPAddress();
  const port = 42123;
  const wsUrl = `ws://${ipAddress}:${port}`;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'BillForge Print Client',
      enabled: false,
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png')).resize({ width: 16, height: 16 })
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
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  console.log('Icon path:', iconPath);
  console.log('Icon loaded:', !icon.isEmpty());

  const resizedIcon = icon.resize({ width: 22, height: 22 });
  resizedIcon.setTemplateImage(true);

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
  console.log(`WebSocket server: ws://${getLocalIPAddress()}:42123`);
});

app.on('window-all-closed', () => {
  // Don't quit on window close since we're a tray app
});

app.on('before-quit', () => {
  if (wsServer) {
    wsServer.stop();
  }
});
