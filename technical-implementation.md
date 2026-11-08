# Technical Implementation: Track 10 — NFTs That Do Something

## Overview

A Decentralized Digital Rights Management (DRM) system built on NEAR Protocol using NEP-171 NFTs. Each NFT represents an encrypted digital asset with short-lived or single-use decryption keys distributed to whitelisted wallets. Additionally, each NFT maps to a revenue-generating sub-account (e.g., `token-1.vault.near`) that accrues licensing fees; ownership of the NFT confers control of that sub-account and its balance.

The system is built around **NEP-171** and its official extensions (NEP-177 Metadata, NEP-178 Approval Management, NEP-171 Events) rather than a custom contract from scratch.

## 1. Account & Contract Architecture

### Root Contract
- **Account ID:** `vault.near` (testnet: `vault.testnet`)
- **Contract type:** NEP-171 non-fungible token contract
- **Responsibilities:** minting, metadata storage, approval management (NEP-178), transfers (NEP-171), cross-contract calls to sub-accounts, event emission

### Sub-Accounts
- **Pattern:** `token-{token_id}.vault.near` (e.g., `token-1.vault.near`, `token-42.vault.near`)
- **Key property:** Zero external access keys (`FullAccess` or `FunctionCall`). Controlled **exclusively** by the root contract via cross-contract calls where `predecessor_account_id == root_contract`.
- **Purpose:** Holds revenue (licensing fees, secondary sale royalties) accrued by the NFT. Balance belongs to whoever holds the NFT at withdrawal time.

### Key Management (Off-Chain)
- **Service:** Lit Protocol (or comparable threshold encryption network)
- **Trigger:** `nft_approve` and `nft_revoke` events emitted by the root contract
- **Action:** Issue or revoke short-lived decryption keys to the approved/whitelisted wallet


## 2. NEP-177 Metadata Schema

Each token's metadata JSON includes:

| Field | Type | Purpose |
|-------|------|---------|
| `title` | string | Human-readable asset name |
| `description` | string | Asset description |
| `media` | string | IPFS/Arweave CID of the **encrypted** file |
| `encrypted` | boolean | `true` — file is encrypted at rest |
| `access_rules` | object | `{ "ttl_hours": 24, "single_use": true, "max_views": 1 }` |
| `whitelist_root` | string | Merkle root of whitelisted wallet addresses |
| `sub_account_id` | string | `token-{id}.vault.near` |
| `decryption_key_cid` | string | (Updated off-chain) CID of the encrypted decryption key share |
| `royalty_percentage` | u16 | Basis points paid to creator on secondary sales |

Example:
```json
{
  "title": "Premium Design Template",
  "media": "ipfs://QmEncryptedFileCID",
  "encrypted": true,
  "access_rules": { "ttl_hours": 24, "single_use": true },
  "whitelist_root": "0x1234...",
  "sub_account_id": "token-7.vault.near",
  "royalty_percentage": 1000
}
```

## 3. NEP-178 Approval Management as Access Grant

| NEP-178 Call | DRM Semantics |
|--------------|---------------|
| `nft_approve(token_id, account_id, msg)` | Grants the whitelisted wallet temporary decryption access. The `msg` field can carry an expiration timestamp. |
| `nft_revoke(token_id, account_id)` | Immediately terminates decryption rights. Triggers `nft_revoke` event → Lit Protocol revokes the key. |
| `nft_is_approved(token_id, approved_account_id)` | Off-chain check: does this wallet currently hold active approval? Used by the gated page to render or block the decrypt button. |

**Access lifecycle:**
1. Creator mints NFT → metadata records `whitelist_root` and `access_rules`.
2. Buyer purchases → `nft_approve` called with buyer's wallet + TTL → `nft_approve` event emitted.
3. Lit Protocol listener issues short-lived decryption key to buyer's wallet.
4. Buyer decrypts file within TTL.
5. On expiry or `nft_revoke`, key is invalidated; access ends.

## 4. NEP-171 Cross-Contract Calls: Atomic Access Purchase

Flow using `nft_transfer_call` + `nft_resolve_transfer`:

