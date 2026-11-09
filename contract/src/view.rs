use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

use crate::state::{Contract, ContractExt};
use crate::types::{LockState, TokenId, TokenMetadata};

#[near]
impl Contract {
    pub fn nft_metadata(&self) -> TokenMetadata {
        self.metadata.get().unwrap()
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128(self.total_supply as u128)
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(
            self.tokens_per_owner
                .get(&account_id)
                .map(|t| t.len() as u128)
                .unwrap_or(0),
        )
    }

    pub fn nft_owner_of(&self, token_id: TokenId) -> Option<AccountId> {
        self.owner_of.get(&token_id)
    }

    pub fn nft_token(&self, token_id: TokenId) -> Option<TokenMetadata> {
        self.token_metadata_by_id.get(&token_id)
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<TokenId> {
        match self.tokens_per_owner.get(&account_id) {
            Some(tokens) => {
                let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
                let limit = limit.unwrap_or(100) as usize;
                tokens.iter().skip(start).take(limit).collect()
            }
            None => vec![],
        }
    }

    pub fn get_sub_account(&self, token_id: TokenId) -> Option<AccountId> {
        self.sub_accounts.get(&token_id)
    }

    pub fn get_lock_state(&self, token_id: TokenId) -> LockState {
        self.token_lock_state
            .get(&token_id)
            .unwrap_or(LockState::Active)
    }
}
