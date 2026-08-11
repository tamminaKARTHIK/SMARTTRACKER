import React, { createContext, useContext, useState, useEffect } from 'react';
import { PeraWalletConnect } from '@perawallet/connect';
import algosdk from 'algosdk';

const peraWallet = new PeraWalletConnect({
  shouldShowSignTxnToast: true
});

interface WalletContextType {
  address: string | null;
  balance: number;
  isConnected: boolean;
  network: 'testnet';
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  sendPayment: (amountMicroAlgos: number, recipient: string, busId: string, routeId: string, durationSeconds: number) => Promise<string>;
  recordUserActivityOnChain: (activityType: string, busId: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const ALGOD_SERVER = 'https://testnet-api.algonode.cloud';
const ALGOD_PORT = '443';
const ALGOD_TOKEN = '';
const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

const APP_ID = 769018036; // Updated smart contract App ID with record_user_activity

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const network = 'testnet';

  // Auto-connect on load
  useEffect(() => {
    peraWallet.reconnectSession().then((accounts) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
        fetchBalance(accounts[0]);
      }
    }).catch(err => {
      console.log('Pera Wallet reconnect error:', err);
    });
  }, []);

  // Fetch real balance from Testnet
  const fetchBalance = async (walletAddress: string) => {
    try {
      const accountInfo = await algodClient.accountInformation(walletAddress).do();
      const microAlgos = accountInfo.amount;
      setBalance(Number(microAlgos) / 1_000_000);
    } catch (e) {
      console.error('Error fetching balance:', e);
      setBalance(0.00);
    }
  };

  const connectWallet = async () => {
    try {
      const accounts = await peraWallet.connect();
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
        fetchBalance(accounts[0]);
      }
    } catch (error) {
      console.error('Pera Wallet connection error:', error);
      alert('Failed to connect to Pera Wallet: ' + (error as Error).message);
    }
  };

  const disconnectWallet = () => {
    peraWallet.disconnect();
    setAddress(null);
    setBalance(0);
    setIsConnected(false);
  };

  // Perform payment and call create_tracking_access on the smart contract
  const sendPayment = async (
    amountMicroAlgos: number, 
    recipient: string, 
    busId: string, 
    routeId: string, 
    durationSeconds: number
  ): Promise<string> => {
    if (!address) throw new Error('Wallet not connected');

    try {
      const suggestedParams = await algodClient.getTransactionParams().do();
      
      // 1. Build payment transaction to the contract address
      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: address,
        receiver: recipient,
        amount: amountMicroAlgos,
        suggestedParams
      });

      // 2. Define the ABI method description
      const method = new algosdk.ABIMethod({
        name: 'create_tracking_access',
        args: [
          { type: 'pay', name: 'pay_txn' },
          { type: 'byte[]', name: 'bus_id' },
          { type: 'byte[]', name: 'route_id' },
          { type: 'uint64', name: 'duration_seconds' }
        ],
        returns: { type: 'void' }
      });

      // 3. Compute box references
      const userBytes = algosdk.decodeAddress(address).publicKey;
      const busBytes = new TextEncoder().encode(busId);
      const routeBytes = new TextEncoder().encode(routeId);

      // exp box key
      const expPrefix = new TextEncoder().encode("exp");
      const boxKeyExpiry = new Uint8Array(expPrefix.length + userBytes.length + busBytes.length);
      boxKeyExpiry.set(expPrefix);
      boxKeyExpiry.set(userBytes, expPrefix.length);
      boxKeyExpiry.set(busBytes, expPrefix.length + userBytes.length);

      // start box key
      const startPrefix = new TextEncoder().encode("start");
      const boxKeyStart = new Uint8Array(startPrefix.length + userBytes.length + busBytes.length);
      boxKeyStart.set(startPrefix);
      boxKeyStart.set(userBytes, startPrefix.length);
      boxKeyStart.set(busBytes, startPrefix.length + userBytes.length);

      // route box key
      const routePrefix = new TextEncoder().encode("route");
      const boxKeyRoute = new Uint8Array(routePrefix.length + userBytes.length + busBytes.length);
      boxKeyRoute.set(routePrefix);
      boxKeyRoute.set(userBytes, routePrefix.length);
      boxKeyRoute.set(busBytes, routePrefix.length + userBytes.length);

      const boxReferences = [
        { appIndex: 0, name: boxKeyExpiry },
        { appIndex: 0, name: boxKeyStart },
        { appIndex: 0, name: boxKeyRoute }
      ];

      // 4. Construct Pera Wallet Signer Wrapper for AtomicTransactionComposer (ATC)
      const peraSigner = async (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => {
        const txGroupForPera = txnGroup.map((txn, index) => {
          const isToSign = indexesToSign.includes(index);
          return {
            txn,
            signers: isToSign ? [address] : []
          };
        });
        const signedResult = await peraWallet.signTransaction([txGroupForPera]);
        return signedResult;
      };

      // 5. Initialize AtomicTransactionComposer (ATC)
      const atc = new algosdk.AtomicTransactionComposer();
      
      atc.addMethodCall({
        appID: APP_ID,
        method: method,
        methodArgs: [
          { txn: paymentTxn, signer: peraSigner },
          busBytes,
          routeBytes,
          BigInt(durationSeconds)
        ],
        sender: address,
        suggestedParams,
        signer: peraSigner,
        boxes: boxReferences
      });

      // 6. Execute transactions
      const executeResult = await atc.execute(algodClient, 4);
      
      // Refresh balance
      fetchBalance(address);
      
      // Return the transaction ID of the payment txn (first transaction in group)
      return executeResult.txIDs[0];
    } catch (error) {
      console.error('Payment signing failed:', error);
      throw new Error('Transaction rejected by user or network: ' + (error as Error).message);
    }
  };

  // Log user activity (login / history access) on-chain
  const recordUserActivityOnChain = async (activityType: string, busId: string): Promise<string> => {
    if (!address) throw new Error('Wallet not connected');

    try {
      const suggestedParams = await algodClient.getTransactionParams().do();

      // Define the ABI method description
      const method = new algosdk.ABIMethod({
        name: 'record_user_activity',
        args: [
          { type: 'byte[]', name: 'activity_type' },
          { type: 'byte[]', name: 'bus_id' }
        ],
        returns: { type: 'void' }
      });

      const userBytes = algosdk.decodeAddress(address).publicKey;
      const activityBytes = new TextEncoder().encode(activityType);
      const busBytes = new TextEncoder().encode(busId);

      // Key is: prefix "act" + userBytes + activityTypeBytes
      const prefixBytes = new TextEncoder().encode("act");
      const boxKey = new Uint8Array(prefixBytes.length + userBytes.length + activityBytes.length);
      boxKey.set(prefixBytes);
      boxKey.set(userBytes, prefixBytes.length);
      boxKey.set(activityBytes, prefixBytes.length + userBytes.length);

      const boxReferences = [
        { appIndex: 0, name: boxKey }
      ];

      const peraSigner = async (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => {
        const txGroupForPera = txnGroup.map((txn, index) => {
          const isToSign = indexesToSign.includes(index);
          return {
            txn,
            signers: isToSign ? [address] : []
          };
        });
        const signedResult = await peraWallet.signTransaction([txGroupForPera]);
        return signedResult;
      };

      const atc = new algosdk.AtomicTransactionComposer();
      
      atc.addMethodCall({
        appID: APP_ID,
        method: method,
        methodArgs: [
          activityBytes,
          busBytes
        ],
        sender: address,
        suggestedParams,
        signer: peraSigner,
        boxes: boxReferences
      });

      const executeResult = await atc.execute(algodClient, 4);
      return executeResult.txIDs[0];
    } catch (error) {
      console.error('Logging activity on-chain failed:', error);
      throw new Error('Failed to record activity on-chain: ' + (error as Error).message);
    }
  };

  return (
    <WalletContext.Provider value={{
      address,
      balance,
      isConnected,
      network,
      connectWallet,
      disconnectWallet,
      sendPayment,
      recordUserActivityOnChain
    }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
