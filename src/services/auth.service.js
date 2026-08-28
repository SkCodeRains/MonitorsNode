const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { BadRequestError, UnauthorizedError } = require('../errors');

class AuthService {
  /**
   * Validates user credentials, API key, and signs a JWT token
   */
  async login(email, password, apiKey) {
    if (!apiKey) {
      throw new UnauthorizedError('API key is required. Provide it in the x-api-key header or request body.');
    }

    if (apiKey !== config.API_KEY) {
      throw new UnauthorizedError('Invalid API key.');
    }

    if (!email || !password) {
      throw new BadRequestError('Email and password are required.');
    }

    const trimmedEmail = email.toLowerCase().trim();
    if (trimmedEmail !== config.DEFAULT_USER.email.toLowerCase()) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isPasswordValid = bcrypt.compareSync(password, config.DEFAULT_USER.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }


    const token = jwt.sign(
      {
        id: config.DEFAULT_USER.id,
        email: config.DEFAULT_USER.email,
        name: config.DEFAULT_USER.name
      },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      token,
      user: {
        id: config.DEFAULT_USER.id,
        email: config.DEFAULT_USER.email,
        name: config.DEFAULT_USER.name
      }
    };
  }

  /**
   * Verifies and decodes a JWT token
   */
  verifyToken(token) {
    return jwt.verify(token, config.JWT_SECRET);
  }
}

module.exports = new AuthService();
