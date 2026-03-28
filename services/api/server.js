const express = require('express');
const routes = require('./routes');
const { authenticateJWT, checkNonce, whitelistChecker } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(authenticateJWT);
app.use(checkNonce);
app.use(whitelistChecker);

// Routes
app.use('/api', routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start serverconst server = app.listen(PORT, () => {
  console.log(`DAO Nexus API server running on port ${PORT}`);
});

// Graceful shutdownprocess.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;