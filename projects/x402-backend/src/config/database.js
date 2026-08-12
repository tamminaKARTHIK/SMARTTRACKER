// Initial bus metadata mapping for real bus IDs
const BUS_METADATA = {
  'BUS01': {
    bus_number: '01',
    route_name: 'Bus 01 - Main Route',
    start_location: 'Vijayawada',
    destination: 'Kanchikacherla',
    status: 'Running'
  },
  'BUS02': {
    bus_number: '02',
    route_name: 'Bus 02 - JNTU Route',
    start_location: 'Benz Circle',
    destination: 'JNTU Kakinada',
    status: 'Idle'
  }
};

function getBusMetadata(busId) {
  if (BUS_METADATA[busId]) {
    return BUS_METADATA[busId];
  }
  const cleanNum = busId.replace(/\D/g, '');
  return {
    bus_number: cleanNum || '00',
    route_name: `Route for ${busId}`,
    start_location: 'Station',
    destination: 'College Campus',
    status: 'Running'
  };
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Check connection to the live PHP backend
async function initDb() {
  try {
    const response = await fetch('https://manaresults.co.in/karthikmic/bustracker/tracker.php?api=buses', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(3000)
    });
    if (response.status === 200) {
      console.log('Connected to live PHP API server at manaresults.co.in successfully.');
      return;
    }
    throw new Error('Server returned status: ' + response.status);
  } catch (e) {
    console.warn('Warning: Could not connect to remote PHP API. Make sure internet connection is active.', e.message);
  }
}

// Telemetry is live coming from the real IoT device, so simulation is a no-op
function startLocationSimulation() {
  console.log('[API PROXY] Telemetry pipeline reading coordinates directly from live PHP API.');
}

module.exports = {
  initDb,
  startLocationSimulation,
  getBusMetadata
};
