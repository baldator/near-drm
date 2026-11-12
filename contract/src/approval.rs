use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, Timestamp};

use crate::state::{
    approvals_by_token_prefix, approvals_per_account_prefix, token_approvals_prefix, Contract,
    ContractExt,
};
use crate::types::{Approval, LockState, Token, TokenApproval, TokenId};

/// An approval is active while it has no expiry or its expiry is in the future.
fn is_active_approval(approval: &Approval, now: Timestamp) -> bool {
    approval.expires_at.map_or(true, |expires_at| now < expires_at)
}

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
        // `msg` doubles as the grant payload: it can carry both the deadline
        // and the AES content key wrapped to the recipient's X25519 key.
        let msg_value = msg
            .as_ref()
            .and_then(|m| serde_json::from_str::<serde_json::Value>(m).ok());
        let expires_at = msg_value
            .as_ref()
            .and_then(|v| v.get("expires_at").and_then(|v| v.as_u64()))
            .map(|ts| ts as Timestamp);
        let key_envelope = msg_value
            .as_ref()
            .and_then(|v| v.get("key_envelope"))
            .and_then(|v| v.as_str())
            .map(|value| value.to_owned());
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
            .unwrap_or_else(|| LookupMap::new(token_approvals_prefix(&token_id)));
        token_approvals.insert(&account_id, &approval);
        self.approvals_by_id.insert(&token_id, &token_approvals);
        self.internal_index_approval(&token_id, &account_id);
        if let Some(envelope) = key_envelope {
            assert!(
                self.encryption_keys.get(&account_id).is_some(),
                "Recipient has not registered an encryption key yet"
            );
            self.internal_set_key_envelope(&token_id, &account_id, &envelope);
        }
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
            .unwrap_or_else(|| LookupMap::new(token_approvals_prefix(&token_id)));
        token_approvals.remove(&account_id);
        self.approvals_by_id.insert(&token_id, &token_approvals);
        self.internal_unindex_approval(&token_id, &account_id);
        // Revocation must destroy the wrapped content key, not just the
        // approval flag, so a later request cannot read the envelope.
        self.internal_remove_key_envelope(&token_id, &account_id);
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
        self.internal_is_approved(&token_id, &approved_account_id)
    }

    /// Returns whether `account_id` currently holds an unexpired approval.
    pub(crate) fn internal_is_approved(
        &self,
        token_id: &TokenId,
        account_id: &AccountId,
    ) -> bool {
        match self.tokens_by_id.get(token_id) {
            Some(token) => match token.approvals.get(account_id) {
                Some(approval) => is_active_approval(&approval, env::block_timestamp()),
                None => false,
            },
            None => false,
        }
    }

    /// Returns all active approvals on a token.
    pub fn nft_approvals(&self, token_id: TokenId) -> Vec<Approval> {
        let Some(token) = self.tokens_by_id.get(&token_id) else {
            return vec![];
        };
        let Some(approvers) = self.approvals_by_token.get(&token_id) else {
            return vec![];
        };
        let now = env::block_timestamp();
        approvers
            .iter()
            .filter_map(|account_id| token.approvals.get(&account_id))
            .filter(|approval| is_active_approval(approval, now))
            .collect()
    }

    /// Returns all active approvals granted to an account, across every token.
    pub fn nft_approvals_for_account(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<TokenApproval> {
        let Some(token_ids) = self.approvals_per_account.get(&account_id) else {
            return vec![];
        };
        let now = env::block_timestamp();
        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(100) as usize;
        token_ids
            .iter()
            .filter_map(|token_id| {
                self.tokens_by_id
                    .get(&token_id)
                    .and_then(|token| token.approvals.get(&account_id))
                    .filter(|approval| is_active_approval(approval, now))
                    .map(|approval| TokenApproval { token_id, approval })
            })
            .skip(start)
            .take(limit)
            .collect()
    }

    /// Adds a token -> account and account -> token index entry.
    fn internal_index_approval(&mut self, token_id: &TokenId, account_id: &AccountId) {
        let mut approvers = self
            .approvals_by_token
            .get(token_id)
            .unwrap_or_else(|| UnorderedSet::new(approvals_by_token_prefix(token_id)));
        approvers.insert(account_id);
        self.approvals_by_token.insert(token_id, &approvers);

        let mut token_ids = self
            .approvals_per_account
            .get(account_id)
            .unwrap_or_else(|| UnorderedSet::new(approvals_per_account_prefix(account_id)));
        token_ids.insert(token_id);
        self.approvals_per_account.insert(account_id, &token_ids);
    }

    /// Removes a token -> account and account -> token index entry.
    fn internal_unindex_approval(&mut self, token_id: &TokenId, account_id: &AccountId) {
        if let Some(mut approvers) = self.approvals_by_token.get(token_id) {
            approvers.remove(account_id);
            if approvers.is_empty() {
                self.approvals_by_token.remove(token_id);
            } else {
                self.approvals_by_token.insert(token_id, &approvers);
            }
        }

        if let Some(mut token_ids) = self.approvals_per_account.get(account_id) {
            token_ids.remove(token_id);
            if token_ids.is_empty() {
                self.approvals_per_account.remove(account_id);
            } else {
                self.approvals_per_account.insert(account_id, &token_ids);
            }
        }
    }

    /// Clears all approvals for a token and resets its approval counter.
    pub(crate) fn internal_clear_approvals(&mut self, token_id: &TokenId, token: &mut Token) {
        // Collect first: unindexing mutates the same sets that `iter` reads from.
        let approvers: Vec<AccountId> = match self.approvals_by_token.get(token_id) {
            Some(approvers) => approvers.iter().collect(),
            None => vec![],
        };
        for account_id in approvers {
            token.approvals.remove(&account_id);
            self.internal_unindex_approval(token_id, &account_id);
            self.internal_remove_key_envelope(token_id, &account_id);
        }
        self.approvals_by_id.remove(token_id);
        token.next_approval_id = 0;
    }
}
