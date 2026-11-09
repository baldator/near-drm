use near_sdk::borsh::{BorshSerialize, BorshStorageKey};
use near_sdk::collections::{LazyOption, LookupMap, UnorderedSet};
use near_sdk::near;
use near_sdk::{AccountId, PanicOnDefault};

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
}

/// Builds a storage prefix for a given account's owned-token set.
pub fn tokens_per_owner_prefix(account_id: &AccountId) -> Vec<u8> {
    let mut p = b"tokens_per_owner".to_vec();
    p.extend_from_slice(account_id.as_bytes());
    p
}
