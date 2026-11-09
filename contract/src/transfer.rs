use near_sdk::collections::UnorderedSet;
use near_sdk::{env, near, AccountId, Gas, NearToken, Promise, PromiseOrValue};

use crate::state::{tokens_per_owner_prefix, Contract, ContractExt};
use crate::types::{LockState, PendingTransfer, TokenId};

const GAS_FOR_TRANSFER_CALL: Gas = Gas::from_tgas(25);
const GAS_FOR_RESOLVE_TRANSFER: Gas = Gas::from_tgas(10);

#[near]
impl Contract {
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let sender_id = env::predecessor_account_id();
        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        if sender_id != token.owner_id {
            if let Some(approval_id) = approval_id {
                let approval = token.approvals.get(&sender_id).expect("Not approved");
                assert_eq!(approval.approval_id, approval_id, "Incorrect approval ID");
            } else {
                env::panic_str("Unauthorized");
            }
        }
        let owner_id_for_event = token.owner_id.clone();
        self.token_lock_state.insert(&token_id, &LockState::Locked);
        let mut sender_tokens = self
            .tokens_per_owner
            .get(&token.owner_id)
            .expect("Sender has no tokens");
        sender_tokens.remove(&token_id);
        self.tokens_per_owner
            .insert(&token.owner_id, &sender_tokens);
        let mut receiver_tokens = self
            .tokens_per_owner
            .get(&receiver_id)
            .unwrap_or_else(|| UnorderedSet::new(tokens_per_owner_prefix(&receiver_id)));
        receiver_tokens.insert(&token_id);
        self.tokens_per_owner.insert(&receiver_id, &receiver_tokens);
        let mut updated_token = token;
        updated_token.owner_id = receiver_id.clone();
        self.owner_of.insert(&token_id, &receiver_id);
        self.internal_clear_approvals(&token_id);
        self.token_lock_state.insert(&token_id, &LockState::Active);
        self.tokens_by_id.insert(&token_id, &updated_token);
        let memo_str = memo.as_deref().unwrap_or("");
        let event = format!(
            "{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_transfer\",\"data\":[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":[\"{}\"],\"memo\":\"{}\"}}]}}",
            owner_id_for_event, receiver_id, token_id, memo_str
        );
        env::log_str(&format!("EVENT_JSON:{}", event));
    }

    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let sender_id = env::predecessor_account_id();
        let attached_deposit = env::attached_deposit();

        let token = self.tokens_by_id.get(&token_id).expect("Token not found");

        if sender_id != token.owner_id {
            if let Some(approval_id) = approval_id {
                let approval = token.approvals.get(&sender_id).expect("Not approved");
                assert_eq!(approval.approval_id, approval_id, "Incorrect approval ID");
            } else {
                env::panic_str("Unauthorized");
            }
        }

        // Record pending transfer for callback resolution.
        let pending_id = self.next_pending_id;
        self.next_pending_id += 1;
        let pending = PendingTransfer {
            token_id: token_id.clone(),
            sender_id: sender_id.clone(),
            receiver_id: receiver_id.clone(),
        };
        self.pending_transfers.insert(&pending_id, &pending);

        // Lock token during cross-contract call (threat model defense 2).
        self.token_lock_state.insert(&token_id, &LockState::Locked);

        // Remove from old owner's set.
        let mut sender_tokens = self
            .tokens_per_owner
            .get(&token.owner_id)
            .expect("Sender has no tokens");
        sender_tokens.remove(&token_id);
        self.tokens_per_owner
            .insert(&token.owner_id, &sender_tokens);

        // Temporarily update owner to receiver.
        let mut updated_token = token;
        updated_token.owner_id = receiver_id.clone();
        self.owner_of.insert(&token_id, &receiver_id);
        self.internal_clear_approvals(&token_id);
        self.tokens_by_id.insert(&token_id, &updated_token);

