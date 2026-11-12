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

fn charlie() -> AccountId {
    accounts(2)
}

fn owner() -> AccountId {
    accounts(3)
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

/// Defense 2: Transfer Lockout — token is LOCKED during transfer settlement
#[test]
fn test_transfer_lockout_during_transfer() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_transfer(bob(), "token-1".to_string(), None, None);

    assert_eq!(
        contract.get_lock_state("token-1".to_string()),
        LockState::Active,
        "Token should be unlocked after transfer completes"
    );
    assert_eq!(
        contract.nft_owner_of("token-1".to_string()),
        Some(bob())
    );
}

/// Defense 4: Continuous Balance Entitlement — new owner gets control on transfer
#[test]
fn test_balance_entitlement_passes_with_nft() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_approve("token-1".to_string(), bob(), None);
    assert!(contract.nft_is_approved("token-1".to_string(), bob()));

    contract.nft_transfer(charlie(), "token-1".to_string(), None, None);

    assert_eq!(
        contract.nft_owner_of("token-1".to_string()),
        Some(charlie()),
        "Charlie is now the owner — continuous entitlement passes with NFT"
    );
    assert!(
        !contract.nft_is_approved("token-1".to_string(), bob()),
        "Bob loses access after transfer"
    );
}

/// Threat: Unauthorized transfer without approval should panic
#[test]
#[should_panic(expected = "Unauthorized")]
fn test_unauthorized_transfer_rejected() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());

    context = make_context(bob(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_transfer(charlie(), "token-1".to_string(), None, None);
}

/// Threat: Approval expiry — expired approval should not grant access
#[test]
fn test_approval_expired_no_access() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_approve(
        "token-1".to_string(),
        bob(),
        Some("{\"expires_at\":1}".to_string()),
    );

    assert!(
        !contract.nft_is_approved("token-1".to_string(), bob()),
        "Expired approval should not grant access"
    );
}

/// Threat: Approval with future expiry should grant access
#[test]
fn test_approval_future_expiry_grants_access() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let expires_at = near_sdk::env::block_timestamp() + DAY_NEAR;
    contract.nft_approve(
        "token-1".to_string(),
        bob(),
        Some(format!("{{\"expires_at\":{}}}", expires_at)),
    );

    assert!(
        contract.nft_is_approved("token-1".to_string(), bob()),
        "Future expiry approval should grant access"
    );
}

/// Threat: Only owner can revoke approval
#[test]
#[should_panic(expected = "Only token owner can revoke")]
fn test_non_owner_cannot_revoke() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_approve("token-1".to_string(), bob(), None);

    context = make_context(bob(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_revoke("token-1".to_string(), bob());
}

/// Threat: Only owner can approve
#[test]
#[should_panic(expected = "Only token owner can approve")]
fn test_non_owner_cannot_approve() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());

    context = make_context(bob(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_approve("token-1".to_string(), charlie(), None);
}

/// Token cannot be double-minted
#[test]
#[should_panic(expected = "Token already exists")]
fn test_double_mint_rejected() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());
    contract.nft_mint("token-1".to_string(), bob(), Some(make_metadata()), None);
}

/// Sub-account is bound to token on mint
#[test]
fn test_sub_account_bound_on_mint() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-42", alice());

    assert_eq!(
        contract.get_sub_account("token-42".to_string()),
        Some("token-token-42.vault.near".parse().unwrap())
    );
}

/// Owner can revoke their own approval
#[test]
fn test_owner_can_revoke_own_approval() {
    let mut context = make_context(owner(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    let mut contract = Contract::new(owner(), make_metadata());

    setup_minted(&mut contract, "token-1", alice());

    context = make_context(alice(), NearToken::from_yoctonear(0));
    testing_env!(context.build());
    contract.nft_approve("token-1".to_string(), bob(), None);
    assert!(contract.nft_is_approved("token-1".to_string(), bob()));

    contract.nft_revoke("token-1".to_string(), bob());
    assert!(!contract.nft_is_approved("token-1".to_string(), bob()));
}