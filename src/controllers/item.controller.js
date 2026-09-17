const itemService = require('../services/item.service');
const deviceRepository = require('../repositories/device.repository');
const { asyncHandler } = require('../utils/asyncHandler');

const createItem = asyncHandler(async (req, res) => {
  // Extract device identity from headers or body
  const rawDeviceId = req.headers['x-device-id'] || req.body.deviceId || null;
  const rawDeviceName = req.headers['x-device-name'] || req.body.deviceName || null;
  const deviceInfo = req.body.deviceInfo || {};

  let assignedDeviceId = null;
  let assignedDeviceName = null;

  if (rawDeviceId) {
    assignedDeviceId = String(rawDeviceId).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    assignedDeviceName = rawDeviceName ? String(rawDeviceName).trim() : assignedDeviceId;
    await deviceRepository.registerOrTouch(assignedDeviceId, assignedDeviceName, deviceInfo);
  } else if (deviceInfo && (deviceInfo.brand || deviceInfo.model)) {
    // New phone posting for the first time with deviceInfo metadata
    const autoId = `${deviceInfo.brand || 'phone'}_${deviceInfo.model || 'unknown'}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const autoName = `${deviceInfo.brand || ''} ${deviceInfo.model || ''}`.trim() || autoId;
    assignedDeviceId = autoId;
    assignedDeviceName = autoName;
    await deviceRepository.registerOrTouch(assignedDeviceId, assignedDeviceName, deviceInfo);
  } else {
    // Old app (Vivo / Legacy) without device info -> falls into OTHER
    assignedDeviceId = null;
    await deviceRepository.registerOrTouch(null, null);
  }

  const payloadToStore = {
    ...req.body,
    deviceId: assignedDeviceId,
    deviceName: assignedDeviceName
  };

  const result = await itemService.createItem(payloadToStore);
  return res.status(201).json({
    success: true,
    message: 'Item stored successfully',
    deviceId: assignedDeviceId || 'OTHER',
    item: result.item,
    totalCount: result.totalCount
  });
});

const getAllItems = asyncHandler(async (req, res) => {
  const { page, limit, category, search, device } = req.query;

  // Default device tab is 'OTHER'
  const selectedDevice = device !== undefined ? device : 'OTHER';

  // If page or limit is provided, execute server-side paginated query
  if (page !== undefined || limit !== undefined) {
    const result = await itemService.getPaginatedItems({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 25,
      category: category || 'ALL',
      search: search || '',
      device: selectedDevice
    });

    return res.status(200).json({
      success: true,
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
      categoryCounts: result.categoryCounts,
      device: selectedDevice,
      count: result.items.length,
      data: result.items
    });
  }

  // Otherwise return full dataset (backwards compatibility)
  const items = await itemService.getAllItems();
  return res.status(200).json({
    success: true,
    count: items.length,
    data: items
  });
});

const getItemById = asyncHandler(async (req, res) => {
  const item = await itemService.getItemById(req.params.id);
  if (!item) {
    return res.status(404).json({
      success: false,
      error: 'Item not found'
    });
  }
  return res.status(200).json({
    success: true,
    data: item
  });
});

const deleteItem = asyncHandler(async (req, res) => {
  const deletedItem = await itemService.deleteItemById(req.params.id);
  if (!deletedItem) {
    return res.status(404).json({
      success: false,
      error: 'Item not found'
    });
  }
  return res.status(200).json({
    success: true,
    message: 'Item deleted successfully',
    deletedItem
  });
});

const deleteAllItems = asyncHandler(async (req, res) => {
  const deletedCount = await itemService.deleteAllItems();
  return res.status(200).json({
    success: true,
    message: 'All items deleted successfully',
    deletedCount
  });
});

module.exports = {
  createItem,
  getAllItems,
  getItemById,
  deleteItem,
  deleteItemById: deleteItem,
  deleteAllItems
};
