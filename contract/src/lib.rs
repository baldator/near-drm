mod approval;
mod mint;
mod state;
mod transfer;
mod types;
mod view;

use near_sdk::collections::{LazyOption, LookupMap};
use near_sdk::near;
use near_sdk::AccountId;

use crate::state::{Contract, ContractExt, StorageKey};
use crate::types::TokenMetadata;

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, metadata: TokenMetadata) -> Contract {
        let mut this = Self {
            owner_id,
            tokens_per_owner: LookupMap::new(StorageKey::TokensPerOwner),
            tokens_by_id: LookupMap::new(StorageKey::TokensById),
            owner_of: LookupMap::new(StorageKey::OwnerOf),
            token_metadata_by_id: LookupMap::new(StorageKey::TokenMetadataById),
            approvals_by_id: LookupMap::new(StorageKey::ApprovalsById),
            token_lock_state: LookupMap::new(StorageKey::TokenLockState),
            sub_accounts: LookupMap::new(StorageKey::SubAccounts),
            next_approval_id: 0,
            metadata: LazyOption::new(StorageKey::Metadata, None),
            total_supply: 0,
            pending_transfers: LookupMap::new(StorageKey::PendingTransfers),
            next_pending_id: 0,
            approvals_by_token: LookupMap::new(StorageKey::ApprovalsByToken),
            approvals_per_account: LookupMap::new(StorageKey::ApprovalsPerAccount),
        };
        this.metadata.set(&metadata);
        this
    }
}
