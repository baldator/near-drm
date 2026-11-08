# NEAR DRM — NFTs That Do Something

Decentralized Digital Rights Management (DRM) system built on NEAR Protocol using NEP-171 NFTs. Encrypts files and distributes short-lived or single-use decryption keys to whitelisted wallets via NEP-178 approvals.

## What It Is

A DRM vault where each NFT represents an encrypted digital asset. Access is granted through NEP-178 approvals (`nft_approve` / `nft_revoke`), which act as temporary decryption rights. Each NFT also binds to a revenue-generating sub-account (`token-{id}.vault.near`) that accrues licensing fees; ownership passes with the NFT on transfer.

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
- **Standard extensions**: NEP-177 (metadata), NEP-178 (approvals as access grants), NEP-171 Events (off-chain key management via Lit Protocol)

## Try It (AI Judge Steps)

| Step | Action | See |
|------|--------|-----|
| 1 | Deploy contract: `near deploy --wasmFile contract/target/wasm32-unknown-unknown/release/vault.wasm --accountId vault.testnet` | Contract deployed on testnet |
| 2 | Mint: `near call vault.testnet nft_mint '{"token_id":"token-1","owner_id":"alice.testnet","metadata":{"title":"Test","encrypted":true,"access_rules":{"ttl_hours":24,"single_use":true}}}' --accountId alice.testnet` | NFT minted with sub-account `token-token-1.vault.near` |
| 3 | Grant access: `near call vault.testnet nft_approve '{"token_id":"token-1","account_id":"bob.testnet","msg":"{\"expires_at\":9999999999}"}' --accountId alice.testnet` | `nft_approve` event emitted → Lit Protocol issues key |
| 4 | Verify access: `near view vault.testnet nft_is_approved '{"token_id":"token-1","approved_account_id":"bob.testnet"}'` | Returns `true` |
| 5 | Revoke: `near call vault.testnet nft_revoke '{"token_id":"token-1","account_id":"bob.testnet"}' --accountId alice.testnet` | `nft_revoke` event → key revoked |
| 6 | Transfer: `near call vault.testnet nft_transfer '{"receiver_id":"charlie.testnet","token_id":"token-1"}' --accountId alice.testnet` | Approval cleared, owner changes, lock state returns to Active |
| 7 | Check sub-account: `near view vault.testnet get_sub_account '{"token_id":"token-1"}'` | Returns `token-token-1.vault.near` |

## Project Structure

```
contract/src/lib.rs       # NEP-171 contract (mint, approve, revoke, transfer, transfer_call)
contract/src/tests/       # Unit tests (mint, transfer, approve/revoke, expiry, clearance)
frontend/src/pages/       # Mint, Gated, History pages
technical-implementation.md  # Full architecture
threath-model.md          # Threat model & defenses
```

## Key Dates

- Hackathon: Nov 1–14, 2026 (UTC)
- Submission deadline: Nov 14, 2026, 23:59 UTC
- Judging: Nov 16–18, 2026
