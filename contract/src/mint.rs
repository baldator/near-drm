use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::{env, near, AccountId};

use crate::state::{tokens_per_owner_prefix, Contract, StorageKey};
use crate::types::{LockState, TokenId, TokenMetadata};

#[near]
impl Contract {
    /// Internal helper that mints a token without any access checks.
    /// Used by `nft_mint` (and potentially other internal callers).
    fn internal_mint(
        &mut self,
        token_id: TokenId,
        owner_id: AccountId,
        metadata: Option<TokenMetadata>,
    ) {
        assert!(
            self.tokens_by_id.get(&token_id).is_none(),
            "Token already exists"
        );
        let mut owner_tokens = self
            .tokens_per_owner
            .get(&owner_id)
            .unwrap_or_else(|| UnorderedSet::new(tokens_per_owner_prefix(&owner_id)));
        let token = crate::types::Token {
            owner_id: owner_id.clone(),
            approvals: LookupMap::new(StorageKey::ApprovalsById),
            next_approval_id: 0,
        };
        self.tokens_by_id.insert(&token_id, &token);
        self.owner_of.insert(&token_id, &owner_id);
        if let Some(meta) = &metadata {
            self.token_metadata_by_id.insert(&token_id, meta);
        }
        owner_tokens.insert(&token_id);
        self.tokens_per_owner.insert(&owner_id, &owner_tokens);
        self.token_lock_state.insert(&token_id, &LockState::Active);
        self.total_supply += 1;
    }

    /// Mints a new NFT token.
    ///
    /// Any caller may mint a token; the `owner_id` argument designates who owns the minted token.
    /// A vault sub-account `token-{token_id}.vault.near` is created for the token.
    pub fn nft_mint(
        &mut self,
        token_id: TokenId,
        owner_id: AccountId,
        metadata: Option<TokenMetadata>,
    ) {
        self.internal_mint(token_id.clone(), owner_id.clone(), metadata.clone());
        let sub_account_id = format!("token-{}.vault.near", token_id);
        let sub_account_id_parsed: AccountId =
            sub_account_id.parse().expect("Invalid sub-account ID");
        self.sub_accounts.insert(&token_id, &sub_account_id_parsed);
        if let Some(meta) = metadata {
            self.emit_metadata_update_event(&token_id, &meta);
        }
    }

    /// Emits an NFT metadata update event to the contract logs.
    fn emit_metadata_update_event(&self, token_id: &TokenId, metadata: &TokenMetadata) {
        let meta_json = serde_json::to_string(metadata).unwrap_or_else(|_| "{}".to_string());
        let event = format!(
            "{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_metadata_update\",\"data\":[{{\"token_id\":\"{}\",\"metadata\":{}}}]}}",
            token_id, meta_json
        );
        env::log_str(&format!("EVENT_JSON:{}", event));
    }
}