        // Cross-contract call to receiver's nft_on_transfer using raw Promise.
        let current_account_id = env::current_account_id();
        let method_name = "nft_on_transfer".to_string();
        let args = near_sdk::serde_json::to_string(&serde_json::json!({
            "sender_id": sender_id,
            "previous_token_id": token_id,
            "msg": msg,
            "receiver_id": receiver_id,
            "balance": attached_deposit.as_yoctonear()
        }))
        .unwrap();

        Promise::new(receiver_id.clone())
            .function_call(
                method_name,
                args.into_bytes(),
                attached_deposit,
                GAS_FOR_TRANSFER_CALL,
            )
            .then(
                Promise::new(current_account_id).function_call(
                    "nft_resolve_transfer".to_string(),
                    near_sdk::serde_json::to_string(&serde_json::json!({
                        "pending_id": pending_id,
                    }))
                    .unwrap()
                    .into_bytes(),
                    NearToken::from_yoctonear(0),
                    GAS_FOR_RESOLVE_TRANSFER,
                ),
            )
            .detach();

        PromiseOrValue::Value(true)
    }

    pub fn nft_resolve_transfer(&mut self, pending_id: u64) -> bool {
        let pending = self
            .pending_transfers
            .get(&pending_id)
            .expect("Pending transfer not found");
        let token_id = &pending.token_id;
        let sender_id = &pending.sender_id;
        let receiver_id = &pending.receiver_id;

        if env::promise_results_count() == 1 {
            match env::promise_result_checked(0, 1024) {
                Ok(_) => {
                    // Success: transfer is finalized → add token to receiver's set.
                    let mut receiver_tokens = self
                        .tokens_per_owner
                        .get(receiver_id)
                        .unwrap_or_else(|| UnorderedSet::new(tokens_per_owner_prefix(receiver_id)));
                    receiver_tokens.insert(token_id);
                    self.tokens_per_owner.insert(receiver_id, &receiver_tokens);

                    self.token_lock_state.insert(token_id, &LockState::Active);

                    let event = format!(
                        "{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_transfer\",\"data\":[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":[\"{}\"],\"memo\":\"\"}}]}}",
                        sender_id, receiver_id, token_id
                    );
                    env::log_str(&format!("EVENT_JSON:{}", event));

                    self.pending_transfers.remove(&pending_id);
                    true
                }
                _ => {
                    // Failure: roll back → sender gets token back, remove from receiver's set.
                    let mut token = self.tokens_by_id.get(token_id).expect("Token not found");
                    token.owner_id = sender_id.clone();
                    self.owner_of.insert(token_id, sender_id);
                    self.tokens_by_id.insert(token_id, &token);

                    let mut sender_tokens = self
                        .tokens_per_owner
                        .get(sender_id)
                        .unwrap_or_else(|| UnorderedSet::new(tokens_per_owner_prefix(sender_id)));
                    sender_tokens.insert(token_id);
                    self.tokens_per_owner.insert(sender_id, &sender_tokens);

                    let mut receiver_tokens = self
                        .tokens_per_owner
                        .get(receiver_id)
                        .unwrap_or_else(|| UnorderedSet::new(tokens_per_owner_prefix(receiver_id)));
                    receiver_tokens.remove(token_id);
                    self.tokens_per_owner.insert(receiver_id, &receiver_tokens);

                    self.token_lock_state.insert(token_id, &LockState::Active);

                    self.pending_transfers.remove(&pending_id);
                    false
                }
            }
        } else {
            // Unexpected promise count → roll back to sender.
            let mut token = self.tokens_by_id.get(token_id).expect("Token not found");
            token.owner_id = sender_id.clone();
            self.owner_of.insert(token_id, sender_id);
            self.tokens_by_id.insert(token_id, &token);

            let mut sender_tokens = self
                .tokens_per_owner
                .get(sender_id)
                .unwrap_or_else(|| UnorderedSet::new(tokens_per_owner_prefix(sender_id)));
            sender_tokens.insert(token_id);
            self.tokens_per_owner.insert(sender_id, &sender_tokens);

            self.token_lock_state.insert(token_id, &LockState::Active);

            self.pending_transfers.remove(&pending_id);
            false
        }
    }
}
