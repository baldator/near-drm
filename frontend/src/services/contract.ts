import { connect, keyStores } from 'near-api-js';
import { actionCreators } from '@near-wallet-selector/core';
import {
  initWalletSelector,
  signIn,
  signOut,
  getAccountId,
  getWalletName,
  getActiveWallet,
  isSignedIn,
  onAccountChange,
  getModal,
} from './wallet-selector';
import { nearMPC } from './near-mpc';

const CONTRACT_ID = process.env.REACT_APP_CONTRACT_ID || 'neardrm.testnet';
const NETWORK_ID = 'testnet';

const nearConfig = {
  networkId: NETWORK_ID,
  nodeUrl: 'https://rpc.testnet.near.org',
  walletUrl: 'https://wallet.testnet.near.org',
  helperUrl: 'https://helper.testnet.near.org',
  explorerUrl: 'https://explorer.testnet.near.org',
};

export interface DrmContract {
  nft_owner_of: (args: { token_id: string }) => Promise<string>;
  nft_token: (args: { token_id: string }) => Promise<any>;
  nft_mint: (args: { token_id: string; owner_id: string; metadata: any }) => Promise<void>;
  nft_is_approved: (args: {
    token_id: string;
    approved_account_id: string;
  }) => Promise<boolean>;
  nft_approve: (args: { token_id: string; account_id: string; msg: string }) => Promise<void>;
  nft_revoke: (args: { token_id: string; account_id: string }) => Promise<void>;
  get_sub_account: (args: { token_id: string }) => Promise<string>;
  get_lock_state: (args: { token_id: string }) => Promise<string>;
}

export let near: any;
export let contract: DrmContract;

export async function initNear() {
  near = await connect({
    deps: { keyStore: new keyStores.BrowserLocalStorageKeyStore() },
    ...nearConfig,
  });

  // Initialize NEAR MPC (CKD) for DRM encryption/decryption
  try {
    await nearMPC.init();
  } catch (error) {
    console.warn('NEAR MPC initialization failed:', error);
  }
}

/**
 * Call a view method on the DRM contract (no signing required).
 */
async function viewFunction(methodName: string, args: any) {
  const senderId = getAccountId() || CONTRACT_ID;
  const result = await near.account(senderId).viewFunction({
    contractId: CONTRACT_ID,
    methodName,
    args,
  });
  return result;
}

/**
 * Call a change method on the DRM contract via the connected wallet selector wallet.
 *
 * @param deposit - yoctoNEAR to attach with the call. Defaults to 0. Some
 * methods (e.g. storage-deposit-heavy approvals) may need a positive deposit;
 * methods like nft_mint explicitly reject deposits, so pass 0 for those.
 */
async function functionCall(methodName: string, args: any, deposit: bigint = BigInt(0)) {
  const wallet = getActiveWallet();
  const signerId = getAccountId();

  if (!wallet || !signerId) {
    throw new Error('Not signed in to a NEAR wallet');
  }

  const outcome = await wallet.signAndSendTransaction({
    signerId,
    receiverId: CONTRACT_ID,
    actions: [
      actionCreators.functionCall(
        methodName,
        args,
        BigInt('300000000000000'), // gas
        deposit
      ),
    ],
  });

  return outcome;
}

export function createDrmContract(): DrmContract {
  return {
    nft_owner_of: async (args) => viewFunction('nft_owner_of', args),
    nft_token: async (args) => viewFunction('nft_token', args),
    nft_mint: async (args) => functionCall('nft_mint', args),
    nft_is_approved: async (args) => viewFunction('nft_is_approved', args),
    nft_approve: async (args) => functionCall('nft_approve', args),
    nft_revoke: async (args) => functionCall('nft_revoke', args),
    get_sub_account: async (args) => viewFunction('get_sub_account', args),
    get_lock_state: async (args) => viewFunction('get_lock_state', args),
  };
}

export async function initContract() {
  if (!near) await initNear();
  contract = createDrmContract();
}

export {
  CONTRACT_ID,
  signIn,
  signOut,
  getAccountId,
  getWalletName,
  isSignedIn,
  initWalletSelector,
  onAccountChange,
  getModal,
};
