import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

interface PricingTier {
  duration_minutes: number;
  price_algo: number;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  busId: string;
  busNumber: string;
  routeName: string;
  onPaymentSuccess: (durationSeconds: number, txId: string) => void;
  recipientAddress: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  busId,
  busNumber,
  routeName,
  onPaymentSuccess,
  recipientAddress
}) => {
  const { sendPayment } = useWallet();
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<PricingTier | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch pricing configuration dynamically from backend
  useEffect(() => {
    if (!isOpen) return;

    fetch(`${BACKEND_URL}/api/pricing`)
      .then(res => res.json())
      .then(resData => {
        if (resData.success && resData.data.length > 0) {
          setPricingTiers(resData.data);
          setSelectedTier(resData.data[1] || resData.data[0]); // default to 30 mins
        } else {
          // Fallbacks if backend pricing is unavailable
          const fallbacks = [
            { duration_minutes: 15, price_algo: 0.10 },
            { duration_minutes: 30, price_algo: 0.15 },
            { duration_minutes: 60, price_algo: 0.25 }
          ];
          setPricingTiers(fallbacks);
          setSelectedTier(fallbacks[1]);
        }
      })
      .catch(err => {
        console.error('Failed to load pricing:', err);
        const fallbacks = [
          { duration_minutes: 15, price_algo: 0.10 },
          { duration_minutes: 30, price_algo: 0.15 },
          { duration_minutes: 60, price_algo: 0.25 }
        ];
        setPricingTiers(fallbacks);
        setSelectedTier(fallbacks[1]);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePayAndTrack = async () => {
    if (!selectedTier) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Confirm the payment request in your Pera Wallet...');

    try {
      const priceMicroAlgos = Math.round(selectedTier.price_algo * 1_000_000);
      const durationSeconds = selectedTier.duration_minutes * 60;
      
      // Perform on-chain payment
      const txId = await sendPayment(
        priceMicroAlgos,
        recipientAddress, // Deployed contract recipient address
        busId,
        routeName,
        durationSeconds
      );

      setStatusMessage('Payment verified on-chain! Opening live GPS tracking...');
      setTimeout(() => {
        setIsProcessing(false);
        onPaymentSuccess(durationSeconds, txId);
        onClose();
      }, 1000);
    } catch (err) {
      console.error(err);
      setErrorMessage((err as Error).message || 'Transaction was canceled or rejected.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden transition-all">
        {/* Decorative backdrop */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-2">
          <span>🚍</span> Pay to Track Bus
        </h2>
        
        <p className="text-slate-400 text-sm mb-4">
          You are purchasing temporary, pay-per-use access to live GPS tracking for this bus.
        </p>

        {/* Bus Summary */}
        <div className="bg-dark-900 border border-dark-700/50 rounded-xl p-4 mb-5">
          <div className="text-xs text-indigo-400 font-semibold tracking-wider uppercase mb-1">SELECTED VEHICLE</div>
          <div className="text-lg font-bold text-slate-200">BUS-{busNumber}</div>
          <div className="text-sm text-slate-400 mt-0.5">{routeName}</div>
        </div>

        {/* Duration Selection */}
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Duration</label>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {pricingTiers.map((tier) => {
            const isSelected = selectedTier?.duration_minutes === tier.duration_minutes;
            return (
              <button
                key={tier.duration_minutes}
                type="button"
                disabled={isProcessing}
                onClick={() => setSelectedTier(tier)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10 text-slate-100'
                    : 'border-dark-700 bg-dark-900 text-slate-400 hover:border-dark-600'
                }`}
              >
                <span className="text-lg font-bold">{tier.duration_minutes}m</span>
                <span className="text-xs mt-1 text-indigo-400 font-medium">{tier.price_algo.toFixed(2)} ALGO</span>
              </button>
            );
          })}
        </div>

        {/* Status / Errors */}
        {isProcessing && (
          <div className="flex items-center gap-3 bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3 text-indigo-300 text-xs mb-5 animate-pulse">
            <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-950/40 border border-rose-800/40 rounded-xl p-3 text-rose-300 text-xs mb-5">
            <p className="font-semibold mb-0.5">⚠️ Payment Failed</p>
            <p className="opacity-90">{errorMessage}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-dark-700 bg-dark-900 text-slate-300 hover:bg-dark-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          
          <button
            type="button"
            disabled={isProcessing || !selectedTier}
            onClick={handlePayAndTrack}
            className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            Pay &amp; Track
          </button>
        </div>
      </div>
    </div>
  );
};
