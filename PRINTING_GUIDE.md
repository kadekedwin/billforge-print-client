# BillForge Print Client - Printing Guide

Send raw data to Bluetooth printers via WebSocket.

## Connection

**WebSocket URL:** `ws://127.0.0.1:42123` (or your network IP)

## Basic Usage

### 1. Text Data
```json
{
  "type": "send_data",
  "payload": {
    "deviceId": "YOUR_DEVICE_ID",
    "data": "Hello World!\n"
  }
}
```

### 2. Byte Array (ESC/POS)
```json
{
  "type": "send_data",
  "payload": {
    "deviceId": "YOUR_DEVICE_ID",
    "data": [27, 64, 72, 101, 108, 108, 111, 10]
  }
}
```

**Convert text to bytes in JavaScript:**
```javascript
const bytes = Array.from(new TextEncoder().encode("Hello"));
// [72, 101, 108, 108, 111]
```

## ESC/POS Commands

| Command | Bytes | Description |
| :--- | :--- | :--- |
| **Initialize** | `27, 64` | Reset printer |
| **Line Feed** | `10` | New line |
| **Align Left** | `27, 97, 0` | Left align |
| **Align Center** | `27, 97, 1` | Center align |
| **Align Right** | `27, 97, 2` | Right align |
| **Bold On** | `27, 69, 1` | Enable bold |
| **Bold Off** | `27, 69, 0` | Disable bold |
| **Cut Paper** | `29, 86, 66, 0` | Cut |
| **Delay** | `27, 126, 68, [ms]` | Pause 0-255ms |

## Delays

Add pauses between commands for slower printers or before cuts.

**Syntax:** `[27, 126, 68, duration]`
- `27` = ESC
- `126` = ~
- `68` = D
- `duration` = milliseconds (0-255)

**Example:**
```json
{
  "type": "send_data",
  "payload": {
    "deviceId": "YOUR_DEVICE_ID",
    "data": [
      27, 64,           // Initialize
      84, 101, 115, 116, // "Test"
      10, 10,           // 2 line feeds
      27, 126, 68, 200, // Wait 200ms
      29, 86, 66, 0     // Cut
    ]
  }
}
```

> [!TIP]
> Use 100-200ms delays before cutting paper.

## Complete Example

```javascript
const ws = new WebSocket('ws://127.0.0.1:42123');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'discover' }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'discover_response') {
    const printer = msg.data.devices[0];
    if (printer) {
      ws.send(JSON.stringify({
        type: 'connect',
        payload: { deviceId: printer.id }
      }));
    }
  }
  
  if (msg.type === 'connect_response' && msg.data.success) {
    ws.send(JSON.stringify({
      type: 'send_data',
      payload: {
        deviceId: msg.data.deviceId,
        data: [
          27, 64,              // Initialize
          27, 97, 1,           // Center
          27, 69, 1,           // Bold on
          82, 101, 99, 101, 105, 112, 116, // "Receipt"
          27, 69, 0,           // Bold off
          10, 10,              // 2 line feeds
          27, 126, 68, 100,    // Wait 100ms
          29, 86, 66, 0        // Cut
        ]
      }
    }));
  }
};
```

## WebSocket API

### Discover Devices
```json
{ "type": "discover", "payload": { "ignoreUnknown": true } }
```

### Connect
```json
{ "type": "connect", "payload": { "deviceId": "device_id" } }
```

### Disconnect
```json
{ "type": "disconnect", "payload": { "deviceId": "device_id" } }
```

### Get Connected Devices
```json
{ "type": "get_connected" }
```

### Send Data
```json
{ "type": "send_data", "payload": { "deviceId": "device_id", "data": [...] } }
```
