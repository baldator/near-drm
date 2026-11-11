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

- **Encrypted at rest**: Files are encrypted before upload; only decryption keys are managed on-chain
- **Time-limited access**: Buyers get keys valid for a set number of hours (TTL)
- **Single-use option**: Keys can work only once
- **Ownership transfers with revenue**: Selling the NFT transfers the asset, decryption rights, and revenue sub-account
- **Universal compatibility**: Works with any NEAR wallet and marketplace

## Prerequisites

| Tool | Purpose |
|------|---------|
| NEAR CLI | Interact with contract from terminal (`npm install -g near-cli`) |
| NEAR Wallet | Sign transactions and hold NFTs ([wallet.testnet.near.org](https://wallet.testnet.near.org)) |
| IPFS client | Upload encrypted files (Pinata) |

You need two testnet accounts (e.g., `alice.testnet`, `bob.testnet`) with testnet NEAR for gas.

## Quick Start

**Frontend**:
```bash
cd frontend
npm install
npm start
```
Then connect your wallet, go to `/mint` to create an NFT, `/gated/token-1` to grant access, and `/history/token-1` to view history.

**CLI** (set `export CONTRACT=vault.testnet`):
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
    "decryption_key_cid": null,
    "royalty_percentage": 1000
  }
}' --accountId alice.testnet
```

## For Creators: Minting DRM NFTs

### Step 1: Encrypt Your File

Encrypt your file before uploading (GPG, age, AES-256, etc.). Store the decryption key securely — you distribute it via NFT approvals.

### Step 2: Upload to IPFS

Upload the encrypted file to IPFS via [Pinata](https://pinata.cloud) (or another pinning service / your own node). You get a Content ID (CID) like `QmXyZ123...`.

### Step 3: Mint the NFT

**Frontend**: Go to `/mint` and fill in the form.

**CLI**:
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
    "decryption_key_cid": null,
    "royalty_percentage": 1500
  }
}' --accountId alice.testnet
```

| Field | Description |
|-------|-------------|
| `token_id` | Unique identifier (e.g., `token-42`) |
| `owner_id` | Your NEAR account |
| `media` | IPFS/Arweave CID of encrypted file |
| `access_rules.ttl_hours` | Hours the decryption key stays valid |
| `access_rules.single_use` | `true` = key works once, `false` = reusable |
| `access_rules.max_views` | Max decryptions (optional) |
| `royalty_percentage` | Basis points on resale (1000 = 10%) |

### Step 4: Share the Token ID

Give buyers the `token_id` (e.g., `token-42`). They view it at `/gated/token-42` or in any NEAR wallet.

## For Buyers: Getting Access

### Step 1: Connect Your Wallet

Sign in to [wallet.testnet.near.org](https://wallet.testnet.near.org).

### Step 2: Request Access

Go to `/gated/token-42`. If you're the owner or have approval, click "Grant Access" to receive a time-limited decryption key.

**CLI**:
```bash
near call $CONTRACT nft_approve '{
  "token_id": "token-42",
  "account_id": "bob.testnet",
  "msg": "{\"expires_at\":1715635200000000000}"
}' --accountId alice.testnet --deposit 0.001
```

### Step 3: Decrypt the File

1. Get the encrypted file CID from token metadata (`/history/token-42` or `nft_token` view)
2. Download from IPFS: `https://gateway.pinata.cloud/ipfs/QmEncryptedFileCID` (or your configured Pinata gateway)
3. Use your decryption key (issued via Lit Protocol on `nft_approve`) to decrypt
4. Key expires after TTL — request a new approval after expiration