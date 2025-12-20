const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class BluetoothClassic {
    constructor(onDisconnect = null) {
        this.devices = new Map();
        this.connections = new Map();
        this.healthCheckIntervals = new Map();
        this.onDisconnect = onDisconnect;
    }

    async discoverDevices() {
        try {
            const platform = process.platform;
            let devices = [];

            if (platform === 'darwin') {
                devices = await this.discoverMacOS();
            } else if (platform === 'linux') {
                devices = await this.discoverLinux();
            } else if (platform === 'win32') {
                devices = await this.discoverWindows();
            }

            devices.forEach(device => {
                this.devices.set(device.address, device);
            });

            return devices;
        } catch (error) {
            throw new Error(`Discovery failed: ${error.message}`);
        }
    }

    async discoverMacOS() {
        try {
            const devices = [];

            try {
                await execAsync('blueutil --inquiry 5', { timeout: 6000 });
            } catch (e) { }

            const { stdout } = await execAsync('system_profiler SPBluetoothDataType -json');

            if (!stdout || stdout.trim() === '') {
                return [];
            }

            const data = JSON.parse(stdout);

            if (data.SPBluetoothDataType && data.SPBluetoothDataType[0]) {
                const btData = data.SPBluetoothDataType[0];

                if (btData.device_connected && Array.isArray(btData.device_connected)) {
                    btData.device_connected.forEach(deviceObj => {
                        Object.entries(deviceObj).forEach(([name, info]) => {
                            if (info.device_address) {
                                devices.push({
                                    name: name,
                                    address: info.device_address,
                                    paired: true,
                                    connected: true
                                });
                            }
                        });
                    });
                }

                if (btData.device_not_connected && Array.isArray(btData.device_not_connected)) {
                    btData.device_not_connected.forEach(deviceObj => {
                        Object.entries(deviceObj).forEach(([name, info]) => {
                            if (info.device_address) {
                                devices.push({
                                    name: name,
                                    address: info.device_address,
                                    paired: true,
                                    connected: false
                                });
                            }
                        });
                    });
                }
            }

            return devices;
        } catch (error) {
            throw new Error(`macOS discovery failed: ${error.message}`);
        }
    }

    async discoverLinux() {
        try {
            const { stdout } = await execAsync('bluetoothctl devices');
            const lines = stdout.trim().split('\n');
            const devices = [];

            for (const line of lines) {
                const match = line.match(/Device ([0-9A-F:]+) (.+)/i);
                if (match) {
                    const address = match[1];
                    const name = match[2];

                    let paired = false;
                    let connected = false;

                    try {
                        const { stdout: infoOut } = await execAsync(`bluetoothctl info ${address}`);
                        paired = infoOut.includes('Paired: yes');
                        connected = infoOut.includes('Connected: yes');
                    } catch (e) { }

                    devices.push({ name, address, paired, connected });
                }
            }

            return devices;
        } catch (error) {
            throw new Error(`Linux discovery failed: ${error.message}`);
        }
    }

    async discoverWindows() {
        try {
            const script = `
        Get-PnpDevice -Class Bluetooth | 
        Where-Object {$_.Status -eq "OK"} | 
        Select-Object FriendlyName, InstanceId | 
        ConvertTo-Json
      `;

            const { stdout } = await execAsync(`powershell -Command "${script}"`);

            if (!stdout || stdout.trim() === '') {
                return [];
            }

            const data = JSON.parse(stdout);

            if (!data) {
                return [];
            }

            const devices = Array.isArray(data) ? data : [data];

            return devices
                .filter(device => device && device.FriendlyName && device.InstanceId)
                .map(device => ({
                    name: device.FriendlyName,
                    address: device.InstanceId,
                    paired: true,
                    connected: false
                }));
        } catch (error) {
            throw new Error(`Windows discovery failed: ${error.message}`);
        }
    }

    async connect(address) {
        try {
            const platform = process.platform;

            if (platform === 'darwin') {
                await this.connectMacOS(address);
            } else if (platform === 'linux') {
                await this.connectLinux(address);
            } else if (platform === 'win32') {
                await this.connectWindows(address);
            }

            const device = this.devices.get(address);
            if (device) {
                device.connected = true;
                this.connections.set(address, { device, connectedAt: Date.now() });
                this.startHealthMonitoring(address);
            }

            return { success: true, address };
        } catch (error) {
            throw new Error(`Connection failed: ${error.message}`);
        }
    }

    async connectMacOS(address) {
        const script = `
      tell application "System Events"
        tell process "Bluetooth"
          click menu item "Connect" of menu 1 of menu bar item "Bluetooth" of menu bar 1
        end tell
      end tell
    `;

        try {
            await execAsync(`osascript -e '${script}'`);
        } catch (error) { }
    }

    async connectLinux(address) {
        await execAsync(`bluetoothctl connect ${address}`);
    }

    async connectWindows(address) {
        const script = `
      Add-Type -AssemblyName System.Runtime.WindowsRuntime
      $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`\`1' })[0]
      Function Await($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        $netTask.Result
      }
      [Windows.Devices.Enumeration.DeviceInformation,Windows.Devices.Enumeration,ContentType=WindowsRuntime] | Out-Null
    `;

        await execAsync(`powershell -Command "${script}"`);
    }

    async disconnect(address) {
        try {
            this.stopHealthMonitoring(address);

            const platform = process.platform;

            if (platform === 'darwin') {
                await this.disconnectMacOS(address);
            } else if (platform === 'linux') {
                await this.disconnectLinux(address);
            } else if (platform === 'win32') {
                await this.disconnectWindows(address);
            }

            const device = this.devices.get(address);
            if (device) {
                device.connected = false;
            }
            this.connections.delete(address);

            return { success: true, address };
        } catch (error) {
            throw new Error(`Disconnection failed: ${error.message}`);
        }
    }

    async disconnectMacOS(address) { }

    async disconnectLinux(address) {
        await execAsync(`bluetoothctl disconnect ${address}`);
    }

    async disconnectWindows(address) { }

    async processDataWithDelays(address, data) {
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

    async sendData(address, data) {
        try {
            if (!this.connections.has(address)) {
                throw new Error('Device not connected');
            }

            const chunks = await this.processDataWithDelays(address, data);
            let totalBytesSent = 0;

            for (const chunk of chunks) {
                if (chunk.type === 'data') {
                    totalBytesSent += chunk.buffer.length;
                } else if (chunk.type === 'delay') {
                    await new Promise(resolve => setTimeout(resolve, chunk.duration));
                }
            }

            return { success: true, bytesSent: totalBytesSent };
        } catch (error) {
            throw new Error(`Send failed: ${error.message}`);
        }
    }

    getConnectedDevices() {
        const devices = [];
        this.connections.forEach((conn, address) => {
            devices.push({
                address,
                name: conn.device.name,
                connectedAt: conn.connectedAt
            });
        });
        return devices;
    }

    getDevice(address) {
        return this.devices.get(address);
    }

    getAllDevices() {
        return Array.from(this.devices.values());
    }

    startHealthMonitoring(address) {
        const platform = process.platform;

        const interval = setInterval(async () => {
            if (!this.connections.has(address)) {
                this.stopHealthMonitoring(address);
                return;
            }

            try {
                let isConnected = false;

                if (platform === 'darwin') {
                    isConnected = await this.checkConnectionMacOS(address);
                } else if (platform === 'linux') {
                    isConnected = await this.checkConnectionLinux(address);
                } else if (platform === 'win32') {
                    isConnected = await this.checkConnectionWindows(address);
                }

                if (!isConnected) {
                    this.handleDisconnect(address);
                }
            } catch (error) {
                console.error(`Health check failed for ${address}:`, error.message);
            }
        }, 5000);

        this.healthCheckIntervals.set(address, interval);
    }

    stopHealthMonitoring(address) {
        const interval = this.healthCheckIntervals.get(address);
        if (interval) {
            clearInterval(interval);
            this.healthCheckIntervals.delete(address);
        }
    }

    handleDisconnect(address) {
        this.stopHealthMonitoring(address);

        const device = this.devices.get(address);
        if (device) {
            device.connected = false;
        }

        this.connections.delete(address);

        if (this.onDisconnect) {
            this.onDisconnect(`classic_${address}`);
        }

        console.log(`Device disconnected: ${address}`);
    }

    async checkConnectionMacOS(address) {
        try {
            const { stdout } = await execAsync('system_profiler SPBluetoothDataType -json');
            const data = JSON.parse(stdout);

            if (data.SPBluetoothDataType && data.SPBluetoothDataType[0]) {
                const btData = data.SPBluetoothDataType[0];

                if (btData.device_connected && Array.isArray(btData.device_connected)) {
                    for (const deviceObj of btData.device_connected) {
                        for (const [name, info] of Object.entries(deviceObj)) {
                            if (info.device_address === address) {
                                return true;
                            }
                        }
                    }
                }
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    async checkConnectionLinux(address) {
        try {
            const { stdout } = await execAsync(`bluetoothctl info ${address}`);
            return stdout.includes('Connected: yes');
        } catch (error) {
            return false;
        }
    }

    async checkConnectionWindows(address) {
        try {
            const script = `
                Get-PnpDevice -InstanceId "${address}" | 
                Where-Object {$_.Status -eq "OK"} | 
                Select-Object Status | 
                ConvertTo-Json
            `;

            const { stdout } = await execAsync(`powershell -Command "${script}"`);

            if (!stdout || stdout.trim() === '') {
                return false;
            }

            const data = JSON.parse(stdout);
            return data && data.Status === 'OK';
        } catch (error) {
            return false;
        }
    }
}

module.exports = BluetoothClassic;
