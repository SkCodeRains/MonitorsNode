const itemService = require('../services/item.service');
const { asyncHandler } = require('../utils/asyncHandler');

const createItem = asyncHandler(async (req, res) => {
  const result = await itemService.createItem(req.body);
  return res.status(201).json({
    success: true,
    message: 'Item stored successfully',
    item: result.item,
    totalCount: result.totalCount
  });
});

const getAllItems = asyncHandler(async (req, res) => {
  const items = await itemService.getAllItems();
  return res.status(200).json({
    success: true,
    count: items.length,
    data: items
  });
});

const getItemById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await itemService.getItemById(id);
  return res.status(200).json({
    success: true,
    data: item
  });
});

const deleteItemById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await itemService.deleteItemById(id);
  return res.status(200).json({
    success: true,
    message: `Item with ID "${id}" deleted successfully`,
    deletedItem: result.deletedItem,
    remainingCount: result.remainingCount
  });
});

const deleteAllItems = asyncHandler(async (req, res) => {
  const result = await itemService.deleteAllItems();
  return res.status(200).json({
    success: true,
    message: 'All items deleted successfully',
    deletedCount: result.deletedCount,
    remainingCount: result.remainingCount
  });
});

module.exports = {
  createItem,
  getAllItems,
  getItemById,
  deleteItemById,
  deleteAllItems
};
