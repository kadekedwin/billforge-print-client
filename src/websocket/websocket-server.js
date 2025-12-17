const WebSocket = require('ws');
const BluetoothService = require('../bluetooth/bluetooth-service');

class WebSocketServer {
    constructor(port = 42123) {
        this.port = port;
        this.wss = null;
        this.bluetoothService = new BluetoothService();
    }

    start() {
        this.wss = new WebSocket.Server({ port: this.port });

        this.wss.on('connection', (ws) => {
            console.log('Client connected');

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    const response = await this.handleMessage(data);
                    ws.send(JSON.stringify(response));
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: error.message
                    }));
                }
            });

            ws.on('close', () => {
                console.log('Client disconnected');
            });

            ws.send(JSON.stringify({
                type: 'connected',
                message: 'WebSocket connected successfully'
            }));
        });

        console.log(`WebSocket server running on port ${this.port}`);
    }

    async handleMessage(data) {
        const { type, payload } = data;

        switch (type) {
            case 'discover':
                return {
                    type: 'discover_response',
                    data: await this.bluetoothService.discoverDevices(payload)
                };

            case 'connect':
                return {
                    type: 'connect_response',
                    data: await this.bluetoothService.connectDevice(payload.deviceId)
                };

            case 'disconnect':
                return {
                    type: 'disconnect_response',
                    data: await this.bluetoothService.disconnectDevice(payload.deviceId)
                };

            case 'get_connected':
                return {
                    type: 'connected_devices_response',
                    data: await this.bluetoothService.getConnectedDevices()
                };

            case 'send_data':
                return {
                    type: 'send_data_response',
                    data: await this.bluetoothService.sendData(payload.deviceId, payload.data)
                };

            case 'add_device':
                const deviceId = this.bluetoothService.addDiscoveredDevice(payload.device);
                return {
                    type: 'device_added',
                    data: { success: true, deviceId }
                };

            case 'clear_devices':
                this.bluetoothService.clearDiscoveredDevices();
                return {
                    type: 'devices_cleared',
                    data: { success: true }
                };

            default:
                return {
                    type: 'error',
                    error: `Unknown message type: ${type}`
                };
        }
    }

    stop() {
        if (this.wss) {
            this.wss.close();
            console.log('WebSocket server stopped');
        }
    }
}

module.exports = WebSocketServer;
