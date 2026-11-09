use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{AccountId, Timestamp};

pub type TokenId = String;

/// Metadata for an NFT token.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<Vec<u8>>,
    pub copies: Option<u64>,
    pub issued_at: Option<Timestamp>,
    pub expires_at: Option<Timestamp>,
    pub starts_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub extra: Option<String>,
    pub encrypted: Option<bool>,
    pub access_rules: Option<AccessRules>,
    pub whitelist_root: Option<String>,
    pub sub_account_id: Option<AccountId>,
    pub decryption_key_cid: Option<String>,
    pub royalty_percentage: Option<u16>,
}

/// Access rules governing viewing / decryption of token metadata.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AccessRules {
    pub ttl_hours: Option<u64>,
    pub single_use: Option<bool>,
    pub max_views: Option<u32>,
}

/// Lock state of a token during cross-contract transfers.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum LockState {
    Active,
    Locked,
}

/// An approval granted by a token owner to another account.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Approval {
    pub account_id: AccountId,
    pub approval_id: u64,
    pub expires_at: Option<Timestamp>,
}

/// An NFT token stored in the contract.
#[derive(BorshSerialize, BorshDeserialize)]
pub struct Token {
    pub owner_id: AccountId,
    pub approvals: LookupMap<AccountId, Approval>,
    pub next_approval_id: u64,
}

/// A pending cross-contract transfer awaiting callback resolution.
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct PendingTransfer {
    pub token_id: TokenId,
    pub sender_id: AccountId,
    pub receiver_id: AccountId,
}
