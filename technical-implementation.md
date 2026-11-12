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

### Key Management (On/Off-Chain Hybrid)

- **Content encryption:** every minted file is encrypted in the browser with a fresh random **AES-256-GCM** content key `K`. The ciphertext is uploaded to IPFS; `K` never leaves the browser unwrapped.
- **Key derivation:** each account derives a deterministic **X25519** secret from **NEAR MPC Confidential Key Derivation (CKD)**. The caller requests `request_app_private_key` from the signer contract and recovers the derived BLS12-381 G1 point from the MPC response (`S = C - a·Y`), then verifies it against the domain public key with a pairing check.
- **Key wrapping:** `K` is wrapped to the recipient's X25519 public key with an ephemeral X25519 / HKDF-SHA256 / AES-256-GCM envelope. Envelopes are stored **on the contract**, one per `(token, account)`.
- **Access enforcement:** the contract returns an envelope only while the account owns the token or holds an active NEP-178 approval. `nft_revoke`, approval expiry cleanup, and transfers delete the corresponding envelopes.

See [Section 10](#10-confidential-key-delivery-near-mpc-ckd--aes-256-gcm) for the exact construction.


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
| `royalty_percentage` | u16 | Basis points paid to creator on secondary sales |
| `extra` | string (JSON) | Original file name/MIME/size plus AES-GCM + CKD parameters. Also carries the on-chain `encryption` descriptor used by the gated page. |

Encryption parameters live in `extra` rather than in a key CID, because the key itself is never published:

```json
{
  "file_name": "design-template.sketch",
  "file_type": "application/octet-stream",
  "file_size": 1048576,
  "encryption": {
    "scheme": "AES-256-GCM",
    "version": 1,
    "aad": "vault.testnet:token-7:v1",
    "key_wrapping": "X25519-HKDF-SHA256",
    "mpc_contract": "v1.signer-prod.testnet",
    "ckd_domain_id": 2,
    "derivation_path": "near-drm/encryption/v1"
  }
}
```

> Legacy `mpc-encrypted:` / `content_encoding: base64` tokens are rejected by the gated page with an upgrade message; they are not decryptable by the AES-GCM flow.

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
| `nft_approve(token_id, account_id, msg)` | Grants temporary access **and** delivers the wrapped content key. `msg` is a JSON object with `expires_at`, `ttl_hours`, `granted_by`, and `key_envelope`. |
| `nft_revoke(token_id, account_id)` | Immediately terminates access and **deletes the recipient's key envelope**. |
| `nft_is_approved(token_id, approved_account_id)` | Returns whether an unexpired approval exists. The gated page uses it before requesting the envelope. |
| `get_key_envelope(token_id, account_id)` | Returns the envelope **only** if the account owns the token or has an active approval; otherwise `None`. |
| `set_key_envelope(token_id, account_id, envelope)` | Owner-only recovery path for re-sending or rotating an envelope. |

**Access lifecycle:**
1. Creator mints the NFT; `nft_mint` accepts an optional `owner_envelope`, so the owner can decrypt immediately.
2. Before granting access, the recipient opens the gated page and registers an X25519 public key via `set_encryption_key` (derived through CKD).
3. The owner wraps the content key to the recipient and calls `nft_approve` with the envelope in `msg`. One transaction stores both the deadline and the key.
4. The recipient fetches the ciphertext from IPFS and the envelope from the contract, derives their secret through CKD, unwraps the key, and decrypts.
5. On `nft_revoke`, expiry cleanup, or transfer, the envelope is removed, so later reads fail even if the ciphertext is public.

## 4. NEP-171 Cross-Contract Calls: Atomic Access Purchase

Flow using `nft_transfer_call` + `nft_resolve_transfer`:

1. **Buyer** calls `nft_transfer_call` on the root contract, attaching the license fee in NEAR.
2. Root contract validates payment, sets token state to `LOCKED`, initiates transfer to buyer.
3. Root contract cross-contract-calls the fee-receiving sub-account (or treasury) to credit the payment.
4. **Before settlement**, the seller wraps the content key to the buyer's registered X25519 key and includes the envelope in the approval payload (or in the receiver hook `msg`). The transfer preserves the receiver's waiting envelope.
5. **`nft_resolve_transfer` callback:**
   - **Success:** Token state → `ACTIVE`, new owner recorded, approval active. A key envelope the sender pre-wrapped for the receiver is preserved; all other envelopes are deleted with their approvals.
   - **Failure:** Transfer rolls back, token state → `ACTIVE`, the receiver's waiting envelope is deleted, funds returned to buyer, no key issued.

When the seller pre-wraps the key for the buyer, "pay → receive NFT + decryption access" resolves atomically. Without pre-wrapping, the NFT still transfers, but the contract has no way to re-wrap the content key to the new owner on its own; the previous owner must deliver an envelope.

## 5. NEP-171 Events and On-Chain Access Control

| Event | Trigger | Consumer | Meaning |
|-------|---------|----------|---------|
| `nft_approve` | Access granted | Indexers / frontend | An approval and (optionally) a wrapped key envelope were stored |
| `nft_revoke` | Access revoked | Indexers / frontend | The approval and the recipient's key envelope were deleted |
| `nft_metadata_update` | Metadata changed | Indexer / frontend | Refresh cached metadata and access UI |

Unlike a Lit-style design, no off-chain watcher is needed to enforce access: the contract itself is the policy decision point. `get_key_envelope` refuses to return an envelope unless the caller owns the token or has an unexpired approval, and revocation deletes the envelope from state. Indexers are only used to keep UIs fresh.

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
| **Confidential keys never on-chain** | The X25519 secret is derived per account by NEAR MPC CKD. Only the public key and wrapped envelopes are stored. |
| **Envelope access checks** | `get_key_envelope` requires ownership or an unexpired approval; there is no unauthenticated read of a content-key envelope. |
| **Revocation destroys keys** | `nft_revoke`, approval cleanup, and transfer deletion remove the recipient's envelope from storage. |
| **Transfer recipient packaging** | A sender can pre-wrap a key for the receiver; the envelope is preserved across a successful transfer and deleted on rollback. |
| **Ciphertext-binding AAD** | AES-GCM uses `{contract}:{token}:v1` as additional data, so a ciphertext cannot be replayed under another token ID. |

## 8. Project Structure

```
near-hackathon/
├── contract/                 # Rust smart contract (near-sdk-rs)
│   ├── src/
│   │   ├── lib.rs            # NEP-171 core, init, module wiring
│   │   ├── mint.rs           # Mint + optional owner key envelope
│   │   ├── approval.rs       # NEP-178 approvals, expiry, envelope delivery
│   │   ├── encryption.rs     # X25519 key registry + wrapped key envelopes
│   │   ├── transfer.rs       # Transfers, envelope preservation/cleanup
│   │   ├── state.rs          # Contract state and storage prefixes
│   │   └── types.rs          # Metadata / approval types
│   ├── abi.json
│   └── Cargo.toml
├── frontend/                 # React/TypeScript dApp
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Mint.tsx      # Encrypt with AES-GCM + mint with owner envelope
│   │   │   ├── Gated.tsx     # Key registration, grant, decrypt + canvas viewer
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── near-mpc.ts   # CKD, HKDF, X25519 envelopes, AES-256-GCM
│   │   │   └── contract.ts   # Wallet, contract calls, MPC response polling
│   │   └── components/
│   │       ├── ProtectedCanvasViewer.tsx  # In-memory canvas + watermark
│   │       └── EncryptionKeyPrompt.tsx    # Post-connect key setup prompt
│   ├── package.json
│   └── README.md
├── technical-implementation.md
├── threath-model.md
├── prompt.md
├── .env.example              # Testnet keys (never commit real keys)
└── README.md                 # AI-judge-friendly: what, problem, do X / see Y
```

## 9. Deployment Target

- **Network:** NEAR Testnet (per setup rule: build on testnet first; keys in `.env`, never in repo)
- **Contract build:** `cargo near build` (or `cargo build --target wasm32-unknown-unknown --release`)
- **Contract deploy:** `near deploy --wasmFile target/wasm32-unknown-unknown/release/vault.wasm --accountId vault.testnet`

## 10. Confidential Key Delivery: NEAR MPC CKD + AES-256-GCM

### 10.1 Content encryption

1. The mint page reads the file as bytes and generates a random 32-byte content key `K`.
2. It encrypts the bytes with AES-256-GCM using a random 12-byte IV and AAD `"{contract}:{token_id}:v1"`.
3. The protected file is `"DRM1" || version || IV || ciphertext || tag` and is uploaded to IPFS as binary.
4. `K` is wrapped to the owner's X25519 public key and passed to `nft_mint` as `owner_envelope`.
5. Original file name, MIME type, size, and encryption parameters are stored in `extra`.

### 10.2 Per-account key derivation (CKD)

Each account's X25519 key comes from NEAR MPC CKD and is never stored anywhere:

1. Generate an ephemeral ElGamal secret `a` and app public key `A = a·G1`.
2. Call `request_app_private_key` on the signer contract with `{ derivation_path, app_public_key: { AppPublicKey: "bls12381g1:<bs58>" }, domain_id }`.
3. MPC responds with `big_y` and `big_c`, where `Y = y·G1` and `C = S + y·A`.
4. Recover `S = C - a·Y`.
5. Verify `e(S, G2) == e(H(mpc_pk || app_id), mpc_pk)` using BLS12-381 pairings.
6. Derive `x25519_secret = HKDF-SHA256(compressed S, salt "near-drm", info "near-drm x25519 v1")`.
7. Register `x25519_public_key` on-chain with `set_encryption_key`.

`app_id` is `sha3_256("near-mpc v0.1.0 app_id derivation:" + account_id + "," + path)`, matching the MPC network's own derivation.

Testnet defaults (override with `REACT_APP_MPC_CONTRACT_ID`, `REACT_APP_CKD_DOMAIN_ID`, `REACT_APP_CKD_DERIVATION_PATH`):

| Setting | Default |
|---------|---------|
| MPC contract | `v1.signer-prod.testnet` |
| CKD domain | `2` |
| Derivation path | `near-drm/encryption/v1` |
| Deposit / gas | `1 yocto` / `250 Tgas` |

The domain's BLS public key is read from the signer's `state()` view call; `REACT_APP_MPC_BLS_PUBLIC_KEY` can pin it explicitly.

### 10.3 Envelopes

An envelope is `version || ephemeral_pubkey(32) || IV(12) || AES-GCM(wrapped K)`, base64-encoded.

- Wrapping: ephemeral X25519 key `e`, shared secret `X25519(e, recipient_pub)`, wrapping key `HKDF-SHA256(shared, salt = AAD, info = "near-drm envelope v1")`, AES-256-GCM over `K` with the same AAD.
- Unwrapping requires the CKD-derived secret and the token AAD; a wrong account or token fails the GCM tag.

### 10.4 Grant and revoke

- **Grant:** the owner unwraps their own envelope to recover `K`, fetches the recipient's registered public key, re-wraps `K`, and sends `nft_approve` with `msg = { expires_at, ttl_hours, granted_by, key_envelope }`.
- **Revoke / expiry / transfer:** the contract deletes the recipient's envelope. Even though the IPFS ciphertext is public, the key is no longer retrievable through the contract.
- **Mint:** `nft_mint` accepts `owner_envelope` so a freshly minted token is decryptable without a second transaction.
