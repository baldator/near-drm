import React, { useEffect, useState } from 'react';
import {
  initNear,
  initContract,
  initWalletSelector,
  signOut,
  getAccountId,
  isSignedIn,
  getModal,
  onAccountChange,
} from '../services/contract';

export function ConnectButton({ onConnected }: { onConnected: () => void }) {
  const [isInit, setIsInit] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    async function setup() {
      await initNear();
      await initContract();
      await initWalletSelector();
      setIsInit(true);

      if (isSignedIn()) {
        onConnected();
      }
    }
    setup();
  }, [onConnected]);

  // Listen for account changes from the wallet selector modal
  useEffect(() => {
    const unsubscribe = onAccountChange((accountId) => {
      if (accountId) {
        onConnected();
      }
    });
    return () => unsubscribe();
  }, [onConnected]);

  const handleLogin = async () => {
    setIsConnecting(true);
    try {
      const modal = getModal();
      if (modal) {
        modal.show();
      }
    } catch (error: any) {
      console.error('Failed to open wallet selector:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (!isInit) return <div>Connecting to NEAR...</div>;

  if (!isSignedIn()) {
    return (
      <button onClick={handleLogin} className="btn btn-primary" disabled={isConnecting}>
        {isConnecting ? 'Connecting...' : 'Connect NEAR Wallet'}
      </button>
    );
  }

  return (
    <div className="connected">
      <span>Connected: {getAccountId()}</span>
      <button onClick={handleSignOut} className="btn btn-outline">
        Sign Out
      </button>
    </div>
  );
}
