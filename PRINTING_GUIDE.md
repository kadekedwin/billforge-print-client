# Printing Guide

Complete guide for printing to Bluetooth thermal printers via WebSocket.

## Connection

```javascript
const ws = new WebSocket('ws://127.0.0.1:42123');
```

## Data Formats

### Text String

```json
{
  "type": "send_data",
  "payload": {
    "deviceId": "ble_abc123",
    "data": "Hello World\n"
  }
}
```

### Byte Array

```json
{
  "type": "send_data",
  "payload": {
    "deviceId": "ble_abc123",
    "data": [27, 64, 72, 101, 108, 108, 111, 10]
  }
}
```

Convert text to bytes:
```javascript
const bytes = Array.from(new TextEncoder().encode("Hello"));
```

## ESC/POS Commands

| Command | Bytes | Description |
|---------|-------|-------------|
| Initialize | `27, 64` | Reset printer |
| Line Feed | `10` | New line |
| Align Left | `27, 97, 0` | Left align |
| Align Center | `27, 97, 1` | Center align |
| Align Right | `27, 97, 2` | Right align |
| Bold On | `27, 69, 1` | Enable bold |
| Bold Off | `27, 69, 0` | Disable bold |
| Underline On | `27, 45, 1` | Enable underline |
| Underline Off | `27, 45, 0` | Disable underline |
| Double Height | `27, 33, 16` | 2x height |
| Double Width | `27, 33, 32` | 2x width |
| Normal Size | `27, 33, 0` | Reset size |
| Cut Paper | `29, 86, 66, 0` | Full cut |
| Partial Cut | `29, 86, 65, 0` | Partial cut |
| Delay | `27, 126, 68, [ms]` | Pause 0-255ms |

## Custom Delay Command

Syntax: `[27, 126, 68, duration]`

Use before paper cuts or between commands for slower printers.

```json
{
  "type": "send_data",
  "payload": {
    "deviceId": "ble_abc123",
    "data": [
      27, 64,
      84, 101, 115, 116,
      10, 10,
      27, 126, 68, 200,
      29, 86, 66, 0
    ]
  }
}
```

Recommended: 100-200ms before cutting.

## Complete Receipt Example

```javascript
const ws = new WebSocket('ws://127.0.0.1:42123');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'discover' }));
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
    const receipt = [
      27, 64,
      27, 97, 1,
      27, 69, 1,
      ...Array.from(new TextEncoder().encode("RECEIPT")),
      27, 69, 0,
      10,
      27, 97, 0,
      ...Array.from(new TextEncoder().encode("Item 1    $10.00")),
      10,
      ...Array.from(new TextEncoder().encode("Item 2    $15.00")),
      10,
      27, 97, 2,
      27, 69, 1,
      ...Array.from(new TextEncoder().encode("Total: $25.00")),
      27, 69, 0,
      10, 10, 10,
      27, 126, 68, 150,
      29, 86, 66, 0
    ];
    
    ws.send(JSON.stringify({
      type: 'send_data',
      payload: {
        deviceId: msg.data.deviceId,
        data: receipt
      }
    }));
  }
};
```

## Printing Images

Thermal printers use bitmap format with `GS v 0` command.

### Requirements
- Max width: 384 pixels (58mm) or 576 pixels (80mm)
- Format: Any (converted to bitmap)
- Colors: Black/white threshold

### Image to Bitmap Conversion

```javascript
function imageToBitmap(imageData, threshold = 128) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  
  const bytesPerLine = Math.ceil(width / 8);
  const bitmap = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < bytesPerLine; x++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const px = x * 8 + bit;
        if (px < width) {
          const i = (y * width + px) * 4;
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          if (gray < threshold) {
            byte |= (1 << (7 - bit));
          }
        }
      }
      bitmap.push(byte);
    }
  }
  
  const wL = width & 0xFF;
  const wH = (width >> 8) & 0xFF;
  const hL = height & 0xFF;
  const hH = (height >> 8) & 0xFF;
  
  return [29, 118, 48, 0, wL, wH, hL, hH, ...bitmap];
}
```

### Print Image Example

```javascript
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');
const img = new Image();

img.onload = () => {
  canvas.width = 384;
  canvas.height = img.height * (384 / img.width);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bitmapData = imageToBitmap(imageData);
  
  ws.send(JSON.stringify({
    type: 'send_data',
    payload: {
      deviceId: 'ble_abc123',
      data: [
        27, 64,
        27, 97, 1,
        ...bitmapData,
        10, 10,
        29, 86, 66, 0
      ]
    }
  }));
};

img.src = 'logo.png';
```

## QR Code Printing

```javascript
function printQRCode(text) {
  const textBytes = Array.from(new TextEncoder().encode(text));
  const len = textBytes.length;
  
  return [
    29, 40, 107, 4, 0, 49, 65, 50, 0,
    29, 40, 107, 3, 0, 49, 67, 8,
    29, 40, 107, 3, 0, 49, 69, 48,
    29, 40, 107, len + 3, 0, 49, 80, 48,
    ...textBytes,
    29, 40, 107, 3, 0, 49, 81, 48
  ];
}

const qrData = [
  27, 64,
  27, 97, 1,
  ...printQRCode("https://example.com"),
  10, 10,
  29, 86, 66, 0
];

ws.send(JSON.stringify({
  type: 'send_data',
  payload: {
    deviceId: 'ble_abc123',
    data: qrData
  }
}));
```

## Barcode Printing

```javascript
function printBarcode(data, type = 73) {
  const dataBytes = Array.from(new TextEncoder().encode(data));
  
  return [
    29, 104, 100,
    29, 119, 2,
    29, 72, 2,
    29, 107, type, dataBytes.length,
    ...dataBytes
  ];
}

const barcodeData = [
  27, 64,
  27, 97, 1,
  ...printBarcode("123456789012"),
  10, 10,
  29, 86, 66, 0
];
```

Barcode types:
- `73` - CODE128
- `69` - EAN13
- `70` - EAN8
- `65` - UPC-A

## WebSocket API Reference

### Discover

```json
{ "type": "discover", "payload": { "ignoreUnknown": true } }
```

### Connect

```json
{ "type": "connect", "payload": { "deviceId": "ble_abc123" } }
```

### Disconnect

```json
{ "type": "disconnect", "payload": { "deviceId": "ble_abc123" } }
```

### Get Connected

```json
{ "type": "get_connected", "payload": {} }
```

### Send Data

```json
{ "type": "send_data", "payload": { "deviceId": "ble_abc123", "data": [...] } }
```

## Troubleshooting

**Printer not responding**
- Check device is powered on
- Verify Bluetooth is enabled
- Ensure device is paired (Classic) or in range (BLE)

**Garbled output**
- Initialize printer first: `[27, 64]`
- Check character encoding
- Verify ESC/POS command syntax

**Paper not cutting**
- Add delay before cut: `[27, 126, 68, 150, 29, 86, 66, 0]`
- Increase delay if needed (up to 255ms)

**Image not printing**
- Verify width ≤ 384px (58mm) or 576px (80mm)
- Check bitmap conversion
- Ensure proper alignment

## Examples

See `examples/` directory for:
- `print-image.html` - Image printing demo
- `image-to-bitmap.js` - Bitmap conversion utility
- `README.md` - Additional examples

## Resources

- [ESC/POS Command Reference](https://reference.epson-biz.com/modules/ref_escpos/index.php)
- [Thermal Printer Basics](https://learn.adafruit.com/mini-thermal-receipt-printer)
