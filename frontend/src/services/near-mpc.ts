/**
 * NEAR MPC Confidential Key Derivation (CKD) + AES-256-GCM for the DRM demo.
 *
 * Content is encrypted with a fresh random AES-256-GCM key per token. The key
 * is then wrapped to each recipient's X25519 public key with an ephemeral
 * X25519 / HKDF / AES-GCM envelope. Wrapped envelopes live on the DRM contract
 * and are only readable while the recipient owns or is actively approved for
 * the token.
 *
 * The X25519 secret is deterministic and confidential:
 *
 *   derived_key = CKD(caller = recipient, path, domain)   // BLS12-381 G1 point
 *   x25519_secret = HKDF-SHA256(derived_key)
 *
 * CKD returns C = derived_key + a*Y, so the caller recovers
 * derived_key = C - a*Y with its ephemeral ElGamal secret `a`, then verifies
 * e(derived_key, G2) == e(H(mpc_public_key || app_id), mpc_public_key).
 */
import { bls12_381 } from '@noble/curves/bls12-381';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { sha3_256 } from '@noble/hashes/sha3';
import bs58 from 'bs58';

import {
  CONTRACT_ID,
  callExternalContract,
  contract,
  getAccountId,
  initNear,
  near,
  waitForReturnValues,
} from './contract';

const G1 = bls12_381.G1.ProjectivePoint;
const G2 = bls12_381.G2.ProjectivePoint;
const Fr = bls12_381.fields.Fr;
const Fp12 = bls12_381.fields.Fp12;

export const MPC_CONTRACT_ID =
  process.env.REACT_APP_MPC_CONTRACT_ID?.trim() || 'v1.signer-prod.testnet';
export const CKD_DOMAIN_ID = Number(
  process.env.REACT_APP_CKD_DOMAIN_ID?.trim() || '2'
);
export const CKD_DERIVATION_PATH =
  process.env.REACT_APP_CKD_DERIVATION_PATH?.trim() ||
  'near-drm/encryption/v1';

const CKD_DST = 'NEAR BLS12381G1_XMD:SHA-256_SSWU_RO_';
const APP_ID_PREFIX = 'near-mpc v0.1.0 app_id derivation:';
const X25519_INFO = 'near-drm x25519 v1';
const ENVELOPE_INFO = 'near-drm envelope v1';
const CONTENT_MAGIC = new Uint8Array([0x44, 0x52, 0x4d, 0x31]); // "DRM1"
const CONTENT_VERSION = 1;
const ENVELOPE_VERSION = 1;
const CKD_DEPOSIT = BigInt(1);
const CKD_GAS = BigInt('250000000000000');

// Testnet ConfidentialKeyDerivation domains. These values are only fallbacks
// if the MPC contract's `state()` view call is unavailable.
const FALLBACK_TESTNET_CKD_KEYS: Record<number, string> = {
  2: 'bls12381g2:xeYho48G2Sr9oJz4gw9sLGZGspeeKpHZvMDAwWvoNTRnVMFJH96GxX98TT2MRhTtsot1wcGR1Ti2Xh8PCsbYJ2enbLNdJXDvTYSK8aTE3nJ5NZXU7Kt1F6mFtReWs5pR4kj',
  6: 'bls12381g2:mVEM6WaLvzZeaREHTizq9DA44DiWWL61HVjyDzKFmyoiEBw54xCe5MKqwfDVUbNJtYcDtNB2V3A28HJYY7Zb6tLXeq6wWMginGJpNryJgoNDhzLpgM7UtB9wYkmiDWXUrYf',
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface AccountKey {
  secret: Uint8Array;
  publicKey: string;
}

export interface EncryptedAsset {
  ciphertext: Uint8Array;
  ownerEnvelope: string;
  aad: string;
}

const keyCache = new Map<string, AccountKey>();
let mpcPublicKeyCache: string | null = null;

function utf8(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < parts.length; i += 1) total += parts[i].length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < parts.length; i += 1) {
    result.set(parts[i], offset);
    offset += parts[i].length;
  }
  return result;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x2000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(
      null,
      Array.from(chunk) as unknown as number[]
    );
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << BigInt(8)) | BigInt(bytes[i]);
  }
  return value;
}

function randomScalar(): bigint {
  return Fr.create(bytesToBigInt(bls12_381.utils.randomPrivateKey()));
}

function parseG1(value: string) {
  const raw = value.startsWith('bls12381g1:')
    ? value.slice('bls12381g1:'.length)
    : value;
  return G1.fromHex(bs58.decode(raw));
}

function parseG2(value: string) {
  const raw = value.startsWith('bls12381g2:')
    ? value.slice('bls12381g2:'.length)
    : value;
  return G2.fromHex(bs58.decode(raw));
}

