const algosdk = require('algosdk');

// Load environment variables
const ALGOD_SERVER = process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud';
const ALGOD_PORT = process.env.ALGOD_PORT || '443';
const ALGOD_TOKEN = process.env.ALGOD_TOKEN || '';
const APP_ID = parseInt(process.env.APP_ID || '0', 10);
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS || 'MOCK_CONTRACT_ADDRESS_PLACEHOLDER';

const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

/**
 * x402 Middleware to protect premium endpoints
 * Returns 402 Payment Required if access is not authorized.
 * Returns 403 Forbidden if access has expired.
 */
async function x402Middleware(req, res, next) {
  const busId = req.params.busId || req.query.bus_id || 'BUS-17';
  const walletAddress = req.header('Wallet-Address') || req.query.wallet;
  const paymentSignature = req.header('Payment-Signature') || req.query.signature;

  if (!walletAddress) {
    return res.status(402).json({
      error: 'Wallet address required. Payment required to access live tracking data.',
      requirements
    });
  }

  // Fetch duration and pricing to build requirements
  const durationMinutes = parseInt(req.query.duration || '30', 10);
  let priceAlgo = 0.15; // default 30 mins
  if (durationMinutes <= 15) {
    priceAlgo = 0.10;
  } else if (durationMinutes <= 30) {
    priceAlgo = 0.15;
  } else {
    priceAlgo = 0.25;
  }

  const priceMicroAlgos = Math.round(priceAlgo * 1_000_000);

  // Requirements payload
  const requirements = {
    price: priceMicroAlgos,
    recipient: RECEIVER_ADDRESS,
    network: 'algorand:testnet',
    appId: APP_ID,
    busId: busId,
    durationSeconds: durationMinutes * 60
  };

  const requirementsBase64 = Buffer.from(JSON.stringify(requirements)).toString('base64');

  // Set x402 headers
  res.setHeader('Access-Control-Expose-Headers', 'Payment-Required');
  res.setHeader('Payment-Required', requirementsBase64);

  // 1. Check if payment signature exists
  if (!paymentSignature) {
    return res.status(402).json({
      error: 'Payment required to access live tracking data.',
      requirements
    });
  }

  // Real Mode: Query Box Storage on Algorand
  try {
    if (APP_ID === 0) {
      return res.status(500).json({ error: 'Algorand Smart Contract App ID is not configured.' });
    }

    // Decode user address to public key bytes
    const decodedUser = algosdk.decodeAddress(walletAddress);
    const userBytes = decodedUser.publicKey;

    // Convert busId to bytes
    const busBytes = Buffer.from(busId, 'utf-8');

    // Box key is: prefix b"exp" + userBytes + busBytes
    const prefixBytes = Buffer.from('exp', 'utf-8');
    const boxKey = Buffer.concat([prefixBytes, userBytes, busBytes]);

    // Query box value from Algod node
    const boxResponse = await algodClient.getApplicationBoxByName(APP_ID, new Uint8Array(boxKey)).do();
    
    // Box value is UInt64 (8 bytes big-endian)
    const expiryTimestamp = Buffer.from(boxResponse.value).readBigUInt64BE();
    const currentBlockTime = BigInt(Math.floor(Date.now() / 1000));

    if (currentBlockTime < expiryTimestamp) {
      return next();
    } else {
      return res.status(403).json({
        error: 'Tracking access expired.',
        code: 'TRACKING_ACCESS_EXPIRED'
      });
    }
  } catch (error) {
    console.error('Algorand box verification failed:', error);
    
    // If box does not exist, return 402 or 403
    if (error.status === 404 || error.message.includes('not found')) {
      return res.status(402).json({
        error: 'No active tracking authorization found on-chain. Please make a payment.',
        requirements
      });
    }
    
    return res.status(500).json({ error: 'Failed to verify payment status on-chain: ' + error.message });
  }
}

module.exports = {
  x402Middleware
};
