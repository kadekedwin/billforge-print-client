const api = new BluetoothAPI();

const wsStatus = document.getElementById('ws-status');
const discoverBtn = document.getElementById('discover-btn');
const refreshBtn = document.getElementById('refresh-btn');
const clearBtn = document.getElementById('clear-btn');
const discoveredDevices = document.getElementById('discovered-devices');
const connectedDevices = document.getElementById('connected-devices');

async function init() {
    try {
        await api.connect();
        wsStatus.textContent = 'Connected';
        wsStatus.className = 'connected';
        await refreshDevices();
    } catch (error) {
        wsStatus.textContent = 'Connection Failed';
        wsStatus.className = 'error';
        console.error('Failed to connect:', error);
    }
}

async function refreshDevices() {
    try {
        const discovered = await api.discoverDevices();
        const connected = await api.getConnectedDevices();

        renderDiscoveredDevices(discovered.devices || []);
        renderConnectedDevices(connected.devices || []);
    } catch (error) {
        console.error('Failed to refresh devices:', error);
    }
}

function renderDiscoveredDevices(devices) {
    if (devices.length === 0) {
        discoveredDevices.innerHTML = '<p class="no-devices">No devices discovered</p>';
        return;
    }

    discoveredDevices.innerHTML = devices.map(device => `
    <div class="device-item">
      <div class="device-info">
        <strong>${device.name}</strong>
        <span class="device-id">${device.address}</span>
        <span class="device-type ${device.type}">${device.type.toUpperCase()}</span>
      </div>
      <button class="connect-btn" data-id="${device.id}" ${device.connected ? 'disabled' : ''}>
        ${device.connected ? 'Connected' : 'Connect'}
      </button>
    </div>
  `).join('');

    document.querySelectorAll('.connect-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const deviceId = e.target.dataset.id;
            try {
                await api.connectDevice(deviceId);
                await refreshDevices();
            } catch (error) {
                console.error('Failed to connect:', error);
                alert('Failed to connect: ' + error.message);
            }
        });
    });
}

function renderConnectedDevices(devices) {
    if (devices.length === 0) {
        connectedDevices.innerHTML = '<p class="no-devices">No devices connected</p>';
        return;
    }

    connectedDevices.innerHTML = devices.map(device => `
    <div class="device-item">
      <div class="device-info">
        <strong>${device.name}</strong>
        <span class="device-id">${device.address}</span>
        <span class="device-type ${device.type}">${device.type.toUpperCase()}</span>
      </div>
      <button class="disconnect-btn" data-id="${device.id}">Disconnect</button>
    </div>
  `).join('');

    document.querySelectorAll('.disconnect-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const deviceId = e.target.dataset.id;
            try {
                await api.disconnectDevice(deviceId);
                await refreshDevices();
            } catch (error) {
                console.error('Failed to disconnect:', error);
                alert('Failed to disconnect: ' + error.message);
            }
        });
    });
}

discoverBtn.addEventListener('click', async () => {
    try {
        await api.discoverDevices();
        await refreshDevices();
    } catch (error) {
        console.error('Discovery failed:', error);
        alert('Discovery failed: ' + error.message);
    }
});

const discoverBleBtn = document.getElementById('discover-ble-btn');
discoverBleBtn.addEventListener('click', async () => {
    try {
        await api.discoverBLE();
        await refreshDevices();
    } catch (error) {
        console.error('BLE Discovery failed:', error);
        alert('BLE Discovery failed: ' + error.message);
    }
});

refreshBtn.addEventListener('click', refreshDevices);

clearBtn.addEventListener('click', async () => {
    try {
        await api.clearDevices();
        await refreshDevices();
    } catch (error) {
        console.error('Failed to clear devices:', error);
    }
});

init();
