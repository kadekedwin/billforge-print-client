const noble = require('@abandonware/noble');

class BluetoothScanner {
    constructor() {
        this.discoveredDevices = new Map();
        this.peripherals = new Map();
        this.connectedPeripherals = new Map();
        this.scanning = false;
    }

    async startScan(duration = 5000) {
        return new Promise((resolve, reject) => {
            this.discoveredDevices.clear();

            const onDiscover = (peripheral) => {
                const device = {
                    id: peripheral.id,
                    name: peripheral.advertisement.localName || 'Unknown Device',
                    address: peripheral.address || peripheral.id,
                    rssi: peripheral.rssi,
                    type: 'ble'
                };
                this.discoveredDevices.set(peripheral.id, device);
                this.peripherals.set(peripheral.id, peripheral);
                console.log(`Discovered: ${device.name} (${device.address})`);
            };

            const onStateChange = (state) => {
                if (state === 'poweredOn') {
                    console.log('Starting BLE scan...');
                    noble.on('discover', onDiscover);
                    noble.startScanning([], true);
                    this.scanning = true;

                    setTimeout(() => {
                        noble.stopScanning();
                        noble.removeListener('discover', onDiscover);
                        this.scanning = false;
                        console.log(`Scan complete. Found ${this.discoveredDevices.size} devices`);
                        resolve(Array.from(this.discoveredDevices.values()));
                    }, duration);
                } else {
                    reject(new Error(`Bluetooth is ${state}`));
                }
            };

            if (noble.state === 'poweredOn') {
                onStateChange('poweredOn');
            } else {
                noble.once('stateChange', onStateChange);
            }
        });
    }

    stopScan() {
        if (this.scanning) {
            noble.stopScanning();
            this.scanning = false;
        }
    }

    getDiscoveredDevices() {
        return Array.from(this.discoveredDevices.values());
    }

    async connect(deviceId) {
        return new Promise((resolve, reject) => {
            const peripheralId = deviceId.startsWith('ble_') ? deviceId.substring(4) : deviceId;

            console.log(`Attempting to connect to device: ${deviceId} (peripheral ID: ${peripheralId})`);
            console.log(`Available peripherals: ${Array.from(this.peripherals.keys()).join(', ')}`);

            const peripheral = this.peripherals.get(peripheralId);
            if (!peripheral) {
                console.error(`Peripheral not found for ID: ${peripheralId}`);
                console.error(`Stored peripheral IDs: ${JSON.stringify(Array.from(this.peripherals.keys()))}`);
                return reject(new Error('Device not found. Please discover devices first.'));
            }

            if (this.connectedPeripherals.has(peripheralId)) {
                return resolve({ success: true, message: 'Already connected' });
            }

            console.log(`Connecting to BLE device: ${peripheral.advertisement.localName || peripheralId}`);

            peripheral.connect((error) => {
                if (error) {
                    console.error('BLE connection error:', error);
                    return reject(new Error(`Failed to connect: ${error.message}`));
                }

                console.log(`Successfully connected to ${peripheral.advertisement.localName || peripheralId}`);
                this.connectedPeripherals.set(peripheralId, peripheral);

                peripheral.once('disconnect', () => {
                    console.log(`Device ${peripheralId} disconnected`);
                    this.connectedPeripherals.delete(peripheralId);
                });

                resolve({ success: true, deviceId: peripheralId });
            });
        });
    }

    async disconnect(deviceId) {
        return new Promise((resolve, reject) => {
            const peripheralId = deviceId.startsWith('ble_') ? deviceId.substring(4) : deviceId;
            const peripheral = this.connectedPeripherals.get(peripheralId);
            if (!peripheral) {
                return reject(new Error('Device not connected'));
            }

            console.log(`Disconnecting from BLE device: ${peripheralId}`);

            peripheral.disconnect((error) => {
                if (error) {
                    console.error('BLE disconnection error:', error);
                    return reject(new Error(`Failed to disconnect: ${error.message}`));
                }

                this.connectedPeripherals.delete(peripheralId);
                console.log(`Successfully disconnected from ${peripheralId}`);
                resolve({ success: true, deviceId: peripheralId });
            });
        });
    }

    async processDataWithDelays(data) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const chunks = [];
        let currentChunk = [];
        let i = 0;

        while (i < buffer.length) {
            if (i + 3 < buffer.length &&
                buffer[i] === 0x1B &&
                buffer[i + 1] === 0x7E &&
                buffer[i + 2] === 0x44) {

                if (currentChunk.length > 0) {
                    chunks.push({ type: 'data', buffer: Buffer.from(currentChunk) });
                    currentChunk = [];
                }

                const delayMs = buffer[i + 3];
                chunks.push({ type: 'delay', duration: delayMs });
                i += 4;
            } else {
                currentChunk.push(buffer[i]);
                i++;
            }
        }

        // Add remaining data
        if (currentChunk.length > 0) {
            chunks.push({ type: 'data', buffer: Buffer.from(currentChunk) });
        }

        return chunks;
    }

    async sendData(deviceId, data) {
        const peripheralId = deviceId.startsWith('ble_') ? deviceId.substring(4) : deviceId;
        const peripheral = this.connectedPeripherals.get(peripheralId);
        if (!peripheral) {
            throw new Error('Device not connected');
        }

        const chunks = await this.processDataWithDelays(data);
        let totalBytesSent = 0;

        for (const chunk of chunks) {
            if (chunk.type === 'delay') {
                console.log(`Delaying ${chunk.duration}ms`);
                await new Promise(resolve => setTimeout(resolve, chunk.duration));
            } else if (chunk.type === 'data') {
                await new Promise((resolve, reject) => {
                    peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
                        if (error) {
                            return reject(new Error(`Failed to discover services: ${error.message}`));
                        }

                        const writableChar = characteristics.find(char =>
                            char.properties.includes('write') || char.properties.includes('writeWithoutResponse')
                        );

                        if (!writableChar) {
                            return reject(new Error('No writable characteristic found'));
                        }

                        const useWriteWithoutResponse = writableChar.properties.includes('writeWithoutResponse');

                        writableChar.write(chunk.buffer, useWriteWithoutResponse, (error) => {
                            if (error) {
                                return reject(new Error(`Failed to write data: ${error.message}`));
                            }
                            totalBytesSent += chunk.buffer.length;
                            console.log(`Sent ${chunk.buffer.length} bytes to ${peripheralId}`);
                            resolve();
                        });
                    });
                });
            }
        }

        return { success: true, bytesSent: totalBytesSent };
    }

    getConnectedDevices() {
        const devices = [];
        this.connectedPeripherals.forEach((peripheral, id) => {
            devices.push({
                id,
                name: peripheral.advertisement.localName || 'Unknown Device',
                address: peripheral.address || id
            });
        });
        return devices;
    }
}

module.exports = BluetoothScanner;
