import {
  setupWalletSelector,
  type WalletSelector,
} from '@near-wallet-selector/core';
import { setupModal, type WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { setupHotWallet } from '@near-wallet-selector/hot-wallet';

const CONTRACT_ID = process.env.REACT_APP_CONTRACT_ID || 'vault.testnet';

let selector: WalletSelector | null = null;
let modal: WalletSelectorModal | null = null;
let activeWallet: any = null;
let accountId: string | null = null;
let onAccountChangeCallback: ((accountId: string | null) => void) | null = null;

/**
 * Initialize the NEAR Wallet Selector and its modal UI.
 * Call this once when the app mounts.
 */
export async function initWalletSelector() {
  if (selector) return selector;

  selector = await setupWalletSelector({
    network: 'testnet',
    modules: [setupMeteorWallet() as any, setupHotWallet() as any],
    createAccessKeyFor: {
      contractId: CONTRACT_ID,
      methodNames: [
        'nft_mint',
        'nft_approve',
        'nft_revoke',
        'nft_transfer',
        'nft_transfer_call',
      ],
    },
  });

  modal = setupModal(selector, {
    contractId: CONTRACT_ID,
    methodNames: [
      'nft_mint',
      'nft_approve',
      'nft_revoke',
      'nft_transfer',
      'nft_transfer_call',
    ],
    theme: 'auto',
  });

  // Handle sign-in from the modal or programmatic sign-in
  selector.on('signedIn', async (event: any) => {
    if (!selector) return;
    if (event.accounts && event.accounts.length > 0) {
      accountId = event.accounts[0].accountId;
      try {
        activeWallet = await selector.wallet(event.walletId);
      } catch (e) {
        // wallet may already be initialized
      }
      onAccountChangeCallback?.(accountId);
    }
  });

  selector.on('signedOut', () => {
    accountId = null;
    activeWallet = null;
    onAccountChangeCallback?.(null);
  });

  return selector;
}

export function getSelector() {
  return selector;
}

export function getModal() {
  return modal;
}

/**
 * Subscribe to account changes (sign in / sign out).
 */
export function onAccountChange(callback: (accountId: string | null) => void) {
  onAccountChangeCallback = callback;
  return () => {
    onAccountChangeCallback = null;
  };
}

/**
 * Sign in with a specific wallet (e.g. 'myNearWallet', 'nearWallet').
 * Returns the connected account ID.
 */
export async function signIn(walletId: string) {
  if (!selector) throw new Error('Wallet selector not initialized');

  const wallet = await selector.wallet(walletId);
  const accounts = await (wallet as any).signIn({
    contractId: CONTRACT_ID,
    methodNames: [
      'nft_mint',
      'nft_approve',
      'nft_revoke',
      'nft_transfer',
      'nft_transfer_call',
    ],
  });

  if (accounts.length > 0) {
    accountId = accounts[0].accountId;
    activeWallet = wallet;
    onAccountChangeCallback?.(accountId);
  }

  return accountId;
}

/**
 * Sign out from the connected wallet.
 */
export async function signOut() {
  if (activeWallet) {
    try {
      await activeWallet.signOut();
    } catch (e) {
      // ignore sign out errors
    }
    activeWallet = null;
    accountId = null;
  }
  onAccountChangeCallback?.(null);
}

/**
 * Returns the currently connected NEAR account ID, or null if not signed in.
 */
export function getAccountId(): string | null {
  return accountId;
}

/**
 * Returns the active wallet selector wallet instance (for signAndSendTransaction).
 */
export function getActiveWallet(): any {
  return activeWallet;
}

/**
 * Returns true if a wallet is currently connected.
 */
export function isSignedIn(): boolean {
  return accountId !== null;
}

export { CONTRACT_ID };
