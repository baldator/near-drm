use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, Timestamp};

use crate::state::{Contract, StorageKey};
use crate::types::{Approval, LockState, TokenId};

#[near]
impl Contract {
    pub fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<U128> {
        let owner = self.owner_of.get(&token_id).expect("Token not found");
        assert_eq!(
            env::predecessor_account_id(),
            owner,
            "Only token owner can approve"
        );
        let lock_state = self
            .token_lock_state
            .get(&token_id)
            .unwrap_or(LockState::Active);
        assert_eq!(
            lock_state,
            LockState::Active,
            "Token is locked during transfer"
        );
        let approval_id = self.next_approval_id;
        self.next_approval_id += 1;
        let expires_at = msg
            .as_ref()
            .and_then(|m| serde_json::from_str::<serde_json::Value>(m).ok())
            .and_then(|v| v.get("expires_at").and_then(|v| v.as_u64()))
            .map(|ts| ts as Timestamp);
        let approval = Approval {
            account_id: account_id.clone(),
            approval_id,
            expires_at,
        };
        let mut token = self.tokens_by_id.get(&token_id).expect("Token not found");
        token.approvals.insert(&account_id, &approval);
        token.next_approval_id = approval_id + 1;
        self.tokens_by_id.insert(&token_id, &token);
        let mut token_approvals = self
            .approvals_by_id
            .get(&token_id)
            .unwrap_or_else(|| LookupMap::new(StorageKey::ApprovalsById));
        token_approvals.insert(&account_id, &approval);
        self.approvals_by_id.insert(&token_id, &token_approvals);
        let expires_at_str = expires_at
            .map(|t| t.to_string())
            .unwrap_or_else(|| "none".to_string());
        let owner_id_for_event = self
            .owner_of
            .get(&token_id)
            .unwrap_or_else(|| env::current_account_id());
        let event = format!(
            "{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_approve\",\"data\":[{{\"token_id\":\"{}\",\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"memo\":{{\"expires_at\":{}}}}}]}}",
            token_id, owner_id_for_event, account_id, expires_at_str
        );
        env::log_str(&format!("EVENT_JSON:{}", event));
        Some(U128(approval_id as u128))
    }

    pub fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        let owner = self.owner_of.get(&token_id).expect("Token not found");
        assert_eq!(
            env::predecessor_account_id(),
            owner,
            "Only token owner can revoke"
        );
        let mut token = self.tokens_by_id.get(&token_id).expect("Token not found");
        assert!(
            token.approvals.get(&account_id).is_some(),
            "No approval for this account"
        );
        token.approvals.remove(&account_id);
        self.tokens_by_id.insert(&token_id, &token);
        let mut token_approvals = self
            .approvals_by_id
            .get(&token_id)
            .unwrap_or_else(|| LookupMap::new(StorageKey::ApprovalsById));
        token_approvals.remove(&account_id);
        self.approvals_by_id.insert(&token_id, &token_approvals);
        let owner_id_for_event = self
            .owner_of
            .get(&token_id)
            .unwrap_or_else(|| env::current_account_id());
        let event = format!(
            "{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_revoke\",\"data\":[{{\"token_id\":\"{}\",\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"memo\":{{\"revoked\":true}}}}]}}",
            token_id, owner_id_for_event, account_id
        );
        env::log_str(&format!("EVENT_JSON:{}", event));
    }

    pub fn nft_is_approved(&self, token_id: TokenId, approved_account_id: AccountId) -> bool {
        match self.tokens_by_id.get(&token_id) {
            Some(token) => match token.approvals.get(&approved_account_id) {
                Some(approval) => {
                    if let Some(expires_at) = approval.expires_at {
                        if env::block_timestamp() >= expires_at {
                            return false;
                        }
                    }
                    true
                }
                None => false,
            },
            None => false,
        }
    }

    pub fn nft_approvals(&self, _token_id: TokenId) -> Vec<Approval> {
        vec![]
    }

    /// Clears all approvals for a token and resets its approval counter.
    fn internal_clear_approvals(&mut self, token_id: &TokenId) {
        self.approvals_by_id.remove(token_id);
        let mut token = self.tokens_by_id.get(token_id).expect("Token not found");
        token.next_approval_id = 0;
        self.tokens_by_id.insert(token_id, &token);
    }
}
