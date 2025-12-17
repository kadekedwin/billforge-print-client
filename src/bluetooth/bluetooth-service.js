const BluetoothClassic = require('./bluetooth-classic');
const BluetoothScanner = require('./bluetooth-scanner');

class BluetoothService {
    constructor() {
        this.bleDevices = new Map();
        this.classicDevices = new Map();
        this.connectedDevices = new Map();
        this.bluetoothClassic = new BluetoothClassic();
        this.bluetoothScanner = new BluetoothScanner();
    }

    async discoverDevices(filters = {}) {
        try {
            const devices = [];

            console.log('Starting Bluetooth Classic discovery...');
            const classicDevices = await this.bluetoothClassic.discoverDevices();
            console.log(`Found ${classicDevices.length} classic devices`);

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

            console.log('Starting BLE scan for nearby devices...');
            try {
                const bleDevices = await this.bluetoothScanner.startScan(5000);
                console.log(`Found ${bleDevices.length} BLE devices`);

                bleDevices.forEach(device => {
                    const id = `ble_${device.address}`;
                    this.bleDevices.set(id, {
                        id,
                        name: device.name,
                        address: device.address,
                        type: 'ble',
                        rssi: device.rssi
                    });
                });
            } catch (error) {
                console.error('BLE scan error:', error.message);
            }

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

            const filteredCount = ignoreUnknown ? ` (${devices.length} after filtering)` : '';
            console.log(`Returning ${devices.length} total devices${filteredCount}`);
            return { success: true, devices };
        } catch (error) {
            console.error('Discovery error:', error);
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
