const noble = require('@abandonware/noble');

class BluetoothScanner {
    constructor(onDisconnect = null) {
        this.discoveredDevices = new Map();
        this.peripherals = new Map();
        this.connectedPeripherals = new Map();
        this.peripheralCharacteristics = new Map();
        this.healthCheckIntervals = new Map();
        this.scanning = false;
        this.onDisconnect = onDisconnect;
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
            };

            const onStateChange = (state) => {
                if (state === 'poweredOn') {
                    noble.on('discover', onDiscover);
                    noble.startScanning([], true);
                    this.scanning = true;

                    setTimeout(() => {
                        noble.stopScanning();
                        noble.removeListener('discover', onDiscover);
                        this.scanning = false;
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
        const peripheralId = deviceId.startsWith('ble_') ? deviceId.substring(4) : deviceId;
        const peripheral = this.peripherals.get(peripheralId);

        if (!peripheral) {
            throw new Error('Device not found. Please discover devices first.');
        }

        if (this.connectedPeripherals.has(peripheralId)) {
            return { success: true, message: 'Already connected' };
        }

        return new Promise((resolve, reject) => {
            peripheral.connect((error) => {
                if (error) {
                    return reject(new Error(`Failed to connect: ${error.message}`));
                }

                this.connectedPeripherals.set(peripheralId, peripheral);

                peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics) => {
                    if (!err && characteristics) {
                        this.peripheralCharacteristics.set(peripheralId, characteristics);
                    }
                });

                this.startHealthMonitoring(peripheralId, peripheral);

                peripheral.once('disconnect', () => {
                    this.handleDisconnect(peripheralId);
                });

                resolve({ success: true, deviceId: peripheralId });
            });
        });
    }

    async disconnect(deviceId) {
        const peripheralId = deviceId.startsWith('ble_') ? deviceId.substring(4) : deviceId;
        const peripheral = this.connectedPeripherals.get(peripheralId);

        if (!peripheral) {
            throw new Error('Device not connected');
        }

        this.stopHealthMonitoring(peripheralId);

        return new Promise((resolve, reject) => {
            peripheral.disconnect((error) => {
                if (error) {
                    return reject(new Error(`Failed to disconnect: ${error.message}`));
                }

                this.connectedPeripherals.delete(peripheralId);
                resolve({ success: true, deviceId: peripheralId });
            });
        });
    }

    handleDisconnect(peripheralId) {
        this.stopHealthMonitoring(peripheralId);
        this.connectedPeripherals.delete(peripheralId);
        this.peripheralCharacteristics.delete(peripheralId);

        if (this.onDisconnect) {
            this.onDisconnect(`ble_${peripheralId}`);
        }
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

        let characteristics = this.peripheralCharacteristics.get(peripheralId);

        if (!characteristics) {
            characteristics = await new Promise((resolve, reject) => {
                peripheral.discoverAllServicesAndCharacteristics((error, services, chars) => {
                    if (error) {
                        return reject(new Error(`Failed to discover services: ${error.message}`));
                    }
                    this.peripheralCharacteristics.set(peripheralId, chars);
                    resolve(chars);
                });
            });
        }

        const writableChar = characteristics.find(char =>
            char.properties.includes('write') || char.properties.includes('writeWithoutResponse')
        );

        if (!writableChar) {
            throw new Error('No writable characteristic found');
        }

        const useWriteWithoutResponse = writableChar.properties.includes('writeWithoutResponse');
        const chunks = await this.processDataWithDelays(data);
        let totalBytesSent = 0;

        for (const chunk of chunks) {
            if (chunk.type === 'delay') {
                await new Promise(resolve => setTimeout(resolve, chunk.duration));
            } else if (chunk.type === 'data') {
                await new Promise((resolve, reject) => {
                    writableChar.write(chunk.buffer, useWriteWithoutResponse, (error) => {
                        if (error) {
                            return reject(new Error(`Failed to write data: ${error.message}`));
                        }
                        totalBytesSent += chunk.buffer.length;
                        resolve();
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

    startHealthMonitoring(peripheralId, peripheral) {
        let failureCount = 0;

        const interval = setInterval(() => {
            if (!this.connectedPeripherals.has(peripheralId)) {
                this.stopHealthMonitoring(peripheralId);
                return;
            }

            peripheral.updateRssi((error, rssi) => {
                if (error) {
                    failureCount++;

                    if (failureCount >= 2) {
                        clearInterval(interval);
                        this.healthCheckIntervals.delete(peripheralId);

                        this.connectedPeripherals.delete(peripheralId);
                        this.peripheralCharacteristics.delete(peripheralId);

                        if (this.onDisconnect) {
                            this.onDisconnect(`ble_${peripheralId}`);
                        }
                    }
                } else {
                    failureCount = 0;
                }
            });
        }, 3000);

        this.healthCheckIntervals.set(peripheralId, interval);
    }

    stopHealthMonitoring(peripheralId) {
        const interval = this.healthCheckIntervals.get(peripheralId);
        if (interval) {
            clearInterval(interval);
            this.healthCheckIntervals.delete(peripheralId);
        }
    }
}

module.exports = BluetoothScanner;
