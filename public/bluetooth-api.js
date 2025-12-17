class BluetoothAPI {
    constructor(wsUrl = 'ws://localhost:42123') {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.messageHandlers = new Map();
        this.messageId = 0;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => {
                console.log('Connected to WebSocket server');
                resolve();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('Disconnected from WebSocket server');
            };
        });
    }

    handleMessage(message) {
        const { type, data } = message;
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }

    on(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }

    off(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    sendMessage(type, payload = {}) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }

            const messageId = this.messageId++;
            const message = { type, payload, messageId };

            const responseType = type + '_response';
            const handler = (data) => {
                this.off(responseType, handler);
                if (data.success === false) {
                    reject(new Error(data.error || 'Operation failed'));
                } else {
                    resolve(data);
                }
            };

            this.on(responseType, handler);
            this.ws.send(JSON.stringify(message));

            setTimeout(() => {
                this.off(responseType, handler);
                reject(new Error('Request timeout'));
            }, 10000);
        });
    }

    async discoverDevices(filters = {}) {
        return this.sendMessage('discover', filters);
    }

    async discoverBLE() {
        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['battery_service', 'device_information']
            });

            await this.sendMessage('add_device', {
                device: {
                    id: device.id,
                    name: device.name,
                    address: device.id
                }
            });

            return this.sendMessage('discover', {});
        } catch (error) {
            console.error('BLE Discovery error:', error);
            throw error;
        }
    }

    async connectDevice(deviceId) {
        return this.sendMessage('connect', { deviceId });
    }

    async disconnectDevice(deviceId) {
        return this.sendMessage('disconnect', { deviceId });
    }

    async getConnectedDevices() {
        return this.sendMessage('get_connected');
    }

    async sendData(deviceId, data) {
        return this.sendMessage('send_data', { deviceId, data });
    }

    async clearDevices() {
        return this.sendMessage('clear_devices');
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BluetoothAPI;
}
