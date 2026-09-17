const deviceService = require('../services/device.service');
const { asyncHandler } = require('../utils/asyncHandler');

const getDevices = asyncHandler(async (req, res) => {
  const devices = await deviceService.getAllDevices();
  return res.status(200).json({
    success: true,
    count: devices.length,
    devices
  });
});

module.exports = {
  getDevices
};
