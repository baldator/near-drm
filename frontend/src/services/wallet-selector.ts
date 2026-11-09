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
let selectedWalletId: string | null = null;
let walletName: string | null = null;
let onAccountChangeCallback: ((accountId: string | null) => void) | null = null;

/**
 * Resolve the human-friendly name of a wallet (e.g. "Meteor Wallet")
 * from the wallet selector's module metadata.
 */
function resolveWalletName(id: string | null): string | null {
  if (!selector || !id) return null;
  const module = selector.store.getState().modules.find((m) => m.id === id);
  return module?.metadata?.name ?? null;
}

/**
 * Restore the connected account/wallet from the wallet selector's persisted
 * store. The selector persists accounts and selected wallet in localStorage,
 * so this repopulates our state after a page refresh.
 */
async function restoreFromStore() {
  if (!selector) return;
  const state = selector.store.getState();
  const active = state.accounts.find((a) => a.active) ?? state.accounts[0];
  const id = state.selectedWalletId;

  if (active && id) {
    accountId = active.accountId;
    selectedWalletId = id;
    walletName = resolveWalletName(id);
    try {
      activeWallet = await selector.wallet(id);
    } catch (e) {
      activeWallet = null;
    }
  } else {
    accountId = null;
    selectedWalletId = null;
    walletName = null;
    activeWallet = null;
  }
}

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

  // Restore a previously connected session on page load.
  await restoreFromStore();
  if (accountId) {
    onAccountChangeCallback?.(accountId);
  }

  // Handle sign-in from the modal or programmatic sign-in
  selector.on('signedIn', async (event) => {
    if (!selector) return;
    if (event.accounts && event.accounts.length > 0) {
      accountId = event.accounts[0].accountId;
      selectedWalletId = event.walletId;
      walletName = resolveWalletName(event.walletId);
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
    selectedWalletId = null;
    walletName = null;
    activeWallet = null;
    onAccountChangeCallback?.(null);
  });

  selector.on('accountsChanged', (event) => {
    const active = event.accounts[0];
    if (active) {
      accountId = active.accountId;
      selectedWalletId = event.walletId;
      walletName = resolveWalletName(event.walletId);
      onAccountChangeCallback?.(accountId);
    }
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
 * Sign in with a specific wallet (e.g. 'meteor-wallet', 'hot-wallet').
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
    selectedWalletId = walletId;
    walletName = resolveWalletName(walletId) ?? wallet.metadata?.name ?? null;
    activeWallet = wallet;
    onAccountChangeCallback?.(accountId);
  }

  return accountId;
}

/**
 * Sign out from the connected wallet.
 */
export async function signOut(): Promise<boolean> {
  if (!selector) {
    return false;
  }

  // Ensure we have a wallet instance to call signOut on.
  if (!activeWallet && selectedWalletId) {
    try {
      activeWallet = await selector.wallet(selectedWalletId);
    } catch (e) {
      // ignore
    }
  }

  if (activeWallet) {
    try {
      await activeWallet.signOut();
    } catch (e) {
      // The user may have cancelled the request. We verify the real state below
      // instead of assuming the disconnect succeeded.
    }
  }

  // Check the wallet selector's actual state: the core dispatches
  // WALLET_DISCONNECTED only when the wallet truly signs out.
  const state = selector.store.getState();
  const stillSignedIn = state.accounts.length > 0;

  if (stillSignedIn) {
    // Disconnect was cancelled or failed — keep the session intact.
    await restoreFromStore();
    if (accountId) {
      onAccountChangeCallback?.(accountId);
    }
    return false;
  }

  // Confirmed signed out.
  accountId = null;
  selectedWalletId = null;
  walletName = null;
  activeWallet = null;
  onAccountChangeCallback?.(null);
  return true;
}

/**
 * Returns the currently connected NEAR account ID, or null if not signed in.
 */
export function getAccountId(): string | null {
  return accountId;
}

/**
 * Returns the connected wallet provider name (e.g. "Meteor Wallet"),
 * or null if not signed in.
 */
export function getWalletName(): string | null {
  return walletName;
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
