use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LazyOption, LookupMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, Timestamp};

const GAS_FOR_TRANSFER_CALL: Gas = Gas::from_tgas(25);
const GAS_FOR_RESOLVE_TRANSFER: Gas = Gas::from_tgas(10);
// const DAY_NEAR: Timestamp = 86_400_000_000_000;
// const NO_DEPOSIT: u128 = 0;

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    TokensPerOwner, TokensById, TokenMetadataById, ApprovalsById,
    TokenLockState, Metadata, SubAccounts, OwnerOf,
    PendingTransfers,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct TokenMetadata {
    pub title: Option<String>, pub description: Option<String>, pub media: Option<String>,
    pub media_hash: Option<Vec<u8>>, pub copies: Option<u64>,
    pub issued_at: Option<Timestamp>, pub expires_at: Option<Timestamp>,
    pub starts_at: Option<Timestamp>, pub updated_at: Option<Timestamp>,
    pub extra: Option<String>, pub encrypted: Option<bool>,
    pub access_rules: Option<AccessRules>, pub whitelist_root: Option<String>,
    pub sub_account_id: Option<AccountId>, pub decryption_key_cid: Option<String>,
    pub royalty_percentage: Option<u16>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct AccessRules {
    pub ttl_hours: Option<u64>, pub single_use: Option<bool>, pub max_views: Option<u32>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub enum LockState { Active, Locked }

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Approval {
    pub account_id: AccountId, pub approval_id: u64, pub expires_at: Option<Timestamp>,
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct Token {
    pub owner_id: AccountId,
    pub approvals: LookupMap<AccountId, Approval>,
    pub next_approval_id: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct PendingTransfer {
    pub token_id: TokenId,
    pub sender_id: AccountId,
    pub receiver_id: AccountId,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
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

type TokenId = String;

impl Contract {
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
        };
        this.metadata.set(&metadata);
        this
    }

    pub fn nft_metadata(&self) -> TokenMetadata { self.metadata.get().unwrap() }

    fn internal_mint(&mut self, token_id: TokenId, owner_id: AccountId, metadata: Option<TokenMetadata>) {
        assert!(self.tokens_by_id.get(&token_id).is_none(), "Token already exists");
        let mut owner_tokens = self.tokens_per_owner.get(&owner_id).unwrap_or_else(|| UnorderedSet::new(StorageKey::TokensPerOwner));
        let token = Token { owner_id: owner_id.clone(), approvals: LookupMap::new(StorageKey::ApprovalsById), next_approval_id: 0 };
        self.tokens_by_id.insert(&token_id, &token);
        self.owner_of.insert(&token_id, &owner_id);
        if let Some(meta) = &metadata { self.token_metadata_by_id.insert(&token_id, meta); }
        owner_tokens.insert(&token_id);
        self.tokens_per_owner.insert(&owner_id, &owner_tokens);
        self.token_lock_state.insert(&token_id, &LockState::Active);
        self.total_supply += 1;
    }

    pub fn nft_mint(&mut self, token_id: TokenId, owner_id: AccountId, metadata: Option<TokenMetadata>) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "Only owner can mint");
        self.internal_mint(token_id.clone(), owner_id.clone(), metadata.clone());
        let sub_account_id = format!("token-{}.vault.near", token_id);
        let sub_account_id_parsed: AccountId = sub_account_id.parse().expect("Invalid sub-account ID");
        self.sub_accounts.insert(&token_id, &sub_account_id_parsed);
        if let Some(meta) = metadata { self.emit_metadata_update_event(&token_id, &meta); }
    }

    pub fn nft_approve(&mut self, token_id: TokenId, account_id: AccountId, msg: Option<String>) -> Option<U128> {
        let owner = self.owner_of.get(&token_id).expect("Token not found");
        assert_eq!(env::predecessor_account_id(), owner, "Only token owner can approve");
        let lock_state = self.token_lock_state.get(&token_id).unwrap_or(LockState::Active);
        assert_eq!(lock_state, LockState::Active, "Token is locked during transfer");
        let approval_id = self.next_approval_id;
        self.next_approval_id += 1;
        let expires_at = msg.as_ref().and_then(|m| serde_json::from_str::<serde_json::Value>(m).ok()).and_then(|v| v.get("expires_at").and_then(|v| v.as_u64())).map(|ts| ts as Timestamp);
        let approval = Approval { account_id: account_id.clone(), approval_id, expires_at };
        let mut token = self.tokens_by_id.get(&token_id).expect("Token not found");
        token.approvals.insert(&account_id, &approval);
        token.next_approval_id = approval_id + 1;
        self.tokens_by_id.insert(&token_id, &token);
        let mut token_approvals = self.approvals_by_id.get(&token_id).unwrap_or_else(|| LookupMap::new(StorageKey::ApprovalsById));
        token_approvals.insert(&account_id, &approval);
        self.approvals_by_id.insert(&token_id, &token_approvals);
        let expires_at_str = expires_at.map(|t| t.to_string()).unwrap_or_else(|| "none".to_string());
        let owner_id_for_event = self.owner_of.get(&token_id).unwrap_or_else(|| env::current_account_id());
        let event = format!("{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_approve\",\"data\":[{{\"token_id\":\"{}\",\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"memo\":{{\"expires_at\":{}}}}}]}}", token_id, owner_id_for_event, account_id, expires_at_str);
        env::log_str(&format!("EVENT_JSON:{}", event));
        Some(U128(approval_id as u128))
    }

    pub fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        let owner = self.owner_of.get(&token_id).expect("Token not found");
        assert_eq!(env::predecessor_account_id(), owner, "Only token owner can revoke");
        let mut token = self.tokens_by_id.get(&token_id).expect("Token not found");
        assert!(token.approvals.get(&account_id).is_some(), "No approval for this account");
        token.approvals.remove(&account_id);
        self.tokens_by_id.insert(&token_id, &token);
        let mut token_approvals = self.approvals_by_id.get(&token_id).unwrap_or_else(|| LookupMap::new(StorageKey::ApprovalsById));
        token_approvals.remove(&account_id);
        self.approvals_by_id.insert(&token_id, &token_approvals);
        let owner_id_for_event = self.owner_of.get(&token_id).unwrap_or_else(|| env::current_account_id());
        let event = format!("{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_revoke\",\"data\":[{{\"token_id\":\"{}\",\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"memo\":{{\"revoked\":true}}}}]}}", token_id, owner_id_for_event, account_id);
        env::log_str(&format!("EVENT_JSON:{}", event));
    }

    pub fn nft_is_approved(&self, token_id: TokenId, approved_account_id: AccountId) -> bool {
        match self.tokens_by_id.get(&token_id) {
            Some(token) => match token.approvals.get(&approved_account_id) {
                Some(approval) => {
                    if let Some(expires_at) = approval.expires_at {
                        if env::block_timestamp() >= expires_at { return false; }
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

    fn internal_clear_approvals(&mut self, token_id: &TokenId) {
        self.approvals_by_id.remove(token_id);
        let mut token = self.tokens_by_id.get(token_id).expect("Token not found");
        token.next_approval_id = 0;
        self.tokens_by_id.insert(token_id, &token);
    }

    pub fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        let sender_id = env::predecessor_account_id();
        let token = self.tokens_by_id.get(&token_id).expect("Token not found");
        if sender_id != token.owner_id {
            if let Some(approval_id) = approval_id {
                let approval = token.approvals.get(&sender_id).expect("Not approved");
                assert_eq!(approval.approval_id, approval_id, "Incorrect approval ID");
            } else { env::panic_str("Unauthorized"); }
        }
        let owner_id_for_event = token.owner_id.clone();
        self.token_lock_state.insert(&token_id, &LockState::Locked);
        let mut sender_tokens = self.tokens_per_owner.get(&token.owner_id).expect("Sender has no tokens");
        sender_tokens.remove(&token_id);
        self.tokens_per_owner.insert(&token.owner_id, &sender_tokens);
        let mut receiver_tokens = self.tokens_per_owner.get(&receiver_id).unwrap_or_else(|| UnorderedSet::new(StorageKey::TokensPerOwner));
        receiver_tokens.insert(&token_id);
        self.tokens_per_owner.insert(&receiver_id, &receiver_tokens);
        let mut updated_token = token;
        updated_token.owner_id = receiver_id.clone();
        self.owner_of.insert(&token_id, &receiver_id);
        self.internal_clear_approvals(&token_id);
        self.token_lock_state.insert(&token_id, &LockState::Active);
        self.tokens_by_id.insert(&token_id, &updated_token);
        let memo_str = memo.as_deref().unwrap_or("");
        let event = format!("{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_transfer\",\"data\":[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":[\"{}\"],\"memo\":\"{}\"}}]}}", owner_id_for_event, receiver_id, token_id, memo_str);
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

        // Record pending transfer for callback resolution
        let pending_id = self.next_pending_id;
        self.next_pending_id += 1;
        let pending = PendingTransfer {
            token_id: token_id.clone(),
            sender_id: sender_id.clone(),
            receiver_id: receiver_id.clone(),
        };
        self.pending_transfers.insert(&pending_id, &pending);

        // Lock token during cross-contract call (threat model defense 2)
        self.token_lock_state.insert(&token_id, &LockState::Locked);

        // Remove from old owner's set
        let mut sender_tokens = self.tokens_per_owner.get(&token.owner_id).expect("Sender has no tokens");
        sender_tokens.remove(&token_id);
        self.tokens_per_owner.insert(&token.owner_id, &sender_tokens);

        // Temporarily update owner to receiver
        let mut updated_token = token;
        updated_token.owner_id = receiver_id.clone();
        self.owner_of.insert(&token_id, &receiver_id);
        self.internal_clear_approvals(&token_id);
        self.tokens_by_id.insert(&token_id, &updated_token);

        // Cross-contract call to receiver's nft_on_transfer using raw Promise
        let current_account_id = env::current_account_id();
        let method_name = "nft_on_transfer".to_string();
        let args = near_sdk::serde_json::to_string(&serde_json::json!({
            "sender_id": sender_id,
            "previous_token_id": token_id,
            "msg": msg,
            "receiver_id": receiver_id,
            "balance": attached_deposit.as_yoctonear()
        })).unwrap();

        Promise::new(receiver_id.clone())
            .function_call(method_name, args.into_bytes(), attached_deposit, GAS_FOR_TRANSFER_CALL)
            .then(
                Promise::new(current_account_id)
                    .function_call(
                        "nft_resolve_transfer".to_string(),
                        near_sdk::serde_json::to_string(&serde_json::json!({
                            "pending_id": pending_id,
                        })).unwrap().into_bytes(),
                        NearToken::from_yoctonear(0),
                        GAS_FOR_RESOLVE_TRANSFER,
                    )
            )
            .detach();

        PromiseOrValue::Value(true)
    }

    pub fn nft_resolve_transfer(
        &mut self,
        pending_id: u64,
    ) -> bool {
        let pending = self.pending_transfers.get(&pending_id).expect("Pending transfer not found");
        let token_id = &pending.token_id;
        let sender_id = &pending.sender_id;
        let receiver_id = &pending.receiver_id;

        if env::promise_results_count() == 1 {
            match env::promise_result_checked(0, 1024) {
                Ok(_) => {
                    // Success: transfer is finalized
                    let mut receiver_tokens = self
                        .tokens_per_owner
                        .get(receiver_id)
                        .unwrap_or_else(|| UnorderedSet::new(StorageKey::TokensPerOwner));
                    receiver_tokens.insert(token_id);
                    self.tokens_per_owner.insert(receiver_id, &receiver_tokens);

                    self.token_lock_state.insert(token_id, &LockState::Active);

                    let event = format!("{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_transfer\",\"data\":[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":[\"{}\"],\"memo\":\"\"}}]}}", sender_id, receiver_id, token_id);
                    env::log_str(&format!("EVENT_JSON:{}", event));

                    self.pending_transfers.remove(&pending_id);
                    true
                }
                _ => {
                    // Failure: roll back transfer
                    let mut token = self.tokens_by_id.get(token_id).expect("Token not found");
                    token.owner_id = sender_id.clone();
                    self.owner_of.insert(token_id, &sender_id);

                    let mut sender_tokens = self
                        .tokens_per_owner
                        .get(sender_id)
                        .unwrap_or_else(|| UnorderedSet::new(StorageKey::TokensPerOwner));
                    sender_tokens.insert(token_id);
                    self.tokens_per_owner.insert(sender_id, &sender_tokens);

                    let mut receiver_tokens = self
                        .tokens_per_owner
                        .get(receiver_id)
                        .unwrap_or_else(|| UnorderedSet::new(StorageKey::TokensPerOwner));
                    receiver_tokens.remove(token_id);
                    self.tokens_per_owner.insert(receiver_id, &receiver_tokens);

                    self.token_lock_state.insert(token_id, &LockState::Active);
                    self.tokens_by_id.insert(token_id, &token);

                    self.pending_transfers.remove(&pending_id);
                    false
                }
            }
        } else {
            // Unexpected - roll back
            let mut token = self.tokens_by_id.get(token_id).expect("Token not found");
            token.owner_id = sender_id.clone();
            self.owner_of.insert(token_id, &sender_id);

            let mut sender_tokens = self
                .tokens_per_owner
                .get(sender_id)
                .unwrap_or_else(|| UnorderedSet::new(StorageKey::TokensPerOwner));
            sender_tokens.insert(token_id);
            self.tokens_per_owner.insert(sender_id, &sender_tokens);

            self.token_lock_state.insert(token_id, &LockState::Active);
            self.tokens_by_id.insert(token_id, &token);

            self.pending_transfers.remove(&pending_id);
            false
        }
    }

    pub fn nft_total_supply(&self) -> U128 { U128(self.total_supply as u128) }
    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(self.tokens_per_owner.get(&account_id).map(|t| t.len() as u128).unwrap_or(0))
    }
    pub fn nft_owner_of(&self, token_id: TokenId) -> Option<AccountId> { self.owner_of.get(&token_id) }
    pub fn nft_token(&self, token_id: TokenId) -> Option<TokenMetadata> { self.token_metadata_by_id.get(&token_id) }
    pub fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<TokenId> {
        match self.tokens_per_owner.get(&account_id) {
            Some(tokens) => {
                let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
                let limit = limit.unwrap_or(100) as usize;
                tokens.iter().skip(start).take(limit).collect()
            }
            None => vec![],
        }
    }
    pub fn get_sub_account(&self, token_id: TokenId) -> Option<AccountId> { self.sub_accounts.get(&token_id) }
    pub fn get_lock_state(&self, token_id: TokenId) -> LockState { self.token_lock_state.get(&token_id).unwrap_or(LockState::Active) }

    fn emit_metadata_update_event(&self, token_id: &TokenId, metadata: &TokenMetadata) {
        let meta_json = serde_json::to_string(metadata).unwrap_or_else(|_| "{}".to_string());
        let event = format!("{{\"standard\":\"nep171\",\"version\":\"1.0.0\",\"event\":\"nft_metadata_update\",\"data\":[{{\"token_id\":\"{}\",\"metadata\":{}}}]}}", token_id, meta_json);
        env::log_str(&format!("EVENT_JSON:{}", event));
    }
}








