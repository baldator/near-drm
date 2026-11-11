use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{LazyOption, LookupMap, UnorderedSet};
use near_sdk::near;
use near_sdk::{AccountId, BorshStorageKey, PanicOnDefault};

use crate::types::{Approval, LockState, PendingTransfer, Token, TokenId, TokenMetadata};

/// Storage keys for the contract's persistent collections.
#[derive(BorshSerialize, BorshStorageKey)]
pub enum StorageKey {
    TokensPerOwner,
    TokensById,
    TokenMetadataById,
    ApprovalsById,
    TokenLockState,
    Metadata,
    SubAccounts,
    OwnerOf,
    PendingTransfers,
    /// New variants must stay at the end so existing prefixes remain stable.
    ApprovalsByToken,
    ApprovalsPerAccount,
}

/// The contract's persistent on-chain state.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner_id: AccountId,
    pub tokens_per_owner: LookupMap<AccountId, UnorderedSet<String>>,
    pub tokens_by_id: LookupMap<String, Token>,
    pub owner_of: LookupMap<String, AccountId>,
    pub token_metadata_by_id: LookupMap<String, TokenMetadata>,
    pub approvals_by_id: LookupMap<String, LookupMap<AccountId, Approval>>,
    pub token_lock_state: LookupMap<String, LockState>,
    pub sub_accounts: LookupMap<String, AccountId>,
    pub next_approval_id: u64,
    pub metadata: LazyOption<TokenMetadata>,
    pub total_supply: u64,
    pub pending_transfers: LookupMap<u64, PendingTransfer>,
    pub next_pending_id: u64,
    /// Accounts currently approved for a given token.
    pub approvals_by_token: LookupMap<TokenId, UnorderedSet<AccountId>>,
    /// Tokens on which a given account currently holds an approval.
    pub approvals_per_account: LookupMap<AccountId, UnorderedSet<TokenId>>,
}

/// Builds a storage prefix for a given account's owned-token set.
pub fn tokens_per_owner_prefix(account_id: &AccountId) -> Vec<u8> {
    let mut p = b"tokens_per_owner".to_vec();
    p.extend_from_slice(account_id.as_bytes());
    p
}

/// Appends a length-prefixed value so one prefix can never be a prefix of another.
fn prefixed(prefix: &[u8], value: &[u8]) -> Vec<u8> {
    let mut p = prefix.to_vec();
    p.extend_from_slice(&(value.len() as u32).to_le_bytes());
    p.extend_from_slice(value);
    p
}

/// Builds a storage prefix for a token's account -> approval map.
pub fn token_approvals_prefix(token_id: &TokenId) -> Vec<u8> {
    prefixed(b"token_approvals", token_id.as_bytes())
}

/// Builds a storage prefix for a token's set of approved accounts.
pub fn approvals_by_token_prefix(token_id: &TokenId) -> Vec<u8> {
    prefixed(b"approvals_by_token", token_id.as_bytes())
}

/// Builds a storage prefix for an account's set of approved tokens.
pub fn approvals_per_account_prefix(account_id: &AccountId) -> Vec<u8> {
    prefixed(b"approvals_per_account", account_id.as_bytes())
}
