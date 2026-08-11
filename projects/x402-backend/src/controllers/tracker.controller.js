const { getBusMetadata } = require('../config/database');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Get all available buses and their status
 * Groups unique bus_id records and retrieves the latest coordinate for each.
 */
async function getBuses(req, res) {
  try {
    const remoteRes = await fetch('https://careerinedu.com/tracker/bustracker/tracker.php?api=buses', {
      headers: { 'User-Agent': USER_AGENT }
    });
    const remoteData = await remoteRes.json();

    if (!remoteData.success || !Array.isArray(remoteData.data)) {
      return res.status(502).json({ success: false, error: 'Invalid response from remote PHP API.' });
    }

    const formattedBuses = remoteData.data.map(bus => {
      const meta = getBusMetadata(bus.bus_code);
      return {
        id: Math.random() > 0.5 ? bus.bus_code : bus.bus_code, // Keep original
        bus_number: meta.bus_number,
        route_name: bus.bus_name || meta.route_name,
        start_location: meta.start_location,
        destination: meta.destination,
        status: meta.status,
        location_available: true
      };
    });

    res.json({ success: true, data: formattedBuses });
  } catch (error) {
    res.status(500).json({ success: false, error: 'API Gateway proxy error: ' + error.message });
  }
}

/**
 * Get pricing tiers dynamically
 */
async function getPricing(req, res) {
  try {
    const tiers = [
      { duration_minutes: 15, price_algo: 0.10 },
      { duration_minutes: 30, price_algo: 0.15 },
      { duration_minutes: 60, price_algo: 0.25 }
    ];
    res.json({ success: true, data: tiers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get live coordinate of a bus (Gated by x402Middleware)
 */
async function getLiveLocation(req, res) {
  const { busId } = req.params;
  try {
    const remoteRes = await fetch(`https://careerinedu.com/tracker/bustracker/tracker.php?api=live&bus_code=${busId}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const remoteData = await remoteRes.json();

    if (!remoteData.success || !remoteData.data) {
      return res.status(404).json({ success: false, error: 'No coordinates recorded for this bus on remote server.' });
    }

    const coords = remoteData.data;
    const meta = getBusMetadata(busId);

    res.json({
      success: true,
      data: {
        busId: busId,
        routeId: meta.route_name,
        latitude: parseFloat(coords.latitude),
        longitude: parseFloat(coords.longitude),
        speed: parseFloat(coords.speed || '0'),
        heading: 90.0, // default heading
        timestamp: coords.timestamp,
        status: parseFloat(coords.speed || '0') > 2 ? 'Running' : 'Stationary'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'API Gateway proxy error: ' + error.message });
  }
}

/**
 * IoT Ingestion Endpoint (Ingests coordinates and forwards them to remote PHP backend)
 */
async function ingestCoordinates(req, res) {
  let busId, latitude, longitude, speed;

  if (req.method === 'GET') {
    busId = req.query.bus_id;
    latitude = parseFloat(req.query.la);
    longitude = parseFloat(req.query.lo);
    speed = parseFloat(req.query.s);
  } else {
    // POST request
    busId = req.body.bus_id;
    latitude = parseFloat(req.body.latitude);
    longitude = parseFloat(req.body.longitude);
    speed = parseFloat(req.body.speed);
  }

  if (!busId || isNaN(latitude) || isNaN(longitude) || isNaN(speed)) {
    return res.status(400).send('Invalid telemetry payload parameters.');
  }

  try {
    // Forward the ingestion coordinate query parameter string directly to the legacy bus1.php receiver!
    const forwardUrl = `https://careerinedu.com/tracker/bustracker/bus1.php?bus_id=${busId}&la=${latitude}&lo=${longitude}&s=${speed}`;
    const remoteResponse = await fetch(forwardUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const remoteText = await remoteResponse.text();
    
    console.log(`[IoT INGEST FORWARD] Forwarded coordinate details for ${busId} to remote PHP. Response: ${remoteText}`);
    res.send(remoteText);
  } catch (error) {
    console.error('Telemetry forward failed:', error);
    res.status(500).send('Proxy forwarding error: ' + error.message);
  }
}

/**
 * Get available historical tracking dates for a bus
 */
async function getDates(req, res) {
  const { busId } = req.params;
  try {
    const remoteRes = await fetch(`https://careerinedu.com/tracker/bustracker/tracker.php?api=dates&bus_code=${busId}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const remoteData = await remoteRes.json();
    if (!remoteData.success) {
      return res.status(404).json({ success: false, error: 'No dates found for this bus.' });
    }
    res.json({ success: true, data: remoteData.data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Proxy error: ' + error.message });
  }
}

/**
 * Get historical GPS route path coordinates for a bus and date
 */
async function getHistory(req, res) {
  const { busId } = req.params;
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, error: 'date query parameter is required.' });
  }
  try {
    const remoteRes = await fetch(`https://careerinedu.com/tracker/bustracker/tracker.php?api=history&bus_code=${busId}&date=${date}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const remoteData = await remoteRes.json();
    if (!remoteData.success) {
      return res.status(404).json({ success: false, error: 'No history found for this bus and date.' });
    }
    res.json({ success: true, data: remoteData.data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Proxy error: ' + error.message });
  }
}

module.exports = {
  getBuses,
  getPricing,
  getLiveLocation,
  getDates,
  getHistory,
  ingestCoordinates
};
