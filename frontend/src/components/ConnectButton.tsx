import React, { useEffect, useState } from 'react';
import {
  initNear,
  initContract,
  initWalletSelector,
  signOut,
  getAccountId,
  getWalletName,
  isSignedIn,
  getModal,
  onAccountChange,
} from '../services/contract';

export function ConnectButton({ onConnected }: { onConnected: () => void }) {
  const [isInit, setIsInit] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);

  useEffect(() => {
    async function setup() {
      await initNear();
      await initContract();
      await initWalletSelector();
      setIsInit(true);

      // After init, the wallet selector may have restored a previous session.
      const signedIn = isSignedIn();
      setAccountId(getAccountId());
      setWalletName(getWalletName());
      if (signedIn) {
        onConnected();
      }
    }
    setup();
  }, [onConnected]);

  // Listen for account changes from the wallet selector modal
  useEffect(() => {
    const unsubscribe = onAccountChange((changedAccountId) => {
      setAccountId(changedAccountId);
      setWalletName(getWalletName());
      if (changedAccountId) {
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
    const disconnected = await signOut();
    // Only switch to the "Connect" state if the wallet really disconnected.
    // If the user cancelled, keep the connected state.
    if (disconnected) {
      setAccountId(null);
      setWalletName(null);
    }
  };

  if (!isInit) return <div>Connecting to NEAR...</div>;

  if (!accountId) {
    return (
      <button onClick={handleLogin} className="btn btn-primary" disabled={isConnecting}>
        {isConnecting ? 'Connecting...' : 'Connect NEAR Wallet'}
      </button>
    );
  }

  return (
    <div className="connected">
      <span className="wallet-name" title={accountId}>
        {walletName ?? 'Wallet'}
        <span className="wallet-account"> ({accountId})</span>
      </span>
      <button onClick={handleSignOut} className="btn btn-outline-light">
        Disconnect
      </button>
    </div>
  );
}
