use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};
use near_sdk::json_types::U128;

use crate::*;

fn alice() -> AccountId {
    accounts(0)
}

fn bob() -> AccountId {
    accounts(1)
}

fn owner() -> AccountId {
    accounts(2)
}

fn make_metadata() -> TokenMetadata {
    TokenMetadata {
        title: Some("Test NFT".to_string()),
        description: Some("A test DRM NFT".to_string()),
        media: Some("ipfs://QmTestCID".to_string()),
        media_hash: None,
        copies: Some(1),
        issued_at: None,
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: None,
        encrypted: Some(true),
        access_rules: Some(AccessRules {
            ttl_hours: Some(24),
            single_use: Some(true),
            max_views: Some(1),
        }),
        whitelist_root: Some("0x1234".to_string()),
        sub_account_id: None,
        decryption_key_cid: None,
        royalty_percentage: Some(1000),
    }
}

fn make_context(predecessor: AccountId, attached: NearToken) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.predecessor_account_id(predecessor);
    builder.attached_deposit(attached);
    builder
}

#[test]
fn test_mint_and_owner() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    contract.nft_mint("token-1".to_string(), alice(), Some(make_metadata()));

    assert_eq!(
        contract.nft_owner_of("token-1".to_string()),
        Some(alice())
    );
    assert_eq!(
        contract.get_sub_account("token-1".to_string()),
        Some("token-token-1.vault.near".parse().unwrap())
    );
}

#[test]
fn test_transfer_path() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    contract.nft_mint("token-1".to_string(), alice(), Some(make_metadata()));
    assert_eq!(contract.nft_owner_of("token-1".to_string()), Some(alice()));

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_transfer(bob(), "token-1".to_string(), None, None);

    assert_eq!(contract.nft_owner_of("token-1".to_string()), Some(bob()));
    assert_eq!(
        contract.get_lock_state("token-1".to_string()),
        LockState::Active
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_transfer_unauthorized() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    contract.nft_mint("token-1".to_string(), alice(), Some(make_metadata()));

    context = make_context(bob(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_transfer(accounts(3), "token-1".to_string(), None, None);
}

#[test]
fn test_approval_and_revoke() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    contract.nft_mint("token-1".to_string(), alice(), Some(make_metadata()));

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let expires_at = near_sdk::env::block_timestamp() + DAY_NEAR;
    contract.nft_approve(
        "token-1".to_string(),
        bob(),
        Some(format!("{{\"expires_at\":{}}}", expires_at)),
    );

    assert!(contract.nft_is_approved("token-1".to_string(), bob()));

    contract.nft_revoke("token-1".to_string(), bob());
    assert!(!contract.nft_is_approved("token-1".to_string(), bob()));
}

#[test]
fn test_approval_expiry() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    contract.nft_mint("token-1".to_string(), alice(), Some(make_metadata()));

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_approve(
        "token-1".to_string(),
        bob(),
        Some("{\"expires_at\":1}".to_string()),
    );

    assert!(!contract.nft_is_approved("token-1".to_string(), bob()));
}

#[test]
fn test_transfer_clears_approvals() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    contract.nft_mint("token-1".to_string(), alice(), Some(make_metadata()));

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_approve("token-1".to_string(), bob(), None);
    assert!(contract.nft_is_approved("token-1".to_string(), bob()));

    let charlie = accounts(3);
    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_transfer(charlie, "token-1".to_string(), None, None);

    assert!(!contract.nft_is_approved("token-1".to_string(), bob()));
    assert_eq!(contract.nft_owner_of("token-1".to_string()), Some(charlie));
}

#[test]
fn test_nft_total_supply() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    assert_eq!(contract.nft_total_supply(), U128(0));

    contract.nft_mint("token-1".to_string(), alice(), Some(make_metadata()));
    contract.nft_mint("token-2".to_string(), bob(), Some(make_metadata()));

    assert_eq!(contract.nft_total_supply(), U128(2));
}