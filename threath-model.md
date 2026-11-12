### Threat Model: Sub-Account & Balance Retention on NFT Transfer

When binding an NEP-171 NFT to an on-chain sub-account (e.g., `token-1.vault.near`) that accrues ticket revenue and treasury yields, the transfer boundary is the most vulnerable attack surface. A malicious or compromised seller will attempt to separate the incoming cash flows, the current liquid balance, or future execution rights from the NFT ownership transfer.

---

#### 1. Attack Vectors & Seller Exploits

##### A. Front-Running & In-Flight Drain (Mempool & Race Conditions)

* **Pre-Transfer Drain:** Seller detects an impending transfer/sale transaction (or lists on a marketplace) and issues a high-gas transaction from the sub-account transferring all accumulated NEAR/FTs to an external wallet right before the NFT transfer resolves.
* **Concurrent Payout Interception:** An event contract distributes a dividend or ticket revenue batch to `token-1.vault.near` simultaneously with the NFT transfer. If payout processing does not lock during transfers, the seller attempts to schedule a transfer of those incoming funds within the same block or epoch before the new owner assumes operational control.

##### B. Residual Key Retention & Full Access Key Hijacking

* **Unrevoked Function Call / Full Access Keys:** The previous owner added a `FullAccess` key or persistent `FunctionCall` key (allowing `transfer`, `call`, or proxy execution) to `token-1.vault.near`. Even if NFT metadata or state updates the designated owner, the seller retains the cryptographic private key to sign transactions directly on the sub-account.
* **Delayed Key Deletion:** If sub-account control is re-keyed via asynchronous NEAR cross-contract calls, a race window exists between `nft_transfer` and the callback that deletes/rotates access keys on the sub-account.

##### C. Cross-Contract Reentrancy & Asynchronous Callback Exploitation

* **State Inconsistency via `nft_transfer_call`:** If `nft_transfer_call` triggers an external receiver that interacts with the treasury sub-account before `nft_resolve_transfer` completes, the seller could trigger re-entrant withdrawals while ownership remains temporarily unresolved.
* **Callback Failure / Atomicity Break:** If key rotation or balance reconciliation fails during the asynchronous resolution step, the NFT transfer might roll back while the sub-account state remains altered, or vice versa (leaving the token transferred but the funds/keys locked or retained by the seller).

##### D. Allowance & Approval Exploits (NEP-178 Leaks)

* **Dangling Spender Allowances:** Before transferring, the seller approves an attacker-controlled contract or secondary account (`nft_approve` or NEP-141 token allowances on the sub-account) to spend tokens or withdraw native balance. If allowances are not purged upon ownership transfer, the spender drains the account post-sale.
* **Front-Running via `approval_id`:** Exploiting mismatched or unincremented `approval_id` values to execute an unauthorized transfer or withdrawal concurrently with marketplace settlement.

##### E. Unclaimed Dividend Redirection

* **Snapshot Arbitrage:** If revenue distribution relies on periodic checkpoints or block snapshots, the seller transfers the NFT immediately after a snapshot is taken, pocketing the dividend payout delivered after the buyer has already paid full market value for the token.

---

#### 2. Defense Mechanisms & Enforcement Rules

1. **Smart Contract-Controlled Sub-Accounts (No Direct Keys):**
* The sub-account `token-X.vault.near` has **zero external keys** (`FullAccess` or user `FunctionCall`). It is controlled exclusively via cross-contract calls dispatched by the root NEP-171 contract (`vault.near`), where `predecessor_account_id == root_contract`.
* User interactions (withdrawals, claims, access) must route through the root contract, which validates `tokens_per_owner` or token holder status in real-time. Transferring the NFT immediately cuts off the caller's execution path without requiring on-chain key deletion.


2. **Transfer Lockout & Settlement Isolation:**
* During an ongoing `nft_transfer` or `nft_transfer_call` execution cycle, the token state is set to `LOCKED`.
* Any incoming dividend or withdrawal request touching `token-X` during this window is queued or rejected until `nft_resolve_transfer` successfully executes and commits the new owner ID.


3. **Atomic State & Clearance of Spender Allowances:**
* Upon ownership transfer, the contract clears all NEP-178 approvals (`approvals.clear()`) and wipes any active delegation or pending distribution claims registered under the previous owner.
* `next_approval_id` is strictly incremented to invalidate any pre-signed or in-flight approval operations.


4. **Continuous Balance Entitlement:**
* Balance belongs strictly to the **current token holder at the moment of withdrawal execution**, not when funds arrived. Any unwithdrawn balance remaining in `token-X.vault.near` instantly reflects in the portfolio of the new owner upon state write.



---

Please review the threat model above. Once you confirm with your **OK**, I will proceed with the architecture documentation and full code implementation according to the requirements.

---

### Content Encryption & Confidential Key Delivery

1. **Public ciphertext, confidential key:** The IPFS object is AES-256-GCM ciphertext. An attacker who downloads it learns nothing without the per-token content key.
2. **Unapproved accounts cannot obtain keys:** `get_key_envelope` returns an envelope only when the queried account owns the token or has an unexpired NEP-178 approval. Anyone else receives `None`.
3. **Envelope theft is not useful:** An envelope is encrypted to the recipient's X25519 public key, whose secret is derived through NEAR MPC CKD and never stored on-chain or in IPFS. Copying an envelope does not let a third party open it.
4. **Revocation is destructive:** `nft_revoke`, approval clearing, and transfers delete the recipient's envelope. An expired approval also fails `internal_is_approved`, so its envelope is unreachable even before physical deletion.
5. **Token binding:** AES-GCM uses `AAD = "{contract}:{token_id}:v1"` for both content and envelope encryption. A ciphertext or envelope cannot be replayed under a different token ID.
6. **Owner-only delivery:** `set_key_envelope` is restricted to the token owner and to recipients that are the owner or actively approved. It also requires the recipient to have registered an X25519 public key.
7. **Minting is atomic:** `nft_mint` accepts `owner_envelope`, so a token cannot end up owned but permanently undecryptable because a second transaction failed.
8. **CKD verification:** The client checks `e(S, G2) == e(H(mpc_pk || app_id), mpc_pk)` before using a derived key, rejecting a malicious or misconfigured MPC response.