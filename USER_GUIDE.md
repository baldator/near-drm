# NEAR DRM — End User Guide

Decentralized Digital Rights Management (DRM) built on NEAR Protocol. Sell encrypted digital content with time-limited, single-use access controlled by NEP-171 NFTs and NEP-178 approvals.

## Table of Contents

1. [What This Does](#what-this-does)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [For Creators: Minting DRM NFTs](#for-creators-minting)
5. [For Buyers: Getting Access](#for-buyers-getting-access)
6. [For Sellers: Transferring Ownership](#for-sellers-transferring)
7. [For Everyone: Viewing History](#for-everyone-viewing-history)
8. [Security Guarantees](#security-guarantees)
9. [Troubleshooting](#troubleshooting)

## What This Does

This system lets creators sell encrypted digital files (PDFs, videos, design templates, software) as NFTs on NEAR. Key features:

- **Encrypted at rest with AES-256-GCM**: Files are encrypted in the browser with a fresh random content key before upload; only ciphertext ever reaches IPFS
- **Confidential per-account keys**: Each account derives an X25519 key through NEAR MPC CKD; the secret is never stored on-chain
- **On-chain wrapped keys**: The content key is wrapped to each recipient and stored by the contract, which releases it only while you own or are approved for the token
- **Time-limited access**: Approvals expire after a set number of hours (TTL)
- **Ownership transfers with revenue**: Selling the NFT transfers the asset, decryption rights, and revenue sub-account

## Prerequisites

| Tool | Purpose |
|------|---------|
| NEAR CLI | Interact with contract from terminal (`npm install -g near-cli`) |
| NEAR Wallet | Sign transactions and hold NFTs ([wallet.testnet.near.org](https://wallet.testnet.near.org)) |
| IPFS client | Upload encrypted files (Pinata) |

You need two testnet accounts (e.g., `alice.testnet`, `bob.testnet`) with testnet NEAR for gas.

## Quick Start

**Frontend** (recommended — it performs the real encryption and key wrapping):
```bash
cd frontend
npm install
npm start
```
Then connect your wallet, go to `/mint` to create an NFT, `/gated/token-1` to create your key and grant access, and `/history/token-1` to view history.

**CLI** (metadata only — this mints a token without an owner key envelope, so the file cannot be decrypted until an envelope is delivered):
```bash
near call $CONTRACT nft_mint '{
  "token_id": "token-1",
  "owner_id": "alice.testnet",
  "metadata": {
    "title": "My Template",
    "media": "ipfs://QmEncryptedFileCID",
    "encrypted": true,
    "access_rules": { "ttl_hours": 24, "single_use": true },
    "whitelist_root": null,
    "sub_account_id": null,
    "royalty_percentage": 1000
  }
}' --accountId alice.testnet
```

## For Creators: Minting DRM NFTs

### Step 1: Create Your Encryption Key

Connect your wallet and open any file page. Click **Create my encryption key**. You will approve one NEAR MPC CKD transaction; the app derives your confidential X25519 key and registers only the public half on-chain. This is a one-time setup per account (you can repeat it to rotate).

### Step 2: Encrypt and Upload

Use `/mint` and choose a file. The app:
1. Encrypts the bytes with AES-256-GCM and a fresh random 256-bit content key.
2. Pins the ciphertext (`"DRM1"` format) to IPFS. The plaintext never leaves your browser.
3. Wraps the content key to your X25519 public key.
4. Mints the NFT with `owner_envelope` so you can open it immediately.

Original file name, MIME type, and encryption parameters are recorded in the token's `extra` metadata, which the gated page uses to restore the download name and type.

### Step 3: Mint the NFT

**Frontend**: Go to `/mint` and fill in the form. This is the only path that produces a decryptable token because it performs the encryption and owner wrapping.

**CLI minting** stores metadata only. Use it for integration tests, not for real protected files:

```bash
near call $CONTRACT nft_mint '{
  "token_id": "token-42",
  "owner_id": "alice.testnet",
  "metadata": {
    "title": "Premium Design Pack",
    "description": "5 professional templates for web designers",
    "media": "ipfs://QmEncryptedFileCID",
    "encrypted": true,
    "access_rules": {
      "ttl_hours": 48,
      "single_use": false,
      "max_views": 3
    },
    "whitelist_root": null,
    "sub_account_id": null,
    "royalty_percentage": 1500
  }
}' --accountId alice.testnet
```

| Field | Description |
|-------|-------------|
| `token_id` | Unique identifier (e.g., `token-42`) |
| `owner_id` | Your NEAR account |
| `media` | IPFS/Arweave CID of the encrypted file |
| `access_rules.ttl_hours` | Hours the decryption key stays valid |
| `access_rules.single_use` | `true` = key works once, `false` = reusable |
| `access_rules.max_views` | Max decryptions (optional) |
| `royalty_percentage` | Basis points on resale (1000 = 10%) |

### Step 4: Share the Token ID

Give buyers the `token_id` (e.g., `token-42`). They view it at `/gated/token-42` or in any NEAR wallet.

## For Buyers: Getting Access

### Step 1: Connect Your Wallet

Sign in to [wallet.testnet.near.org](https://wallet.testnet.near.org).

### Step 2: Create Your Key Before Asking for Access

The owner can only wrap the content key to a public key that already exists. Open `/gated/token-42` and click **Create my encryption key** first. The owner will see an error if you have not done this.

### Step 3: Receive Access

The owner enters your account ID and a TTL on the gated page. The app wraps the content key to your registered key and calls `nft_approve` with the envelope in `msg`:

```json
{
  "expires_at": 1715635200000000000,
  "ttl_hours": 24,
  "granted_by": "alice.testnet",
  "key_envelope": "AQ..."
}
```

CLI grants cannot create the envelope because wrapping happens in the browser with the owner's CKD key. Use the app to grant real access:

```bash
near call $CONTRACT nft_approve '{
  "token_id": "token-42",
  "account_id": "bob.testnet",
  "msg": "{\"expires_at\":1715635200000000000}"
}' --accountId alice.testnet
```

### Step 4: Decrypt the File

1. Open `/gated/token-42` with your wallet connected.
2. Click **Open protected file**. The app fetches the ciphertext from IPFS, reads your envelope from the contract, derives your X25519 secret through NEAR MPC CKD, unwraps the content key, and decrypts locally.
3. Download the restored file. The original filename and MIME type come from the token's `extra` metadata.
4. Access expires after the TTL. After expiry the contract no longer returns your envelope — ask the owner to grant access again.

## For Sellers: Transferring Ownership

Transferring the NFT moves the asset and the revenue sub-account. During a transfer, the contract deletes every approval envelope except one the sender pre-wrapped for the receiver. Because the contract cannot re-wrap keys on its own, the seller must deliver the receiver envelope **before** the transfer (for example, approve the receiver with `key_envelope` in `msg`, then transfer; the envelope is preserved). A plain transfer without a pre-wrapped envelope moves ownership but leaves the file unreadable to the new owner.

The new owner should register their encryption key before the sale. The current owner can then deliver (or re-send) an envelope to an actively approved account with `set_key_envelope`.

## For Everyone: Viewing History

`/history/token-42` shows ownership and approval events. It does not expose keys: envelopes are never included in event payloads, and `get_key_envelope` enforces ownership/approval checks.

## Security Guarantees

- **Confidentiality**: ciphertext on IPFS is useless without the content key; only wrapped envelopes are stored, and only for authorized accounts.
- **Key confidentiality**: X25519 secrets are derived through NEAR MPC CKD and never written on-chain or to IPFS.
- **Revocation is destructive**: `nft_revoke` deletes the recipient's envelope, so even a cached ciphertext cannot be re-opened through the contract.
- **Token binding**: AES-GCM AAD includes the contract and token ID, preventing an envelope/ciphertext from being reused under another token.
- **Owner-only delivery**: only the token owner can call `set_key_envelope`, and only for the owner or an actively approved account.

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| "Recipient has not registered an encryption key" | The recipient must open the gated page and click **Create my encryption key** first. |
| "No wrapped key is available for your account" | Access was revoked or expired, or the envelope was never delivered. Ask the owner to grant access again. |
| "This file uses an older or unsupported protection format" | The token was minted with the legacy base64 stub. Re-mint it through the AES-GCM flow. |
| Wallet never returns the MPC response | The app polls the transaction for up to 2–3 minutes. Keep the page open and check that `REACT_APP_MPC_CONTRACT_ID` and `REACT_APP_CKD_DOMAIN_ID` are correct. |
| CKD verification fails | The configured MPC public key or domain does not match the signer. Set `REACT_APP_MPC_BLS_PUBLIC_KEY` explicitly or correct the domain ID. |