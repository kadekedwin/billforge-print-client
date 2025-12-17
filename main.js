const { app, BrowserWindow } = require('electron');
const path = require('path');
const WebSocketServer = require('./src/websocket/websocket-server');

let wsServer;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableBluetoothAPI: true
    }
  });

  mainWindow.loadFile('public/index.html');

  mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    if (deviceList && deviceList.length > 0) {
      deviceList.forEach(device => {
        wsServer.bluetoothService.addDiscoveredDevice({
          id: device.deviceId,
          name: device.deviceName,
          address: device.deviceId
        });
      });
    }
  });
}

app.whenReady().then(() => {
  wsServer = new WebSocketServer(42123);
  wsServer.start();

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (wsServer) {
    wsServer.stop();
  }
  if (process.platform !== 'darwin') app.quit();
});
