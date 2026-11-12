# NEAR DRM — NFTs That Do Something

Decentralized Digital Rights Management (DRM) system built on NEAR Protocol using NEP-171 NFTs. Files are encrypted with AES-256-GCM; per-account X25519 keys are derived confidentially through NEAR MPC CKD, and wrapped content keys are delivered on-chain to approved wallets via NEP-178 approvals.

## What It Is

A DRM vault where each NFT represents an encrypted digital asset. Access is granted through NEP-178 approvals (`nft_approve` / `nft_revoke`), which act as temporary decryption rights. Each approval also delivers a content key wrapped to the recipient's NEAR-MPC-derived X25519 key, and the contract deletes that wrapped key on revoke, expiry, or transfer. Each NFT also binds to a revenue-generating sub-account (`token-{id}.vault.near`) that accrues licensing fees; ownership passes with the NFT on transfer.

## The Problem

Creators have no way to sell encrypted digital content with:
- Time-limited access (TTL-based expiration)
- Single-use decryption keys
- On-chain access control that transfers with ownership
- Revenue that stays with the NFT, not the seller

## Why NEP-171 NFTs for DRM

- **Composability**: NFTs are visible in any NEAR wallet, listable on any marketplace
- **Secondary markets**: Resale automatically transfers both the asset and its revenue sub-account
- **Universal compatibility**: Works with all NEAR wallets and marketplaces out of the box
- **Standard extensions**: NEP-177 (metadata), NEP-178 (approvals as access grants), NEP-171 events
- **Confidential key delivery**: AES-256-GCM content encryption, NEAR MPC CKD for per-account X25519 keys, on-chain wrapped-key envelopes enforced by ownership/approval

## How the Crypto Works

1. **Mint** — the browser encrypts the file with a fresh AES-256-GCM key and uploads only ciphertext to IPFS.
2. **Register** — each account derives an X25519 secret from NEAR MPC CKD (BLS12-381 G1 output, HKDF-SHA256) and registers only its public key on-chain.
3. **Grant** — the owner wraps the content key to the recipient's X25519 key and stores the envelope with `nft_approve`.
4. **Open** — the recipient fetches the envelope from the contract, derives their CKD secret, unwraps the key, and decrypts locally.
5. **Revoke / transfer** — the contract deletes the recipient's envelope, so the ciphertext alone is no longer enough.

See `technical-implementation.md` §10 for the exact construction.

## Try It (AI Judge Steps)

| Step | Action | See |
|------|--------|-----|
| 1 | Deploy contract: `near deploy --wasmFile contract/target/wasm32-unknown-unknown/release/vault.wasm --accountId vault.testnet` | Contract deployed on testnet |
| 2 | Mint through the web app (recommended): connect wallet, choose a file, and submit. The app encrypts with AES-GCM, pins the ciphertext, and mints with the owner's wrapped key. | NFT minted with sub-account `token-token-1.vault.near`, owner can open the file immediately |
| 3 | Register recipient key: recipient opens the file page and clicks **Create my encryption key** (one MPC CKD transaction). | X25519 public key stored via `set_encryption_key` |
| 4 | Grant access (UI): owner enters the recipient account and TTL; the app wraps the key and calls `nft_approve` with `msg = { expires_at, ttl_hours, granted_by, key_envelope }`. | Approval active; envelope stored on-chain |
| 5 | Verify access: `near view vault.testnet nft_is_approved '{"token_id":"token-1","approved_account_id":"bob.testnet"}'` | Returns `true`; `get_key_envelope` returns bob's envelope |
| 6 | Revoke: `near call vault.testnet nft_revoke '{"token_id":"token-1","account_id":"bob.testnet"}' --accountId alice.testnet` | Approval and bob's key envelope are deleted |
| 7 | Transfer: `near call vault.testnet nft_transfer '{"receiver_id":"charlie.testnet","token_id":"token-1"}' --accountId alice.testnet` | Approval cleared, owner changes, lock state returns to Active |
| 8 | Check sub-account: `near view vault.testnet get_sub_account '{"token_id":"token-1"}'` | Returns `token-token-1.vault.near` |

> Minting from the CLI without `owner_envelope` creates a token that the owner cannot decrypt. Use the web app for the full flow.

## Project Structure

```
contract/src/lib.rs       # NEP-171 contract (mint, approve, revoke, transfer, transfer_call)
contract/src/encryption.rs # X25519 registry + wrapped content-key envelopes
contract/src/tests/       # Unit tests (mint, transfer, approve/revoke, expiry, clearance)
frontend/src/services/near-mpc.ts # CKD, HKDF, X25519 envelopes, AES-256-GCM
frontend/src/pages/       # Mint, Gated, History pages
technical-implementation.md  # Full architecture
threath-model.md          # Threat model & defenses
```

## Key Dates

- Hackathon: Nov 1–14, 2026 (UTC)
- Submission deadline: Nov 14, 2026, 23:59 UTC
- Judging: Nov 16–18, 2026
