# BillForge Print Client

Electron-based WebSocket server for Bluetooth printer management with automatic disconnect detection.

## Quick Start

```bash
npm install
npm start
```

WebSocket server runs on `ws://YOUR_IP:42123`

## Architecture

### Core Services

**WebSocket Server** (`src/websocket/websocket-server.js`)
- Handles client connections and API requests
- Broadcasts device disconnect events to all clients
- Manages message routing between clients and Bluetooth services

**Bluetooth Service** (`src/bluetooth/bluetooth-service.js`)
- Unified interface for BLE and Classic Bluetooth
- Manages device discovery, connection, and data transmission
- Propagates disconnect events from underlying services

**BLE Scanner** (`src/bluetooth/bluetooth-scanner.js`)
- Discovers and connects to BLE devices using Noble
- Health monitoring via RSSI checks every 3 seconds
- Bluetooth adapter state monitoring
- Auto-disconnect on Bluetooth off

**Bluetooth Classic** (`src/bluetooth/bluetooth-classic.js`)
- Platform-specific Classic Bluetooth implementation
- Health monitoring every 5 seconds
- Supports macOS, Linux, and Windows
- Ideal for thermal printers (SPP profile)

### Disconnect Detection

All services automatically detect and notify clients when:
- Device is turned off or out of range
- Bluetooth adapter is disabled
- Connection is lost for any reason
- Manual disconnect is triggered

## WebSocket API

### Message Format

```json
{
  "type": "message_type",
  "payload": {}
}
```

### Discover Devices

```json
{
  "type": "discover",
  "payload": {
    "ignoreUnknown": true
  }
}
```

Response:
```json
{
  "type": "discover_response",
  "data": {
    "success": true,
    "devices": [
      {
        "id": "ble_abc123",
        "name": "Printer Name",
        "address": "00:11:22:33:44:55",
        "type": "ble",
        "connected": false
      }
    ]
  }
}
```

### Connect Device

```json
{
  "type": "connect",
  "payload": {
    "deviceId": "ble_abc123"
  }
}
```

### Disconnect Device

```json
{
  "type": "disconnect",
  "payload": {
    "deviceId": "ble_abc123"
  }
}
```

### Get Connected Devices

```json
{
  "type": "get_connected",
  "payload": {}
}
```

### Send Data

```json
{
  "type": "send_data",
  "payload": {
    "deviceId": "ble_abc123",
    "data": [27, 64, 72, 101, 108, 108, 111, 10]
  }
}
```

### Device Disconnected Event

Automatically sent to all clients when a device disconnects:

```json
{
  "type": "device_disconnected",
  "data": {
    "deviceId": "ble_abc123"
  }
}
```

## Client Integration

### JavaScript Example

```javascript
const ws = new WebSocket('ws://192.168.1.100:42123');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'discover',
    payload: { ignoreUnknown: true }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'discover_response') {
    const printer = msg.data.devices[0];
    ws.send(JSON.stringify({
      type: 'connect',
      payload: { deviceId: printer.id }
    }));
  }
  
  if (msg.type === 'connect_response' && msg.data.success) {
    ws.send(JSON.stringify({
      type: 'send_data',
      payload: {
        deviceId: msg.data.deviceId,
        data: [27, 64, 72, 101, 108, 108, 111, 10]
      }
    }));
  }
  
  if (msg.type === 'device_disconnected') {
    console.log('Device disconnected:', msg.data.deviceId);
  }
};
```

### Using the API Wrapper

```javascript
const api = new BluetoothAPI('ws://192.168.1.100:42123');

await api.connect();

const discovery = await api.discoverDevices({ ignoreUnknown: true });
const printer = discovery.devices[0];

await api.connectDevice(printer.id);
await api.sendData(printer.id, [27, 64, 72, 101, 108, 108, 111, 10]);
await api.disconnectDevice(printer.id);

api.disconnect();
```

## Bluetooth Types

### BLE (Bluetooth Low Energy)
- Lower power consumption
- Device ID format: `ble_[peripheral_id]`
- Health monitoring via RSSI
- Suitable for modern thermal printers

### Bluetooth Classic
- Higher throughput
- Device ID format: `classic_[address]`
- Platform-specific health checks
- Best for traditional thermal printers
- Uses SPP (Serial Port Profile)

## Platform Support

| Platform | BLE | Classic | Health Check Method |
|----------|-----|---------|---------------------|
| macOS | ✅ | ✅ | `system_profiler` |
| Linux | ✅ | ✅ | `bluetoothctl` |
| Windows | ✅ | ✅ | PowerShell |

## Project Structure

```
billforge-print-client/
├── src/
│   ├── bluetooth/
│   │   ├── bluetooth-classic.js
│   │   ├── bluetooth-scanner.js
│   │   └── bluetooth-service.js
│   └── websocket/
│       └── websocket-server.js
├── public/
│   ├── bluetooth-api.js
│   ├── renderer.js
│   ├── index.html
│   └── styles.css
├── examples/
│   ├── image-to-bitmap.js
│   ├── print-image.html
│   └── README.md
├── main.js
├── PRINTING_GUIDE.md
└── README.md
```

## Configuration

### Change Port

Edit `main.js`:

```javascript
wsServer = new WebSocketServer(YOUR_PORT);
```

### Health Check Intervals

**BLE**: 3 seconds (in `bluetooth-scanner.js`)
**Classic**: 5 seconds (in `bluetooth-classic.js`)

## Printing Guide

See [PRINTING_GUIDE.md](PRINTING_GUIDE.md) for:
- ESC/POS commands
- Thermal printing examples
- Image printing
- Delay commands
- Complete code examples

## Development

```bash
npm run dev
```

Runs with Electron inspector on port 9229.

## License

MIT
