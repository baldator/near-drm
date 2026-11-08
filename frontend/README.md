# NEAR DRM Frontend

React/TypeScript frontend for the Decentralized Digital Rights Management (DRM) system built on NEAR Protocol.

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Mint | `/mint` | Creator uploads encrypted file CID and mints a DRM NFT |
| Gated | `/gated/:tokenId` | Holder-only page — access controlled by NEP-178 approvals |
| History | `/history/:tokenId` | Per-NFT history: owner, sub-account, lock state, metadata |

## Setup

1. Install dependencies: `npm install`
2. Create `.env` with `REACT_APP_CONTRACT_ID=vault.testnet`
3. Start dev server: `npm start`
4. Deploy contract to testnet first, then update `REACT_APP_CONTRACT_ID`

## Contract Interaction

Uses `near-api-js` to call:
- View methods: `nft_metadata`, `nft_owner_of`, `nft_token`, `nft_tokens_for_owner`, `get_sub_account`, `get_lock_state`
- Change methods: `nft_mint`, `nft_approve`, `nft_revoke`, `nft_transfer`, `nft_transfer_call`

## Environment

- Network: NEAR Testnet
- Contract ID: `vault.testnet` (update in `.env`)