function g1ToProtocolString(point: { toRawBytes: (compressed?: boolean) => Uint8Array }): string {
  return `bls12381g1:${bs58.encode(point.toRawBytes(true))}`;
}

/** Exact `derive_app_id` from near-mpc's kdf.rs. */
export function deriveAppId(accountId: string, path: string): Uint8Array {
  return sha3_256(utf8(`${APP_ID_PREFIX}${accountId},${path}`));
}

/**
 * Returns the MPC domain public key used to verify CKD outputs.
 *
 * The key is read from the signer contract's `state()` view function so the
 * demo keeps working if governance rotates the testnet key. An explicit
 * REACT_APP_MPC_BLS_PUBLIC_KEY override always wins.
 */
async function getMpcDomainPublicKey(): Promise<string> {
  const configured = process.env.REACT_APP_MPC_BLS_PUBLIC_KEY?.trim();
  if (configured) return configured;
  if (mpcPublicKeyCache) return mpcPublicKeyCache;

  try {
    if (!near) await initNear();
    const response = await near.connection.provider.query({
      request_type: 'call_function',
      finality: 'final',
      account_id: MPC_CONTRACT_ID,
      method_name: 'state',
      args_base64: bytesToBase64(utf8('{}')),
    });
    const raw = response?.result;
    const json = Array.isArray(raw)
      ? textDecoder.decode(Uint8Array.from(raw))
      : textDecoder.decode(base64ToBytes(String(raw)));
    const parsed = JSON.parse(json);
    const domains = parsed?.Running?.keyset?.domains || [];
    for (let i = 0; i < domains.length; i += 1) {
      if (Number(domains[i]?.domain_id) === CKD_DOMAIN_ID) {
        const key = domains[i]?.key?.Bls12381?.public_key;
        if (typeof key === 'string') {
          mpcPublicKeyCache = key;
          return key;
        }
      }
    }
  } catch (error) {
    console.warn('Could not read the MPC public key from state():', error);
  }

  const fallback = FALLBACK_TESTNET_CKD_KEYS[CKD_DOMAIN_ID];
  if (fallback) {
    mpcPublicKeyCache = fallback;
    return fallback;
  }

  throw new Error(
    `Could not determine the BLS12-381 public key for CKD domain ${CKD_DOMAIN_ID}. ` +
      'Set REACT_APP_MPC_BLS_PUBLIC_KEY in your .env file.'
  );
}

function isCkdResponse(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return Boolean(parsed && parsed.big_y && parsed.big_c);
  } catch {
    return false;
  }
}

/**
 * Derives the account's deterministic X25519 key through NEAR MPC CKD.
 *
 * This is the only function that asks the wallet to send a transaction to the
 * MPC signer. Results are cached for the page session.
 */
