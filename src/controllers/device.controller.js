const deviceService = require('../services/device.service');
const deviceRepository = require('../repositories/device.repository');
const { asyncHandler } = require('../utils/asyncHandler');

const getDevices = asyncHandler(async (req, res) => {
  const devices = await deviceService.getAllDevices();
  return res.status(200).json({
    success: true,
    count: devices.length,
    devices
  });
});

const updateDataUsage = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { mobileBytes, wifiBytes, totalBytes, timestamp } = req.body;

  if (!deviceId) {
    return res.status(400).json({ success: false, message: 'Device ID is required' });
  }

  const updatedDevice = await deviceRepository.updateDataUsage(deviceId, {
    mobileBytes,
    wifiBytes,
    totalBytes,
    timestamp
  });

  return res.status(200).json({
    success: true,
    message: 'Data usage updated successfully',
    dataUsage: updatedDevice?.dataUsage || null
  });
});

const updateAppUsage = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { apps } = req.body;

  if (!deviceId) {
    return res.status(400).json({ success: false, message: 'Device ID is required' });
  }

  const updatedDevice = await deviceRepository.updateAppUsage(deviceId, apps || []);

  return res.status(200).json({
    success: true,
    message: 'App usage updated successfully',
    count: updatedDevice?.appUsage?.length || 0,
    appUsage: updatedDevice?.appUsage || []
  });
});

module.exports = {
  getDevices,
  updateDataUsage,
  updateAppUsage
};
