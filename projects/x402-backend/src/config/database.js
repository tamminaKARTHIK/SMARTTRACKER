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

// Check connection to the live PHP backend
async function initDb() {
  try {
    const response = await fetch('https://careerinedu.com/tracker/bustracker/tracker.php?api=buses');
    if (response.status === 200) {
      console.log('Connected to live PHP API server at careerinedu.com successfully.');
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
