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

const CONTRACT_ID = process.env.REACT_APP_CONTRACT_ID || 'neardrm.testnet';
const NETWORK_ID = 'testnet';

// In local development, route RPC through the dev-server proxy (/near-rpc)
// so browser fetch() calls are same-origin. rpc.testnet.near.org does not
// emit Access-Control-Allow-Origin, which otherwise triggers CORS blocks.
// On any other host (production, etc.) we call the RPC node directly.
function getNodeUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'https://test.rpc.fastnear.com';
  }
  return 'https://test.rpc.fastnear.com';
}

const nearConfigBase = {
  networkId: NETWORK_ID,
  walletUrl: 'https://wallet.testnet.near.org',
  helperUrl: 'https://helper.testnet.near.org',
  explorerUrl: 'https://explorer.testnet.near.org',
};

export interface NftApproval {
  account_id: string;
  approval_id: number;
  expires_at: number | null;
}

export interface TokenApproval {
  token_id: string;
  approval: NftApproval;
}

export interface DrmContract {
  nft_owner_of: (args: { token_id: string }) => Promise<string>;
  nft_token: (args: { token_id: string }) => Promise<any>;
  nft_approvals: (args: { token_id: string }) => Promise<NftApproval[]>;
  nft_approvals_for_account: (args: {
    account_id: string;
    from_index?: string | null;
    limit?: number | null;
  }) => Promise<TokenApproval[]>;
  nft_tokens_for_owner: (args: {
    account_id: string;
    from_index?: string | null;
    limit?: number | null;
  }) => Promise<string[]>;
  nft_mint: (args: {
    token_id: string;
    owner_id: string;
    metadata: any;
    owner_envelope?: string | null;
  }) => Promise<void>;
  nft_is_approved: (args: {
    token_id: string;
    approved_account_id: string;
  }) => Promise<boolean>;
  nft_approve: (args: { token_id: string; account_id: string; msg: string }) => Promise<void>;
  nft_revoke: (args: { token_id: string; account_id: string }) => Promise<void>;
  get_sub_account: (args: { token_id: string }) => Promise<string>;
  get_lock_state: (args: { token_id: string }) => Promise<string>;
  get_encryption_key: (args: { account_id: string }) => Promise<string | null>;
  set_encryption_key: (args: { x25519_public_key: string }) => Promise<void>;
  get_key_envelope: (args: {
    token_id: string;
    account_id: string;
  }) => Promise<string | null>;
  set_key_envelope: (args: {
    token_id: string;
    account_id: string;
    envelope: string;
  }) => Promise<void>;
}

export let near: any;
// The contract wrapper only holds closures and never touches the network on
// creation, so it can be created eagerly. Each view call ensures `near` is
// initialized first. This lets pages use `contract` even when they mount
// before ConnectButton has finished its asynchronous initialization (for
// example when a deep link is opened or refreshed directly).
export let contract: DrmContract = createDrmContract();

let nearInitPromise: Promise<void> | null = null;

export async function initNear() {
  if (near) return;
  if (!nearInitPromise) {
    nearInitPromise = (async () => {
      near = await connect({
        deps: { keyStore: new keyStores.BrowserLocalStorageKeyStore() },
        ...nearConfigBase,
        nodeUrl: getNodeUrl(),
      });
    })().catch((error) => {
      // Allow a later call to retry if initialization failed.
      nearInitPromise = null;
      throw error;
    });
  }
  return nearInitPromise;
}

/**
 * Short-lived cache for view calls. Reduces redundant RPC hits (helps stay
 * under the public testnet rate limit) and speeds up re-mounts / refreshes.
 */
interface ViewCacheEntry {
  value: any;
  expiry: number;
}
const viewCache = new Map<string, ViewCacheEntry>();
const VIEW_CACHE_TTL_MS = 15000;

function getCacheKey(methodName: string, args: any): string {
  return `${methodName}:${JSON.stringify(args)}`;
}

/**
 * Call a view method on the DRM contract (no signing required).
 *
 * Retries on HTTP 429 (rate limited) with exponential backoff, and serves
 * recently-fetched results from a short-lived TTL cache.
 */
