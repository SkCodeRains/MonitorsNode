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

const getUsageHistory = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { days = 7 } = req.query;

  const history = await deviceRepository.getUsageHistory(deviceId, days);
  return res.status(200).json({
    success: true,
    deviceId,
    count: history.length,
    history
  });
});

const updateTimelineSessions = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { date, totalScreenTimeSeconds, totalUnlocks, sessions } = req.body;

  if (!deviceId) {
    return res.status(400).json({ success: false, message: 'Device ID is required' });
  }

  const updated = await deviceRepository.updateTimelineSessions(deviceId, {
    date,
    totalScreenTimeSeconds,
    totalUnlocks,
    sessions
  });

  return res.status(200).json({
    success: true,
    message: 'Timeline sessions updated successfully',
    sessionCount: updated?.sessions?.length || 0,
    data: updated
  });
});

const getTimelineSessions = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { date } = req.query;

  const data = await deviceRepository.getTimelineSessions(deviceId, date);
  return res.status(200).json({
    success: true,
    deviceId,
    date: date || new Date().toISOString().slice(0, 10),
    data: data || {
      totalScreenTimeSeconds: 0,
      totalUnlocks: 0,
      sessions: []
    }
  });
});

module.exports = {
  getDevices,
  updateDataUsage,
  updateAppUsage,
  getUsageHistory,
  updateTimelineSessions,
  getTimelineSessions
};
