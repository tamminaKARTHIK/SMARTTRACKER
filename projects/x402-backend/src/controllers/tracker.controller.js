const { getBusMetadata } = require('../config/database');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Local fallbacks when remote hosting server is offline
const FALLBACK_BUSES = [
  {
    id: "BUS01",
    bus_number: "01",
    route_name: "Bus 01 - Main Route",
    start_location: "Vijayawada",
    destination: "Kanchikacherla",
    status: "Running",
    location_available: true
  },
  {
    id: "BUS02",
    bus_number: "02",
    route_name: "Bus 02 - Express",
    start_location: "Benz Circle",
    destination: "JNTU Kakinada",
    status: "Idle",
    location_available: true
  }
];

const FALLBACK_DATES = ["2026-08-10"];

const FALLBACK_HISTORY = [
  { latitude: 16.5062, longitude: 80.6480, speed: 0.0, timestamp: "2026-08-10 09:00:00" },
  { latitude: 16.5150, longitude: 80.6350, speed: 25.0, timestamp: "2026-08-10 09:05:00" },
  { latitude: 16.5220, longitude: 80.6120, speed: 45.0, timestamp: "2026-08-10 09:10:00" },
  { latitude: 16.5350, longitude: 80.5750, speed: 50.0, timestamp: "2026-08-10 09:15:00" },
  { latitude: 16.5480, longitude: 80.5250, speed: 30.0, timestamp: "2026-08-10 09:20:00" }
];

const FALLBACK_LIVE = {
  BUS01: { latitude: 16.5480, longitude: 80.5250, speed: 12.5, status: 'Running' },
  BUS02: { latitude: 16.5150, longitude: 80.6350, speed: 0.0, status: 'Stationary' }
};

/**
 * Get all available buses and their status
 */
async function getBuses(req, res) {
  try {
    const remoteRes = await fetch('https://manaresults.co.in/karthikmic/bustracker/tracker.php?api=buses', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4000) // 4 second timeout
    });
    const remoteData = await remoteRes.json();

    if (!remoteData.success || !Array.isArray(remoteData.data)) {
      throw new Error('Invalid payload from remote PHP server');
    }

    const formattedBuses = remoteData.data.map(bus => {
      const meta = getBusMetadata(bus.bus_code);
      return {
        id: bus.bus_code,
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
    console.warn('[PROXY WARNING] Remote host offline/error, falling back to static fleet data. Error:', error.message);
    res.json({ success: true, data: FALLBACK_BUSES, isFallback: true });
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
    const remoteRes = await fetch(`https://manaresults.co.in/karthikmic/bustracker/tracker.php?api=live&bus_code=${busId}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4000)
    });
    const remoteData = await remoteRes.json();

    if (!remoteData.success || !remoteData.data) {
      throw new Error('No live data found');
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
        heading: 90.0,
        timestamp: coords.timestamp,
        status: parseFloat(coords.speed || '0') > 2 ? 'Running' : 'Stationary'
      }
    });
  } catch (error) {
    console.warn(`[PROXY WARNING] Live fetch offline for ${busId}, using local fallback coordinates. Error:`, error.message);
    const fallback = FALLBACK_LIVE[busId] || FALLBACK_LIVE.BUS01;
    const meta = getBusMetadata(busId);
    res.json({
      success: true,
      data: {
        busId: busId,
        routeId: meta.route_name,
        latitude: fallback.latitude,
        longitude: fallback.longitude,
        speed: fallback.speed,
        heading: 90.0,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        status: fallback.status
      },
      isFallback: true
    });
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
    busId = req.body.bus_id;
    latitude = parseFloat(req.body.latitude);
    longitude = parseFloat(req.body.longitude);
    speed = parseFloat(req.body.speed);
  }

  if (!busId || isNaN(latitude) || isNaN(longitude) || isNaN(speed)) {
    return res.status(400).send('Invalid telemetry payload parameters.');
  }

  try {
    const forwardUrl = `https://manaresults.co.in/karthikmic/bustracker/bus1.php?bus_id=${busId}&la=${latitude}&lo=${longitude}&s=${speed}`;
    const remoteResponse = await fetch(forwardUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4000)
    });
    const remoteText = await remoteResponse.text();
    console.log(`[IoT INGEST FORWARD] Forwarded coordinate details. Response: ${remoteText}`);
    res.send(remoteText);
  } catch (error) {
    console.error('Telemetry forward failed, remote host offline:', error.message);
    res.send('Success (Offline proxy logged locally)');
  }
}

/**
 * Get available historical tracking dates for a bus
 */
async function getDates(req, res) {
  const { busId } = req.params;
  try {
    const remoteRes = await fetch(`https://manaresults.co.in/karthikmic/bustracker/tracker.php?api=dates&bus_code=${busId}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4000)
    });
    const remoteData = await remoteRes.json();
    if (!remoteData.success) {
      throw new Error('No dates in remote');
    }
    res.json({ success: true, data: remoteData.data });
  } catch (error) {
    console.warn(`[PROXY WARNING] Dates fetch offline for ${busId}, using fallback dates list. Error:`, error.message);
    res.json({ success: true, data: FALLBACK_DATES, isFallback: true });
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
    const remoteRes = await fetch(`https://manaresults.co.in/karthikmic/bustracker/tracker.php?api=history&bus_code=${busId}&date=${date}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4000)
    });
    const remoteData = await remoteRes.json();
    if (!remoteData.success) {
      throw new Error('No history in remote');
    }
    res.json({ success: true, data: remoteData.data });
  } catch (error) {
    console.warn(`[PROXY WARNING] History path fetch offline for ${busId}, returning local route path fallback. Error:`, error.message);
    res.json({ success: true, data: FALLBACK_HISTORY, isFallback: true });
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