async function viewFunction(methodName: string, args: any) {
  if (!near) await initNear();
  const senderId = getAccountId() || CONTRACT_ID;
  // `Near.account()` is asynchronous (it resolves to an `Account` instance).
  // We must await it before calling `viewFunction()`: otherwise `.viewFunction`
  // would be accessed on a pending Promise (which is `undefined`) and every
  // view call would throw a TypeError before any RPC request is sent.
  const account = await near.account(senderId);

  const cacheKey = getCacheKey(methodName, args);
  const cached = viewCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  let lastError: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await account.viewFunction({
        contractId: CONTRACT_ID,
        methodName,
        args,
      });
      viewCache.set(cacheKey, { value: result, expiry: Date.now() + VIEW_CACHE_TTL_MS });
      return result;
    } catch (error: any) {
      lastError = error;
      const isRateLimited =
        error?.status === 429 ||
        error?.statusCode === 429 ||
        (typeof error?.message === 'string' &&
          /429|rate.?limit|too many requests/i.test(error.message));
      if (!isRateLimited || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  throw lastError;
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

  // A change call can alter any view result (owner, approvals, lock state),
  // so drop cached reads to make the next fetch observe the new state.
  viewCache.clear();

  return outcome;
}

/**
 * Send a function call to any contract through the connected wallet.
 *
 * Used for NEAR MPC CKD, where the caller must be the user's own account
 * (the derived key is bound to the predecessor account ID).
 */
export async function callExternalContract(
  receiverId: string,
  methodName: string,
  args: any,
  deposit: bigint = BigInt(0),
  gas: bigint = BigInt('300000000000000')
) {
  const wallet = getActiveWallet();
  const signerId = getAccountId();

  if (!wallet || !signerId) {
    throw new Error('Not signed in to a NEAR wallet');
  }

  const outcome = await wallet.signAndSendTransaction({
    signerId,
    receiverId,
    actions: [
      actionCreators.functionCall(methodName, args, gas, deposit),
    ],
  });

  viewCache.clear();
  return outcome;
}

function decodeSuccessValue(status: any): string | null {
  if (!status || typeof status !== 'object') return null;
  const value = status.SuccessValue ?? status.successValue;
  if (typeof value !== 'string') return null;
  if (value.length === 0) return null;
  try {
    return atob(value);
  } catch {
    return null;
  }
}

/**
 * Collect every non-empty SuccessValue in a FinalExecutionOutcome.
 *
 * Yield/resume calls (such as NEAR MPC CKD) may return their value in the
 * final receipt rather than the transaction status, so all receipts are
 * inspected.
 */
export function extractReturnValues(outcome: any): string[] {
  const values: string[] = [];
  const pushStatus = (status: any) => {
    const value = decodeSuccessValue(status);
    if (value) values.push(value);
  };

  pushStatus(outcome?.status);
  const receipts = outcome?.receipts_outcome || outcome?.receiptsOutcome || [];
  for (const receipt of receipts) {
    pushStatus(receipt?.outcome?.status ?? receipt?.status);
  }

  const finalOutcome = outcome?.final_execution_outcome;
  if (finalOutcome) {
    pushStatus(finalOutcome.status);
    for (const receipt of finalOutcome.receipts_outcome || []) {
      pushStatus(receipt?.outcome?.status ?? receipt?.status);
    }
  }

  return values;
}

/**
 * Wait until a yield/resume transaction produces its return value.
 *
 * Wallets often return as soon as the first receipt executes, while the MPC
 * callback arrives a few blocks later. Poll the transaction status until the
 * CKD response is visible.
 */
export async function waitForReturnValues(
  outcome: any,
  timeoutMs: number = 120000,
  matches?: (value: string) => boolean
): Promise<string[]> {
  const select = (values: string[]) =>
    matches ? values.filter((value) => matches(value)) : values;

  const immediate = select(extractReturnValues(outcome));
  if (immediate.length > 0) return immediate;

  const txHash =
    outcome?.transaction_outcome?.id ||
    outcome?.transaction?.hash ||
    outcome?.transaction_outcome?.transaction?.hash ||
    outcome?.transactionOutcome?.id;
  const senderId = getAccountId();

  if (!txHash || !senderId) {
    throw new Error(
      'The wallet did not return enough information to retrieve the MPC key response.'
    );
  }

  if (!near) await initNear();

  const deadline = Date.now() + timeoutMs;
  let lastError: any = null;

  while (Date.now() < deadline) {
    try {
      const status = await near.connection.provider.sendJsonRpc(
        'EXPERIMENTAL_tx_status',
        {
          tx_hash: txHash,
          sender_account_id: senderId,
          wait_until: 'FINAL',
        }
      );
      if (status?.status?.Failure) {
        throw new Error(
          `The MPC request failed: ${JSON.stringify(status.status.Failure)}`
        );
      }
      const values = select(extractReturnValues(status));
      if (values.length > 0) return values;
    } catch (error: any) {
      lastError = error;
      if (/mpc request failed/i.test(String(error?.message || ''))) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  throw new Error(
    `Timed out waiting for the MPC key response.${
      lastError ? ` ${lastError.message || lastError}` : ''
    }`
  );
}

export function createDrmContract(): DrmContract {
  return {
    nft_owner_of: async (args) => viewFunction('nft_owner_of', args),
    nft_token: async (args) => viewFunction('nft_token', args),
    nft_approvals: async (args) => viewFunction('nft_approvals', args),
    nft_approvals_for_account: async (args) =>
      viewFunction('nft_approvals_for_account', args),
    nft_tokens_for_owner: async (args) => viewFunction('nft_tokens_for_owner', args),
    nft_mint: async (args) => functionCall('nft_mint', args),
    nft_is_approved: async (args) => viewFunction('nft_is_approved', args),
    nft_approve: async (args) => functionCall('nft_approve', args),
    nft_revoke: async (args) => functionCall('nft_revoke', args),
    get_sub_account: async (args) => viewFunction('get_sub_account', args),
    get_lock_state: async (args) => viewFunction('get_lock_state', args),
    get_encryption_key: async (args) => viewFunction('get_encryption_key', args),
    set_encryption_key: async (args) => functionCall('set_encryption_key', args),
    get_key_envelope: async (args) => viewFunction('get_key_envelope', args),
    set_key_envelope: async (args) => functionCall('set_key_envelope', args),
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
