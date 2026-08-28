const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const DEFAULT_USER_EMAIL = process.env.DEFAULT_USER_EMAIL || 'skcoderains@gmail.com';
const DEFAULT_USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'CodeR@ins697972914439';
const DEFAULT_USER_NAME = process.env.DEFAULT_USER_NAME || 'CodeRains Admin';

const API_KEY = process.env.API_KEY || 'CR-MONITOR-KEY-2026-X99';

const config = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'MONITOR_SUPER_SECRET_JWT_KEY_2026_PROD',
  API_KEY: API_KEY,
  MONGODB_URI: process.env.MONGODB_URI || '',
  DB_NAME: process.env.DB_NAME || 'monitor_db',
  DEFAULT_USER: {
    id: 'usr_admin_01',
    email: DEFAULT_USER_EMAIL,
    name: DEFAULT_USER_NAME,
    passwordHash: bcrypt.hashSync(DEFAULT_USER_PASSWORD, 10)
  }
};

module.exports = { config };