1. **Buyer** calls `nft_transfer_call` on the root contract, attaching the license fee in NEAR.
2. Root contract validates payment, sets token state to `LOCKED`, initiates transfer to buyer.
3. Root contract cross-contract-calls the fee-receiving sub-account (or treasury) to credit the payment.
4. Root contract emits `nft_approve` event for the buyer (or directly grants approval).
5. **`nft_resolve_transfer` callback:**
   - **Success:** Token state → `ACTIVE`, new owner recorded, approval active, decryption key issued off-chain.
   - **Failure:** Transfer rolls back, token state → `ACTIVE`, funds returned to buyer, no key issued.

This makes "pay → receive NFT + decryption access" a single atomic transaction.

## 5. NEP-171 Events for Off-Chain Key Management

| Event | Trigger | Off-Chain Consumer | Action |
|-------|---------|-------------------|--------|
| `nft_approve` | Access granted | Lit Protocol watcher | Issue short-lived decryption key to approved wallet |
| `nft_revoke` | Access revoked | Lit Protocol watcher | Revoke/invalidate the decryption key |
| `nft_metadata_update` | Metadata changed (e.g., key CID) | Indexer / frontend | Refresh cached metadata and access UI |

The off-chain watcher listens to these standard events via NEAR indexer (e.g., near-indexer-for-event or near-lake-framework) and acts in real-time.

## 6. Sub-Account Treasury & Revenue Flow

- On NFT mint, root contract creates `token-{id}.vault.near` sub-account.
- Licensing fees and secondary sale royalties are routed to this sub-account via cross-contract calls from root.
- **No keys exist on the sub-account.** All withdrawals go through the root contract, which checks `tokens_per_owner[new_owner]` in real-time.
- When the NFT is transferred, the new owner immediately gains withdrawal rights; the old owner loses them. No key rotation or deletion is required.

## 7. Threat Model Defenses (Applied)

| Defense | Implementation |
|---------|---------------|
| **No direct keys on sub-accounts** | Sub-accounts have `access_keys = []`. All calls dispatched by root contract with `predecessor_account_id == root_contract` check. |
| **Transfer lockout** | Token state set to `LOCKED` during `nft_transfer`/`nft_transfer_call`. Incoming dividends/withdrawals queued or rejected until `nft_resolve_transfer` commits. |
| **Atomic allowance clearance** | On transfer: `approvals.clear()` + `next_approval_id` incremented. Invalidates dangling NEP-178 spenders. |
| **Continuous balance entitlement** | Balance belongs to current holder at withdrawal execution time. `tokens_per_owner` lookup at withdrawal, not at deposit. |

## 8. Project Structure

```
near-hackathon/
├── contract/                 # Rust smart contract (near-sdk-rs)
│   ├── src/
│   │   ├── lib.rs            # NEP-171 core + metadata + approvals
│   │   ├── metadata.rs       # NEP-177 metadata schema
│   │   ├── drm.rs            # DRM access logic (approve/revoke/verify)
│   │   ├── subaccount.rs     # Sub-account treasury binding
│   │   └── events.rs         # NEP-171 event emission
│   ├── Cargo.toml
│   └── tests/
│       ├── transfer.rs       # Transfer path tests (incl. mid-payout sale)
│       ├── approval.rs       # Approval expiry & revocation
│       └── reentrancy.rs     # Reentrancy resistance
├── frontend/                 # React/TypeScript dApp
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Mint.tsx      # Creator mint page
│   │   │   ├── Gated.tsx     # Holder-only gated page
│   │   │   └── History.tsx   # Per-NFT history view
│   │   └── components/
│   ├── package.json
│   └── README.md
├── relayer/                  # Optional meta-transaction relayer (if gasless needed)
├── scripts/                  # Deployment & test scripts
├── technical-implementation.md
├── threath-model.md
├── prompt.md
├── .env.example              # Testnet keys (never commit real keys)
└── README.md                 # AI-judge-friendly: what, problem, do X / see Y
```

## 9. Deployment Target

- **Network:** NEAR Testnet (per setup rule: build on testnet first; keys in `.env`, never in repo)
- **Contract build:** `cargo build --target wasm32-unknown-unknown --release`
- **Contract deploy:** `near deploy --wasmFile target/wasm32-unknown-unknown/release/vault.wasm --accountId vault.testnet`
