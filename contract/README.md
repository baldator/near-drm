# DRM smart contract

## Build the contract

Requires `cargo-near` (near-sdk 5.x requires it instead of plain `cargo build`):

```bash
# Install cargo-near
cargo install cargo-near

# Build the release WASM (generates ABI automatically)
cargo near build --release

# The output wasm is at:
# target/wasm32-unknown-unknown/release/vault.wasm
```

## ABI

The ABI is auto-generated during `cargo near build --release` and saved alongside
the WASM. A static copy is also kept at `abi.json` for reference and block explorer validation.

## Deploy to NEAR testnet

```bash
near login

# Deploy and initialize in one step
near deploy neardrm.testnet \
  --wasmFile target/wasm32-unknown-unknown/release/vault.wasm \
  --initFunction new \
  --initArgs '{"owner_id": "neardrm.testnet", "metadata": {"title": "NEAR DRM Vault", "description": "DRM-protected NFTs on NEAR", "encrypted": true}}'
```

## Verify

```bash
near view neardrm.testnet nft_metadata
near view neardrm.testnet nft_total_supply
```
