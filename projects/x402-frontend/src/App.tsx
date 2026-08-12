import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from './context/WalletContext';
import { BusList } from './components/BusList';
import type { Bus } from './components/BusList';
import { PaymentModal } from './components/PaymentModal';
import { TrackingMap } from './components/TrackingMap';

const APP_ID = 769018036; // Updated smart contract App ID
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export const App: React.FC = () => {
  const {
    address,
    balance,
    isConnected,
    network,
    connectWallet,
    disconnectWallet,
    recordUserActivityOnChain
  } = useWallet();

  // State Management
  const [buses, setBuses] = useState<Bus[]>([]);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [activeBusId, setActiveBusId] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<{
    latitude: number;
    longitude: number;
    speed: number;
    timestamp: string;
    status: string;
  } | null>(null);

  // Tracking Access state
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [activeTxId, setActiveTxId] = useState<string>('');
  const [accessDurationSeconds, setAccessDurationSeconds] = useState<number>(0);
  const [remainingTimeSeconds, setRemainingTimeSeconds] = useState<number>(0);
  const [accessExpired, setAccessExpired] = useState<boolean>(false);

  // Modals & UI States
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isLoadingBuses, setIsLoadingBuses] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollCountdown, setPollCountdown] = useState<number>(10);
  const [recipientAddress, setRecipientAddress] = useState<string>('');

  // History Tracking Mode States
  const [trackingMode, setTrackingMode] = useState<'live' | 'history'>('live');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [historyPath, setHistoryPath] = useState<any[]>([]);
  const [isLoadingDates, setIsLoadingDates] = useState<boolean>(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState<boolean>(false);

  // Refs for timers using any type to avoid NodeJS namespace issues in browser
  const pollTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);

  // Fetch available buses on load
  useEffect(() => {
    fetchBuses();
  }, []);

  const fetchBuses = () => {
    setIsLoadingBuses(true);
    fetch(`${BACKEND_URL}/api/buses`)
      .then(res => res.json())
      .then(resData => {
        if (resData.success) {
          setBuses(resData.data);
        } else {
          setErrorMessage('Failed to load buses from backend');
        }
      })
      .catch(err => {
        console.error(err);
        setErrorMessage('Cannot reach backend server. Make sure x402-backend is running.');
      })
      .finally(() => {
        setIsLoadingBuses(false);
      });
  };

  // Record login activity on-chain when wallet is connected
  useEffect(() => {
    if (isConnected && address) {
      const sessionLogged = sessionStorage.getItem('login_logged_onchain');
      if (!sessionLogged) {
        console.log('Wallet connected. Prompting for on-chain session logging...');
        recordUserActivityOnChain('login', '')
          .then(txId => {
            console.log('Wallet session logged on-chain successfully. Tx ID:', txId);
            sessionStorage.setItem('login_logged_onchain', 'true');
          })
          .catch(err => {
            console.error('On-chain login logging failed/cancelled:', err);
          });
      }
    } else {
      sessionStorage.removeItem('login_logged_onchain');
    }
  }, [isConnected, address]);

  // Remaining access countdown timer (1s interval)
  useEffect(() => {
    if (hasAccess && remainingTimeSeconds > 0 && trackingMode === 'live') {
      countdownTimerRef.current = setInterval(() => {
        setRemainingTimeSeconds(prev => {
          if (prev <= 1) {
            setHasAccess(false);
            setAccessExpired(true);
            setLiveData(null);
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [hasAccess, remainingTimeSeconds, trackingMode]);

  // Polling loop for live GPS data (10s interval)
  useEffect(() => {
    if (hasAccess && activeBusId && activeTxId && address && trackingMode === 'live') {
      // Immediate fetch
      fetchLiveLocation();
      
      // Start polling
      pollTimerRef.current = setInterval(() => {
        fetchLiveLocation();
      }, 10000);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [hasAccess, activeBusId, activeTxId, address, trackingMode]);

  // Visual countdown for polling refresh
  useEffect(() => {
    let interval: any;
    if (hasAccess && trackingMode === 'live') {
      setPollCountdown(10);
      interval = setInterval(() => {
        setPollCountdown(prev => {
          if (prev <= 1) return 10;
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [hasAccess, liveData, trackingMode]);

  // Fetch live location coordinates from gated endpoint
  const fetchLiveLocation = () => {
    if (!activeBusId || !address || !activeTxId) return;

    fetch(`${BACKEND_URL}/api/buses/${activeBusId}/live?duration=${accessDurationSeconds / 60}`, {
      headers: {
        'Wallet-Address': address,
        'Payment-Signature': activeTxId
      }
    })
      .then(async (res) => {
        const data = await res.json();
        
        if (res.status === 200) {
          setLiveData(data.data);
          setErrorMessage(null);
        } else if (res.status === 402) {
          // Payment required / Signature rejected
          setHasAccess(false);
          setErrorMessage(data.error || 'Payment required.');
        } else if (res.status === 403) {
          // Expired on backend
          setHasAccess(false);
          setAccessExpired(true);
          setLiveData(null);
          setErrorMessage('Tracking authorization has expired.');
        } else {
          setErrorMessage(data.error || 'Failed to fetch tracking data.');
        }
      })
      .catch(err => {
        console.error(err);
        setErrorMessage('Failed to connect to tracking API.');
      });
  };

  // Fetch available dates for a selected bus in History Mode
  const fetchHistoryDates = (busId: string) => {
    setIsLoadingDates(true);
    setErrorMessage(null);
    fetch(`${BACKEND_URL}/api/buses/${busId}/dates`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setAvailableDates(data.data);
          if (data.data.length > 0) {
            setSelectedDate(data.data[0]); // Default to latest date
          } else {
            setSelectedDate('');
          }
        } else {
          setAvailableDates([]);
          setSelectedDate('');
          setErrorMessage('No historical date records found for this vehicle.');
        }
      })
      .catch(err => {
        console.error(err);
        setAvailableDates([]);
        setErrorMessage('Failed to fetch history dates from server.');
      })
      .finally(() => {
        setIsLoadingDates(false);
      });
  };

  // Fetch historical coordinates (Gated by on-chain logging signature)
  const fetchHistoryRoute = async () => {
    if (!selectedBus || !selectedDate) return;
    setIsFetchingHistory(true);
    setErrorMessage(null);
    setHasAccess(false);
    setLiveData(null);

    try {
      // 1. Submit zero-ALGO transaction calling record_user_activity for history viewing
      console.log(`Submitting history query log on-chain for ${selectedBus.id}...`);
      const txId = await recordUserActivityOnChain('history', selectedBus.id);
      console.log('History query logged on-chain successfully. Tx ID:', txId);

      // 2. Fetch coordinates from proxy backend
      const response = await fetch(`${BACKEND_URL}/api/buses/${selectedBus.id}/history?date=${selectedDate}`);
      const data = await response.json();
      
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        setHistoryPath(data.data);
        
        // Mimic data structure to trigger Map activation
        setLiveData({
          latitude: data.data[0].latitude,
          longitude: data.data[0].longitude,
          speed: 0.0,
          timestamp: data.data[0].timestamp,
          status: 'Stationary'
        });
        setActiveBusId(selectedBus.id);
        setHasAccess(true);
      } else {
        setHistoryPath([]);
        setErrorMessage('No route coordinates found for the selected date.');
      }
    } catch (err) {
      console.error(err);
      setHistoryPath([]);
      setErrorMessage((err as Error).message || 'Failed to complete on-chain activity logging.');
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleSelectBus = (bus: Bus) => {
    if (!isConnected || !address) {
      alert('Please connect your Algorand wallet first.');
      return;
    }
    setSelectedBus(bus);
    
    // In History Mode, load dates directly (bypassing pay-per-track flow)
    if (trackingMode === 'history') {
      fetchHistoryDates(bus.id);
      return;
    }

    // Check if we already have active access for this specific bus in Live Mode
    if (activeBusId === bus.id && hasAccess) {
      // Do nothing, already tracking
      return;
    }

    // Dynamic discovery of payment requirements
    fetch(`${BACKEND_URL}/api/buses/${bus.id}/live?wallet=${address}`)
      .then(res => {
        if (res.status === 402) {
          return res.json();
        }
        throw new Error('Unexpected status code: ' + res.status);
      })
      .then(data => {
        if (data.requirements && data.requirements.recipient) {
          setRecipientAddress(data.requirements.recipient);
        } else {
          // Fallback to Testnet contract address
          setRecipientAddress('CSIXLHKTIVG2XOASFE2RE22JBMFOCYRSVTSIJWZ3R3WQS5KZ4SD7QS6EXA');
        }
        setIsPaymentModalOpen(true);
      })
      .catch(err => {
        console.error('Error fetching requirements:', err);
        setRecipientAddress('CSIXLHKTIVG2XOASFE2RE22JBMFOCYRSVTSIJWZ3R3WQS5KZ4SD7QS6EXA');
        setIsPaymentModalOpen(true);
      });
  };

  const handlePaymentSuccess = (durationSeconds: number, txId: string) => {
    if (!selectedBus) return;
    
    setHistoryPath([]); // Clear history when starting a live session
    setActiveBusId(selectedBus.id);
    setActiveTxId(txId);
    setAccessDurationSeconds(durationSeconds);
    setRemainingTimeSeconds(durationSeconds);
    setHasAccess(true);
    setAccessExpired(false);
    setErrorMessage(null);
  };

  // Format countdown string MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#07080f] text-slate-100 flex flex-col font-sans">
      {/* HEADER */}
      <header className="border-b border-[#1b1f3c] bg-[#0c0e1b]/90 backdrop-blur-md px-6 py-4 sticky top-0 z-[1100] flex justify-between items-center shadow-lg shadow-black/15">
        <div className="flex items-center gap-3">
          <span className="text-3xl text-indigo-500">🚌</span>
          <div>
            <h1 className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-400 to-indigo-600 bg-clip-text text-transparent">
              SmartTransitX
            </h1>
            <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Decentralized mobility</p>
          </div>
        </div>

        {/* Network & Mode Selector */}
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 bg-dark-900/60 border border-[#1b1f3c] px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-400">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            {network.toUpperCase()}
          </span>

          {isConnected ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-slate-400 font-medium">Balance</p>
                <p className="text-sm font-extrabold glow-green font-mono">{balance.toFixed(2)} ALGO</p>
              </div>
              <button
                onClick={disconnectWallet}
                className="bg-[#1e223d] hover:bg-[#282d52] border border-[#2a2f58] text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              className="bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-bold px-5 py-2.5 rounded-xl shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col md:flex-row h-[calc(100vh-73px)] overflow-hidden">
        {/* SIDEBAR - Shown only when wallet is connected */}
        {isConnected && (
          <aside className="w-full md:w-[380px] bg-[#0c0d18] border-r border-[#1b1f3c] flex flex-col p-6 overflow-y-auto shrink-0">
            
            {/* User Account Widget */}
            <div className="card-glass rounded-2xl p-4 mb-6">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">CONNECTED WALLET</div>
              <div className="font-mono text-xs text-slate-300 truncate select-all">{address}</div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#1e233d]">
                <span className="text-xs text-slate-400 font-medium">Network Balance</span>
                <span className="text-sm font-bold glow-green font-mono">{balance.toFixed(2)} ALGO</span>
              </div>
            </div>

            {/* Mode Selector */}
            <div className="card-glass rounded-2xl p-4 mb-6">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">TRACKING MODE</div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTrackingMode('live');
                    setHistoryPath([]);
                    setHasAccess(false);
                    setLiveData(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    trackingMode === 'live'
                      ? 'bg-indigo-600 text-slate-100 shadow-md shadow-indigo-600/30'
                      : 'bg-[#181a30] hover:bg-[#202342] text-slate-400'
                  }`}
                >
                  Live Tracking
                </button>
                <button
                  onClick={() => {
                    setTrackingMode('history');
                    setHasAccess(false);
                    setLiveData(null);
                    if (selectedBus) {
                      fetchHistoryDates(selectedBus.id);
                    }
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    trackingMode === 'history'
                      ? 'bg-indigo-600 text-slate-100 shadow-md shadow-indigo-600/30'
                      : 'bg-[#181a30] hover:bg-[#202342] text-slate-400'
                  }`}
                >
                  Route History
                </button>
              </div>

              {trackingMode === 'history' && selectedBus && (
                <div className="mt-4 pt-3 border-t border-[#1e233d] space-y-3">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">CHOOSE DATE</label>
                  {isLoadingDates ? (
                    <div className="flex items-center gap-2 py-1">
                      <span className="w-4 h-4 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin"></span>
                      <span className="text-xs text-slate-500">Loading history dates...</span>
                    </div>
                  ) : availableDates.length > 0 ? (
                    <div className="flex flex-col gap-2.5">
                      <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full bg-[#0d0f1e] border border-[#1e233d] rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">Select a Date</option>
                        {availableDates.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <button
                        onClick={fetchHistoryRoute}
                        disabled={!selectedDate || isFetchingHistory}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-dark-700 disabled:text-slate-500 text-slate-100 font-bold py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer"
                      >
                        {isFetchingHistory ? 'Loading history...' : 'View Route History'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-500 font-bold">No history records found for this vehicle.</p>
                  )}
                </div>
              )}
            </div>

            {/* Bus List */}
            {isLoadingBuses ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <span className="w-8 h-8 border-4 border-slate-600 border-t-indigo-500 rounded-full animate-spin mb-3"></span>
                <p className="text-xs">Connecting to SmartTransitX fleet...</p>
              </div>
            ) : (
              <BusList
                buses={buses}
                activeBusId={activeBusId}
                hasAccess={hasAccess}
                onSelectBus={handleSelectBus}
                isConnecting={!isConnected}
              />
            )}

            {/* Fallback error container */}
            {errorMessage && (
              <div className="mt-6 bg-rose-950/20 border border-rose-800/30 rounded-xl p-3 text-rose-400 text-xs">
                {errorMessage}
              </div>
            )}
          </aside>
        )}

        {/* MAP & TRACKING PANEL AREA */}
        <section className="flex-1 flex flex-col bg-[#05060b] p-6 overflow-hidden relative">
          
          {hasAccess && activeBusId && liveData ? (
            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
              
              {/* Active Tracking Status Bar */}
              <div className="card-glass rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-lg shadow-black/10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-2xl">
                    {trackingMode === 'live' ? '🚍' : '📅'}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-200">
                      {trackingMode === 'live' ? 'Tracking BUS-' : 'History for BUS-'}
                      {buses.find(b => b.id === activeBusId)?.bus_number || activeBusId}
                    </h2>
                    <p className="text-xs text-slate-400">{buses.find(b => b.id === activeBusId)?.route_name}</p>
                  </div>
                </div>

                {/* Expiry Widget & countdown */}
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  {trackingMode === 'live' ? (
                    <div className="bg-[#080913] border border-[#1e233d] rounded-xl px-4 py-2 flex-1 sm:flex-initial text-center sm:text-right">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">TRACKING TIME LEFT</div>
                      <div className="text-lg font-black glow-amber font-mono">
                        {formatTime(remainingTimeSeconds)}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#080913] border border-[#1e233d] rounded-xl px-4 py-2 flex-1 sm:flex-initial text-center sm:text-right">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">RECORDED DATE</div>
                      <div className="text-sm font-black glow-indigo font-mono">
                        {selectedDate}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setHasAccess(false);
                      setLiveData(null);
                      setHistoryPath([]);
                    }}
                    className="bg-[#1e223d] hover:bg-[#282d52] border border-[#2a2f58] text-slate-300 text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                  >
                    Clear Map
                  </button>
                </div>
              </div>

              {/* Map & Live Stats */}
              <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
                <div className="flex-1 relative min-h-[300px]">
                  <TrackingMap
                    latitude={liveData.latitude}
                    longitude={liveData.longitude}
                    speed={liveData.speed}
                    routeName={buses.find(b => b.id === activeBusId)?.route_name || ''}
                    destination={buses.find(b => b.id === activeBusId)?.destination || ''}
                    historyPath={historyPath.length > 0 ? historyPath : undefined}
                    selectedDate={selectedDate}
                  />
                </div>

                {/* Right side stats widget */}
                <div className="w-full lg:w-[280px] grid grid-cols-2 lg:grid-cols-1 gap-4 overflow-y-auto shrink-0">
                  
                  {/* Speed / Points Widget */}
                  {trackingMode === 'live' ? (
                    <div className="card-glass rounded-2xl p-5 text-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">VEHICLE SPEED</span>
                      <div className={`text-4xl font-black mt-2 ${liveData.speed > 2 ? 'glow-green' : 'glow-amber'}`}>
                        {liveData.speed.toFixed(1)}
                      </div>
                      <span className="text-xs text-slate-400">km/h</span>
                    </div>
                  ) : (
                    <div className="card-glass rounded-2xl p-5 text-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ROUTE NODES</span>
                      <div className="text-4xl font-black mt-2 glow-indigo font-mono">
                        {historyPath.length}
                      </div>
                      <span className="text-xs text-slate-400">Recorded GPS points</span>
                    </div>
                  )}

                  {/* Lat Lng / Timeline info */}
                  <div className="card-glass rounded-2xl p-4 flex flex-col justify-between">
                    {trackingMode === 'live' ? (
                      <>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">COORDINATES</span>
                          <div className="text-xs font-mono space-y-1 text-slate-300">
                            <p>LAT: <span className="glow-cyan font-bold">{liveData.latitude.toFixed(6)}</span></p>
                            <p>LNG: <span className="glow-cyan font-bold">{liveData.longitude.toFixed(6)}</span></p>
                          </div>
                        </div>
                        
                        <div className="text-[10px] text-slate-400 mt-3 pt-3 border-t border-[#1e233d] flex justify-between items-center">
                          <span>REFRESHING IN</span>
                          <span className="font-mono glow-indigo font-bold">{pollCountdown}s</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">TIMELINE WINDOW</span>
                          <div className="text-xs space-y-1 text-slate-300 font-mono">
                            <p>START: <span className="glow-indigo font-bold">{historyPath[0]?.timestamp.split(' ')[1] || '00:00'}</span></p>
                            <p>END: <span className="glow-indigo font-bold">{historyPath[historyPath.length - 1]?.timestamp.split(' ')[1] || '00:00'}</span></p>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-3 pt-3 border-t border-[#1e233d] flex justify-between items-center">
                          <span>MODE</span>
                          <span className="glow-indigo font-bold">HISTORY PLAYBACK</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Transaction verification / Data source widget */}
                  <div className="card-glass rounded-2xl p-4 col-span-2 lg:col-span-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">
                      {trackingMode === 'live' ? 'BLOCKCHAIN AUTH' : 'DATA ACCESSIBILITY'}
                    </span>
                    {trackingMode === 'live' ? (
                      <div className="text-xs space-y-1 text-slate-400 truncate">
                        <p><b>App ID:</b> {APP_ID || 'Not Configured'}</p>
                        <p><b>Tx ID:</b></p>
                        <p className="font-mono text-[10px] text-slate-100 glow-indigo select-all cursor-pointer">{activeTxId}</p>
                      </div>
                    ) : (
                      <div className="text-xs space-y-1 text-slate-400">
                        <p><b>Status:</b> Dynamic Local Proxy</p>
                        <p><b>Source:</b> Live PHP Server</p>
                        <p className="text-[9px] mt-1 text-slate-500">Historical traces are fetched directly from SQL tables.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          ) : (
            // WELCOME / PROTECTED INSTRUCTION SCREEN
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 card-glass rounded-2xl shadow-xl max-w-2xl mx-auto my-auto">
              <span className="text-6xl mb-6 select-none animate-bounce">
                {trackingMode === 'live' ? '📡' : '📅'}
              </span>
              
              <h2 className="text-2xl font-black text-slate-100 mb-2">
                {trackingMode === 'live' ? 'Decentralized Pay-Per-Track' : 'Route History Playback'}
              </h2>
              
              <p className="text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
                {trackingMode === 'live' 
                  ? 'Connect your Algorand wallet, choose your college bus, and pay small pay-per-track micropayments to unlock live real-time GPS telemetry.'
                  : 'Select an active college vehicle and choose a recorded date to plot and analyze its historical driving route.'
                }
              </p>

              {accessExpired && trackingMode === 'live' && (
                <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-4 text-rose-300 text-sm mb-6 max-w-md">
                  ⚠️ <b>Tracking Access Expired</b>. Your temporary tracking window has closed. Please select the bus to track again.
                </div>
              )}

              {isConnected ? (
                <div className="bg-dark-900 border border-dark-700/80 rounded-xl p-4 text-slate-300 text-xs text-left w-full max-w-sm mb-6">
                  <h4 className="font-bold text-slate-200 mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Wallet Connected
                  </h4>
                  <p className="font-mono mt-1 opacity-85 text-[10px] truncate">{address}</p>
                  <p className="mt-2 text-indigo-400 font-bold">
                    Select a bus from the fleet list below to load its {trackingMode === 'live' ? 'payment option' : 'available history dates'}.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={connectWallet}
                  className="bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-bold px-6 py-3 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  Connect Wallet to Begin
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      {/* PAYMENT MODAL */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        busId={selectedBus?.id || ''}
        busNumber={selectedBus?.bus_number || ''}
        routeName={selectedBus?.route_name || ''}
        onPaymentSuccess={handlePaymentSuccess}
        recipientAddress={recipientAddress}
      />
    </div>
  );
};
export default App;
