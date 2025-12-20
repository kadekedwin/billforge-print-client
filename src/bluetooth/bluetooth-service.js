const BluetoothClassic = require('./bluetooth-classic');
const BluetoothScanner = require('./bluetooth-scanner');

class BluetoothService {
    constructor(onDisconnect = null) {
        this.bleDevices = new Map();
        this.classicDevices = new Map();
        this.connectedDevices = new Map();
        this.onDisconnect = onDisconnect;
        this.bluetoothClassic = new BluetoothClassic((deviceId) => {
            this.handleDisconnect(deviceId);
        });
        this.bluetoothScanner = new BluetoothScanner((deviceId) => {
            this.handleDisconnect(deviceId);
        });
    }

    handleDisconnect(deviceId) {
        this.connectedDevices.delete(deviceId);
        if (this.onDisconnect) {
            this.onDisconnect(deviceId);
        }
    }

    async discoverDevices(filters = {}) {
        try {
            const devices = [];

            const classicDevices = await this.bluetoothClassic.discoverDevices();

            classicDevices.forEach(device => {
                const id = `classic_${device.address}`;
                this.classicDevices.set(id, {
                    id,
                    name: device.name,
                    address: device.address,
                    type: 'classic',
                    paired: device.paired,
                    connected: device.connected
                });
            });

            try {
                const bleDevices = await this.bluetoothScanner.startScan(5000);

                bleDevices.forEach(device => {
                    const id = `ble_${device.id}`;
                    this.bleDevices.set(id, {
                        id,
                        name: device.name,
                        address: device.address,
                        type: 'ble',
                        rssi: device.rssi
                    });
                });
            } catch (error) { }

            const ignoreUnknown = filters.ignoreUnknown || false;

            this.bleDevices.forEach((device, id) => {
                if (ignoreUnknown && device.name === 'Unknown Device') {
                    return;
                }

                devices.push({
                    id,
                    name: device.name,
                    address: device.address,
                    type: 'ble',
                    rssi: device.rssi,
                    connected: this.connectedDevices.has(id)
                });
            });

            this.classicDevices.forEach((device, id) => {
                if (ignoreUnknown && device.name === 'Unknown Device') {
                    return;
                }

                devices.push({
                    id,
                    name: device.name,
                    address: device.address,
                    type: 'classic',
                    paired: device.paired,
                    connected: device.connected || this.connectedDevices.has(id)
                });
            });

            return { success: true, devices };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async connectDevice(deviceId) {
        try {
            if (this.connectedDevices.has(deviceId)) {
                return { success: false, error: 'Device already connected' };
            }

            let device = this.bleDevices.get(deviceId);
            let type = 'ble';

            if (!device) {
                device = this.classicDevices.get(deviceId);
                type = 'classic';
            }

            if (!device) {
                return { success: false, error: 'Device not found' };
            }

            if (type === 'classic') {
                await this.bluetoothClassic.connect(device.address);
            } else if (type === 'ble') {
                await this.bluetoothScanner.connect(deviceId);
            }

            this.connectedDevices.set(deviceId, { ...device, type });
            return { success: true, deviceId, name: device.name, type };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async disconnectDevice(deviceId) {
        try {
            if (!this.connectedDevices.has(deviceId)) {
                return { success: false, error: 'Device not connected' };
            }

            const device = this.connectedDevices.get(deviceId);

            if (device.type === 'classic') {
                await this.bluetoothClassic.disconnect(device.address);
            } else if (device.type === 'ble') {
                await this.bluetoothScanner.disconnect(deviceId);
            }

            this.connectedDevices.delete(deviceId);
            return { success: true, deviceId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getConnectedDevices() {
        try {
            const devices = [];
            this.connectedDevices.forEach((device, id) => {
                devices.push({
                    id,
                    name: device.name,
                    address: device.address,
                    type: device.type
                });
            });
            return { success: true, devices };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async sendData(deviceId, data) {
        try {
            if (!this.connectedDevices.has(deviceId)) {
                return { success: false, error: 'Device not connected' };
            }

            const device = this.connectedDevices.get(deviceId);

            if (device.type === 'classic') {
                const result = await this.bluetoothClassic.sendData(device.address, data);
                return { success: true, deviceId, bytesSent: result.bytesSent, type: 'classic' };
            } else if (device.type === 'ble') {
                const result = await this.bluetoothScanner.sendData(deviceId, data);
                return { success: true, deviceId, bytesSent: result.bytesSent, type: 'ble' };
            }

            return { success: false, error: 'Unknown device type' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    addDiscoveredDevice(device) {
        const id = device.id || `ble_${Date.now()} `;
        this.bleDevices.set(id, {
            id,
            name: device.name || 'Unknown Device',
            address: device.address || 'N/A',
            type: 'ble'
        });
        return id;
    }

    clearDiscoveredDevices() {
        this.bleDevices.clear();
        this.classicDevices.clear();
    }
}

module.exports = BluetoothService;