export async function deriveAccountKey(accountId: string): Promise<AccountKey> {
  const cacheKey = `${accountId}:${CKD_DOMAIN_ID}:${CKD_DERIVATION_PATH}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const appSecret = randomScalar();
  const appPublic = G1.BASE.multiply(appSecret);
  const appPublicKey = g1ToProtocolString(appPublic);

  let outcome: any;
  try {
    outcome = await callExternalContract(
      MPC_CONTRACT_ID,
      'request_app_private_key',
      {
        request: {
          derivation_path: CKD_DERIVATION_PATH,
          app_public_key: { AppPublicKey: appPublicKey },
          domain_id: CKD_DOMAIN_ID,
        },
      },
      CKD_DEPOSIT,
      CKD_GAS
    );
  } catch (error: any) {
    throw new Error(
      `Could not request a confidential key from NEAR MPC (${MPC_CONTRACT_ID}). ` +
        'Your wallet must allow a transaction to the MPC contract; if it only signed a ' +
        'function-call key for this dApp, connect a wallet with full access (for example Hot Wallet). ' +
        `Details: ${error?.message || error}`
    );
  }

  const values = await waitForReturnValues(outcome, 180000, isCkdResponse);
  let response: { big_y: string; big_c: string } | null = null;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(values[i]);
      if (parsed && parsed.big_y && parsed.big_c) {
        response = parsed;
        break;
      }
    } catch {
      // Not the CKD response; keep looking.
    }
  }

  if (!response) {
    throw new Error(
      'NEAR MPC did not return a CKD response. Make sure the MPC contract and CKD domain are configured correctly.'
    );
  }

  const bigY = parseG1(response.big_y);
  const bigC = parseG1(response.big_c);
  const derivedPoint = bigC.subtract(bigY.multiply(appSecret));

  // Verify the derived key is a valid BLS signature for this caller's app id.
  const domainPublicKey = parseG2(await getMpcDomainPublicKey());
  const appId = deriveAppId(accountId, CKD_DERIVATION_PATH);
  const hashPoint = bls12_381.G1.hashToCurve(
    concatBytes([domainPublicKey.toRawBytes(true), appId]),
    { DST: CKD_DST }
  );
  const valid = Fp12.eql(
    bls12_381.pairing(derivedPoint, G2.BASE),
    // noble types hashToCurve as H2CPoint, but it is a valid G1 point at runtime.
    bls12_381.pairing(hashPoint as any, domainPublicKey)
  );
  if (!valid) {
    throw new Error(
      'NEAR MPC returned a CKD key that failed verification. Please try again.'
    );
  }

  const secret = hkdf(
    sha256,
    derivedPoint.toRawBytes(true),
    utf8('near-drm'),
    utf8(X25519_INFO),
    32
  );
  const publicKey = bytesToBase64(x25519.getPublicKey(secret));

  const result: AccountKey = { secret, publicKey };
  keyCache.set(cacheKey, result);
  return result;
}

/**
 * Returns the account's registered X25519 public key, registering it through
 * CKD the first time the account uses the dApp.
 */
export async function ensureRegisteredPublicKey(
  accountId: string
): Promise<string> {
  const registered = await contract.get_encryption_key({
    account_id: accountId,
  });
  if (registered) return registered;

  const key = await deriveAccountKey(accountId);
  await contract.set_encryption_key({
    x25519_public_key: key.publicKey,
  });
  return key.publicKey;
}

/**
 * Returns the account's X25519 secret, verifying it matches the public key that
 * is stored on-chain. Registers the public key if it is missing.
 */
export async function ensureAccountKey(accountId: string): Promise<AccountKey> {
  const key = await deriveAccountKey(accountId);
  const registered = await contract.get_encryption_key({
    account_id: accountId,
  });
  if (!registered) {
    await contract.set_encryption_key({ x25519_public_key: key.publicKey });
  } else if (registered !== key.publicKey) {
    throw new Error(
      'Your on-chain encryption key does not match the key derived from NEAR MPC. ' +
        'It may have been registered with a different CKD domain or derivation path.'
    );
  }
  return key;
}

export function aadForToken(tokenId: string): string {
  return `${CONTRACT_ID}:${tokenId}:v1`;
}

// ---------------------------------------------------------------------------
// AES-256-GCM content encryption
// ---------------------------------------------------------------------------

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptContent(
  plaintext: Uint8Array,
  contentKey: Uint8Array,
  aad: string
): Promise<Uint8Array> {
  const iv = randomBytes(12);
  const key = await importAesKey(contentKey);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: utf8(aad),
      tagLength: 128,
    },
    key,
    plaintext
  );
  return concatBytes([
    CONTENT_MAGIC,
    Uint8Array.of(CONTENT_VERSION),
    iv,
    new Uint8Array(encrypted),
  ]);
}

export async function decryptContent(
  payload: Uint8Array,
  contentKey: Uint8Array,
  aad: string
): Promise<Uint8Array> {
  if (payload.length < 17) {
    throw new Error('This protected file is incomplete.');
  }
  for (let i = 0; i < CONTENT_MAGIC.length; i += 1) {
    if (payload[i] !== CONTENT_MAGIC[i]) {
      throw new Error(
        'This file uses an older or unsupported protection format. Re-create it from the mint page to use AES-GCM.'
      );
    }
  }
  if (payload[4] !== CONTENT_VERSION) {
    throw new Error('This protected file uses an unsupported format version.');
  }
  const iv = payload.subarray(5, 17);
  const ciphertext = payload.subarray(17);
  const key = await importAesKey(contentKey);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: utf8(aad),
        tagLength: 128,
      },
      key,
      ciphertext
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error(
      'The file could not be decrypted. The content key does not match this file, or the file was modified.'
    );
  }
}

// ---------------------------------------------------------------------------
// X25519 key envelopes
// ---------------------------------------------------------------------------

function deriveEnvelopeKey(sharedSecret: Uint8Array, aad: string): Uint8Array {
  return hkdf(sha256, sharedSecret, utf8(aad), utf8(ENVELOPE_INFO), 32);
}

export async function wrapContentKey(
  contentKey: Uint8Array,
  recipientPublicKeyBase64: string,
  aad: string
): Promise<string> {
  const recipientPublicKey = base64ToBytes(recipientPublicKeyBase64);
  if (recipientPublicKey.length !== 32) {
    throw new Error('Recipient encryption key is not a valid X25519 key.');
  }
  const ephemeralSecret = x25519.utils.randomPrivateKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
  const shared = x25519.getSharedSecret(ephemeralSecret, recipientPublicKey);
  const wrappingKey = deriveEnvelopeKey(shared, aad);
  const iv = randomBytes(12);
  const key = await importAesKey(wrappingKey);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: utf8(aad),
      tagLength: 128,
    },
    key,
    contentKey
  );
  return bytesToBase64(
    concatBytes([
      Uint8Array.of(ENVELOPE_VERSION),
      ephemeralPublic,
      iv,
      new Uint8Array(encrypted),
    ])
  );
}

export async function unwrapContentKey(
  envelopeBase64: string,
  recipientSecret: Uint8Array,
  aad: string
): Promise<Uint8Array> {
  const envelope = base64ToBytes(envelopeBase64);
  if (envelope.length < 45 || envelope[0] !== ENVELOPE_VERSION) {
    throw new Error('This key envelope is malformed or unsupported.');
  }
  const ephemeralPublic = envelope.subarray(1, 33);
  const iv = envelope.subarray(33, 45);
  const ciphertext = envelope.subarray(45);
  const shared = x25519.getSharedSecret(recipientSecret, ephemeralPublic);
  const wrappingKey = deriveEnvelopeKey(shared, aad);
  const key = await importAesKey(wrappingKey);
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: utf8(aad),
        tagLength: 128,
      },
      key,
      ciphertext
    );
    return new Uint8Array(decrypted);
  } catch {
    throw new Error(
      'The key envelope could not be opened. It may have been wrapped for a different account or key.'
    );
  }
}

// ---------------------------------------------------------------------------
// High-level mint / grant / open flows
// ---------------------------------------------------------------------------

/**
 * Encrypts file bytes for a new token and wraps the content key to the owner.
 */
export async function encryptAssetForMint(
  plaintext: Uint8Array,
  tokenId: string,
  ownerAccountId: string
): Promise<EncryptedAsset> {
  const ownerPublicKey = await ensureRegisteredPublicKey(ownerAccountId);
  const contentKey = randomBytes(32);
  const aad = aadForToken(tokenId);
  const ciphertext = await encryptContent(plaintext, contentKey, aad);
  const ownerEnvelope = await wrapContentKey(
    contentKey,
    ownerPublicKey,
    aad
  );
  return { ciphertext, ownerEnvelope, aad };
}

/**
 * Grants a recipient access by unwrapping the owner's content key and
 * re-wrapping it to the recipient's registered X25519 key.
 */
export async function grantContentKey(
  tokenId: string,
  ownerAccountId: string,
  recipientAccountId: string
): Promise<string> {
  const aad = aadForToken(tokenId);
  const recipientPublicKey = await contract.get_encryption_key({
    account_id: recipientAccountId,
  });
  if (!recipientPublicKey) {
    throw new Error(
      `${recipientAccountId} has not set up an encryption key yet. Ask them to open this file page and create their key first.`
    );
  }

  const ownerKey = await ensureAccountKey(ownerAccountId);
  const ownerEnvelope = await contract.get_key_envelope({
    token_id: tokenId,
    account_id: ownerAccountId,
  });
  if (!ownerEnvelope) {
    throw new Error(
      'The owner key envelope for this token is missing, so access cannot be shared.'
    );
  }
  const contentKey = await unwrapContentKey(
    ownerEnvelope,
    ownerKey.secret,
    aad
  );
  return wrapContentKey(contentKey, recipientPublicKey, aad);
}

/**
 * Opens a protected file for the given account. The contract only returns the
 * account's envelope while it owns the token or has an active approval.
 */
export async function openProtectedFile(
  tokenId: string,
  accountId: string,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const aad = aadForToken(tokenId);
  const envelope = await contract.get_key_envelope({
    token_id: tokenId,
    account_id: accountId,
  });
  if (!envelope) {
    throw new Error(
      'No wrapped key is available for your account. Ask the owner to grant access again.'
    );
  }
  const accountKey = await ensureAccountKey(accountId);
  const contentKey = await unwrapContentKey(envelope, accountKey.secret, aad);
  return decryptContent(ciphertext, contentKey, aad);
}

/** The signed-in account, or a clear error if the wallet is disconnected. */
export function requireAccountId(): string {
  const accountId = getAccountId();
  if (!accountId) {
    throw new Error('Please connect your NEAR wallet first.');
  }
  return accountId;
}

export const nearMPC = {
  deriveAccountKey,
  ensureRegisteredPublicKey,
  ensureAccountKey,
  encryptAssetForMint,
  grantContentKey,
  openProtectedFile,
  aadForToken,
  wrapContentKey,
  unwrapContentKey,
  encryptContent,
  decryptContent,
  bytesToBase64,
  base64ToBytes,
};
