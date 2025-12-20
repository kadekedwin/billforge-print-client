const WebSocket = require('ws');
const BluetoothService = require('../bluetooth/bluetooth-service');

class WebSocketServer {
    constructor(port = 42123) {
        this.port = port;
        this.wss = null;
        this.clients = new Set();
        this.bluetoothService = new BluetoothService((deviceId) => {
            this.broadcastDisconnect(deviceId);
        });
    }

    broadcastDisconnect(deviceId) {
        const message = JSON.stringify({
            type: 'device_disconnected',
            data: { deviceId }
        });

        this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });

        console.log(`Broadcasted disconnect event for device: ${deviceId}`);
    }

    async start(maxRetries = 10) {
        let attempts = 0;

        while (attempts < maxRetries) {
            try {
                await new Promise((resolve, reject) => {
                    const server = new WebSocket.Server({
                        host: '127.0.0.1',
                        port: this.port
                    }, () => {
                        resolve();
                    });

                    server.on('error', (error) => {
                        reject(error);
                    });

                    this.wss = server;
                });

                this.wss.on('connection', (ws) => {
                    console.log('Client connected');
                    this.clients.add(ws);

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
                        this.clients.delete(ws);
                    });

                    ws.send(JSON.stringify({
                        type: 'connected',
                        message: 'WebSocket connected successfully'
                    }));
                });

                console.log(`WebSocket server running on port ${this.port}`);
                return this.port;
            } catch (error) {
                if (error.code === 'EADDRINUSE') {
                    console.log(`Port ${this.port} is in use, trying ${this.port + 1}...`);
                    this.port++;
                    attempts++;
                } else {
                    throw error;
                }
            }
        }

        throw new Error(`Failed to start server after ${maxRetries} attempts`);
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
