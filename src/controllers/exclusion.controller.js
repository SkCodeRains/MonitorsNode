const exclusionService = require('../services/exclusion.service');
const { asyncHandler } = require('../utils/asyncHandler');

const getAllExclusions = asyncHandler(async (req, res) => {
  const result = await exclusionService.getAllExclusions();
  return res.status(200).json({
    success: true,
    count: result.count,
    data: result.items,
    titles: result.titles,
    packages: result.packages
  });
});

const addExclusion = asyncHandler(async (req, res) => {
  const result = await exclusionService.addExclusion(req.body);
  return res.status(201).json({
    success: true,
    message: result.isExisting ? 'Exclusion already exists' : 'Exclusion added successfully',
    item: result.item,
    isExisting: result.isExisting
  });
});

const deleteExclusionById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await exclusionService.deleteExclusionById(id);
  return res.status(200).json({
    success: true,
    message: 'Exclusion with ID "  + id +  \ removed successfully',
 deletedItem: deleted
 });
});

module.exports = {
 getAllExclusions,
 addExclusion,
 deleteExclusionById
};