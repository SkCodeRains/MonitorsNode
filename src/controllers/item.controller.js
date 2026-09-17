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
  const { page, limit, category, search } = req.query;

  // If page or limit is provided, execute server-side paginated query
  if (page !== undefined || limit !== undefined) {
    const result = await itemService.getPaginatedItems({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 25,
      category: category || 'ALL',
      search: search || ''
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
  const deletedItem = await itemService.deleteItem(req.params.id);
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
