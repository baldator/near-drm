use near_sdk::collections::LookupMap;
use near_sdk::{env, near, AccountId};

use crate::state::{token_key_envelopes_prefix, Contract, ContractExt};
use crate::types::TokenId;

/// On-chain key delivery for the DRM demo.
///
/// Content is encrypted with a random AES-256-GCM key. That key is wrapped to
/// each recipient's X25519 public key and the resulting envelope is stored
/// here. The X25519 secret is derived from NEAR MPC CKD by the recipient and
/// is never written on-chain.
#[near]
impl Contract {
    /// Registers (or rotates) the caller's X25519 public key.
    ///
    /// The key is the base64 encoding of the 32-byte public key. It is not a
    /// secret, but the caller must control the account so that other people
    /// cannot redirect envelopes to a key they do not own.
    pub fn set_encryption_key(&mut self, x25519_public_key: String) {
        let account_id = env::predecessor_account_id();
        assert_eq!(
            x25519_public_key.len(),
            44,
            "Encryption key must be a base64-encoded 32-byte X25519 public key"
        );
        self.encryption_keys.insert(&account_id, &x25519_public_key);
    }

    /// Returns an account's registered X25519 public key, if any.
    pub fn get_encryption_key(&self, account_id: AccountId) -> Option<String> {
        self.encryption_keys.get(&account_id)
    }

    /// Returns the caller-visible envelope for `account_id`.
    ///
    /// The envelope is only returned while the account owns the token or has
    /// an active approval. The envelope itself is encrypted to that account, so
    /// even if it is observed by someone else it cannot be opened without the
    /// matching CKD-derived secret.
    pub fn get_key_envelope(&self, token_id: TokenId, account_id: AccountId) -> Option<String> {
        let owner = self.owner_of.get(&token_id)?;
        if account_id != owner && !self.internal_is_approved(&token_id, &account_id) {
            return None;
        }
        self.token_key_envelopes
            .get(&token_id)
            .and_then(|envelopes| envelopes.get(&account_id))
    }

    /// Owner-only fallback for delivering an envelope after approval.
    ///
    /// `nft_approve` can already carry an envelope in its `msg`, but this
    /// method is useful when an envelope needs to be replaced or re-sent.
    pub fn set_key_envelope(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        envelope: String,
    ) {
        let owner = self.owner_of.get(&token_id).expect("Token not found");
        assert_eq!(
            env::predecessor_account_id(),
            owner,
            "Only the token owner can deliver keys"
        );
        assert!(
            account_id == owner || self.internal_is_approved(&token_id, &account_id),
            "Recipient is not approved for this token"
        );
        assert!(
            self.encryption_keys.get(&account_id).is_some(),
            "Recipient has not registered an encryption key"
        );
        self.internal_set_key_envelope(&token_id, &account_id, &envelope);
    }

    pub(crate) fn internal_set_key_envelope(
        &mut self,
        token_id: &TokenId,
        account_id: &AccountId,
        envelope: &str,
    ) {
        let mut envelopes = self
            .token_key_envelopes
            .get(token_id)
            .unwrap_or_else(|| LookupMap::new(token_key_envelopes_prefix(token_id)));
        envelopes.insert(account_id, &envelope.to_owned());
        self.token_key_envelopes.insert(token_id, &envelopes);
    }

    pub(crate) fn internal_remove_key_envelope(
        &mut self,
        token_id: &TokenId,
        account_id: &AccountId,
    ) {
        if let Some(mut envelopes) = self.token_key_envelopes.get(token_id) {
            envelopes.remove(account_id);
            self.token_key_envelopes.insert(token_id, &envelopes);
        }
    }

    /// Reads an envelope without an access check. Only for internal use during
    /// transfers, where the caller has already been authorised.
    pub(crate) fn internal_take_key_envelope(
        &self,
        token_id: &TokenId,
        account_id: &AccountId,
    ) -> Option<String> {
        self.token_key_envelopes
            .get(token_id)
            .and_then(|envelopes| envelopes.get(account_id))
    }
}
