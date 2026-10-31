const crypto = require('crypto');
const exclusionRepository = require('../repositories/exclusion.repository');
const { BadRequestError, NotFoundError } = require('../errors');

class ExclusionService {
  async getAllExclusions() {
    const items = await exclusionRepository.findAll();
    const titles = items.filter(i => i.type === 'title').map(i => i.value);
    const packages = items.filter(i => i.type === 'package').map(i => i.value);

    return {
      items,
      titles,
      packages,
      count: items.length
    };
  }

  async addExclusion(body) {
    if (!body || !body.value || !String(body.value).trim()) {
      throw new BadRequestError('Exclusion value cannot be empty.');
    }

    const value = String(body.value).trim();
    const type = body.type === 'package' ? 'package' : 'title';

    const existing = await exclusionRepository.findByValue(value);
    if (existing) {
      return {
        item: existing,
        isExisting: true
      };
    }

    const newItem = {
      id: body.id || crypto.randomUUID(),
      type,
      value,
      createdAt: new Date()
    };

    const saved = await exclusionRepository.save(newItem);

    return {
      item: saved,
      isExisting: false
    };
  }

  async deleteExclusionById(id) {
    const deleted = await exclusionRepository.deleteById(id);
    if (!deleted) {
      throw new NotFoundError(`Exclusion with ID "${id}" was not found`);
    }

    return deleted;
  }
}

module.exports = new ExclusionService();