# NEAR DRM Frontend

React/TypeScript frontend for the Decentralized Digital Rights Management (DRM) system built on NEAR Protocol.

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Mint | `/mint` | Creator adds a file, sets access rules, and mints a DRM NFT |
| Gated | `/gated/:tokenId` | Holder-only page — access controlled by NEP-178 approvals |
| History | `/history/:tokenId` | Per-NFT history: owner, sub-account, lock state, metadata |

## Setup

1. Install dependencies: `npm install`
2. Create `.env` with `REACT_APP_CONTRACT_ID=vault.testnet` and the Pinata variables below
3. Start dev server: `npm start`
4. Deploy contract to testnet first, then update `REACT_APP_CONTRACT_ID`

## Contract Interaction

Uses `near-api-js` to call:
- View methods: `nft_metadata`, `nft_owner_of`, `nft_token`, `nft_tokens_for_owner`, `get_sub_account`, `get_lock_state`, `get_encryption_key`, `get_key_envelope`
- Change methods: `nft_mint`, `nft_approve`, `nft_revoke`, `nft_transfer`, `nft_transfer_call`, `set_encryption_key`, `set_key_envelope`

It also sends `request_app_private_key` to the NEAR MPC signer contract for CKD, then polls the transaction until the response arrives.

## Encryption

- **Content**: AES-256-GCM with a fresh 256-bit key per token. Uploaded as `"DRM1" || version || IV || ciphertext + tag`.
- **Per-account key**: X25519 secret derived from NEAR MPC CKD (BLS12-381 G1 → HKDF-SHA256); only the public key is registered on-chain.
- **Delivery**: the content key is wrapped to the recipient's X25519 key (`version || ephemeral pubkey || IV || AES-GCM`) and stored on the contract per `(token, account)`.
- **Enforcement**: the contract returns an envelope only to the owner or an actively approved account, and deletes it on revoke/expiry/transfer.

## Environment

- Network: NEAR Testnet
- Contract ID: `vault.testnet` (update in `.env`)
- NEAR MPC CKD:
  - `REACT_APP_MPC_CONTRACT_ID` — signer contract (default `v1.signer-prod.testnet`)
  - `REACT_APP_CKD_DOMAIN_ID` — ConfidentialKeyDerivation domain (default `2`; testnet also has `6`)
  - `REACT_APP_CKD_DERIVATION_PATH` — derivation path (default `near-drm/encryption/v1`)
  - `REACT_APP_MPC_BLS_PUBLIC_KEY` — optional pinned domain public key; otherwise read from `state()`
  - The wallet must be able to send a transaction to the MPC contract. Wallets that only grant a function-call key scoped to the DRM contract (some Meteor Wallet sessions) cannot perform CKD; use a full-access wallet such as Hot Wallet.
- IPFS uploads use [Pinata](https://pinata.cloud):
  - `REACT_APP_PINATA_JWT` — Pinata JWT scoped to `pinFileToIPFS` (required for file uploads)
  - `REACT_APP_PINATA_GATEWAY` — optional dedicated gateway (defaults to `https://gateway.pinata.cloud`)
  - `REACT_APP_PINATA_UPLOAD_URL` — optional server-side upload proxy; recommended for production because `REACT_APP_*` values are bundled into the client

> Because Create React App exposes every `REACT_APP_*` variable in the browser bundle, use a scoped Pinata key restricted to your domain, or proxy uploads through a backend.

## Mint Flow

The Mint page is written for non-technical creators:

1. Add a title and description.
2. Choose a file (up to 5 MB). It is encrypted in the browser with AES-256-GCM and the ciphertext is uploaded to IPFS automatically.
3. Choose how long access lasts, whether it is single-use, and the resale royalty.
4. Confirm one wallet transaction. The owner's wrapped content key is included in `nft_mint`.

Creators who already have a protected file online can switch to **I already have a link** and paste the URL instead.