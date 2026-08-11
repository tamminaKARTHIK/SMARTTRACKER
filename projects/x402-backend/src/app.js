require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, startLocationSimulation } = require('./config/database');
const { getBuses, getPricing, getLiveLocation, getDates, getHistory, ingestCoordinates } = require('./controllers/tracker.controller');
const { x402Middleware } = require('./middleware/x402.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and body parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
const frontendPath = path.join(__dirname, '../../x402-frontend/dist');
app.use(express.static(frontendPath));

// API Routes
app.get('/api/buses', getBuses);
app.get('/api/pricing', getPricing);
app.get('/api/buses/:busId/live', x402Middleware, getLiveLocation);
app.get('/api/buses/:busId/dates', getDates);
app.get('/api/buses/:busId/history', getHistory);

// IoT Ingestion Endpoints (supports GET for query string and POST for JSON payload)
app.post('/api/ingest', ingestCoordinates);
app.get('/api/ingest', ingestCoordinates);

// Fallback index.html for React routing
app.get('/*splat', (req, res, next) => {
  // If requesting API, proceed to 404
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not Found' });
});

// Bootstrap server and database
initDb()
  .then(() => {
    console.log('Database initialized successfully.');
    
    // Start simulating BUS-17 real-time coordinate updates
    startLocationSimulation();
    console.log('IoT Simulation service started (Updating BUS-17 every 10s).');

    app.listen(PORT, () => {
      console.log(`SmartTransitX Backend Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Fatal database initialization error:', err);
    process.exit(1);
  });
