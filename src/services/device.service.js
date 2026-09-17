const deviceRepository = require('../repositories/device.repository');

class DeviceService {
  async getAllDevices() {
    return await deviceRepository.getAllDevices();
  }

  async registerOrTouch(deviceId, deviceName, meta) {
    return await deviceRepository.registerOrTouch(deviceId, deviceName, meta);
  }
}

module.exports = new DeviceService();
