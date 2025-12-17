# BillForge Print Client

WebSocket-based Bluetooth API service for printer management.

## Features

- **Dual Bluetooth Support**: BLE (Bluetooth Low Energy) and Bluetooth Classic
- Bluetooth device discovery (both BLE and Classic devices)
- Device connection/disconnection management
- Real-time device status tracking
- WebSocket API for remote control
- Platform-specific implementations (macOS, Linux, Windows)

## Installation

```bash
npm install
```

## Running

```bash
npm start
```

The WebSocket server runs on port `42123` by default.

## WebSocket API

### Connection

Connect to: `ws://localhost:42123`

### Message Format

All messages follow this format:

```json
{
  "type": "message_type",
  "payload": {}
}
```

### API Methods

#### Discover Devices

Triggers Bluetooth device discovery dialog.

**Request:**
```json
{
  "type": "discover",
  "payload": {
    "ignoreUnknown": false
  }
}
```

**Payload Options:**
- `ignoreUnknown` (optional, boolean): If `true`, filters out devices named "Unknown Device" from results. Default: `false`

**Response:**
```json
{
  "type": "discover_response",
  "data": {
    "success": true,
    "devices": [
      {
        "id": "device_id",
        "name": "Device Name",
        "address": "device_address",
        "type": "classic",
        "paired": true,
        "connected": false
      }
    ]
  }
}
```

#### Connect Device

**Request:**
```json
{
  "type": "connect",
  "payload": {
    "deviceId": "device_id"
  }
}
```

**Response:**
```json
{
  "type": "connect_response",
  "data": {
    "success": true,
    "deviceId": "device_id",
    "name": "Device Name"
  }
}
```

#### Disconnect Device

**Request:**
```json
{
  "type": "disconnect",
  "payload": {
    "deviceId": "device_id"
  }
}
```

**Response:**
```json
{
  "type": "disconnect_response",
  "data": {
    "success": true,
    "deviceId": "device_id"
  }
}
```

#### Get Connected Devices

**Request:**
```json
{
  "type": "get_connected",
  "payload": {}
}
```

**Response:**
```json
{
  "type": "connected_devices_response",
  "data": {
    "success": true,
    "devices": [
      {
        "id": "device_id",
        "name": "Device Name",
        "address": "device_address"
      }
    ]
  }
}
```

#### Send Data

**Request:**
```json
{
  "type": "send_data",
  "payload": {
    "deviceId": "device_id",
    "data": "data_to_send"
  }
}
```

**Response:**
```json
{
  "type": "send_data_response",
  "data": {
    "success": true,
    "deviceId": "device_id",
    "bytesSent": 123
  }
}
```

#### Clear Devices

**Request:**
```json
{
  "type": "clear_devices",
  "payload": {}
}
```

**Response:**
```json
{
  "type": "devices_cleared",
  "data": {
    "success": true
  }
}
```

## Client Usage

### JavaScript Example

```javascript
const api = new BluetoothAPI('ws://localhost:42123');

await api.connect();

// Discover all devices (including unknown)
await api.discoverDevices();

// Discover only named devices (ignore "Unknown Device")
await api.discoverDevices({ ignoreUnknown: true });

const devices = await api.getConnectedDevices();

await api.connectDevice('device_id');

await api.sendData('device_id', 'Hello Printer');

await api.disconnectDevice('device_id');

api.disconnect();
```

## Project Structure

```
billforge-print-client/
├── src/
│   ├── bluetooth/
│   │   ├── bluetooth-classic.js    # Bluetooth Classic implementation
│   │   ├── bluetooth-scanner.js    # BLE scanner using Noble
│   │   └── bluetooth-service.js    # Unified Bluetooth service
│   └── websocket/
│       └── websocket-server.js     # WebSocket server
├── public/
│   ├── bluetooth-api.js            # Client-side API wrapper
│   ├── renderer.js                 # UI logic
│   ├── index.html                  # User interface
│   └── styles.css                  # Application styling
├── main.js                         # Electron main process
├── package.json
└── README.md
```

## Architecture

- **main.js**: Electron main process with WebSocket server integration
- **src/websocket/websocket-server.js**: WebSocket server handling API requests
- **src/bluetooth/bluetooth-service.js**: Unified Bluetooth device management service (BLE + Classic)
- **src/bluetooth/bluetooth-classic.js**: Platform-specific Bluetooth Classic implementation
- **src/bluetooth/bluetooth-scanner.js**: BLE scanner for discovering nearby devices
- **public/bluetooth-api.js**: Client-side API wrapper
- **public/renderer.js**: UI logic for device management
- **public/index.html**: User interface
- **public/styles.css**: Application styling

## Bluetooth Types

### BLE (Bluetooth Low Energy)
- Uses Web Bluetooth API
- Triggered via browser's device picker dialog
- Lower power consumption
- Suitable for sensors and IoT devices

### Bluetooth Classic
- Uses platform-specific system commands
- Discovers paired devices automatically
- Higher throughput
- **Suitable for printers** (SPP - Serial Port Profile)
- Platform implementations:
  - **macOS**: `system_profiler` for discovery
  - **Linux**: `bluetoothctl` for discovery and connection
  - **Windows**: PowerShell commands for device enumeration

## Port Configuration

Default port: `42123`

To change the port, modify the WebSocketServer initialization in `main.js`:

```javascript
wsServer = new WebSocketServer(YOUR_PORT);
```
