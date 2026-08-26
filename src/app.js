const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { getHealthStatus } = require('./controllers/health.controller');
const {
  handleJsonSyntaxError,
  notFoundHandler,
  errorHandler
} = require('./middlewares/error.middleware');

const app = express();

// Cross-Origin Resource Sharing (CORS)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.options('*', cors());

// Request parsing middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware to catch malformed JSON payloads gracefully
app.use(handleJsonSyntaxError);

// Root Route - Service Health & API Documentation
app.get('/', getHealthStatus);

// Mount API Routes
app.use('/api', routes);

// 404 Route Handler
app.use(notFoundHandler);

// Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
