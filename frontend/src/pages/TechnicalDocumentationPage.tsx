import React from 'react';
import { Link } from 'react-router-dom';
import { DocToc } from '../components/DocToc';

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'standards', label: 'NEP standards' },
  { id: 'metadata', label: 'Metadata schema' },
  { id: 'lifecycle', label: 'Access lifecycle' },
  { id: 'purchase', label: 'Atomic purchase' },
  { id: 'events', label: 'Events' },
  { id: 'security', label: 'Security model' },
  { id: 'api', label: 'API reference' },
  { id: 'implementation', label: 'Implementation' },
];

const ARCHITECTURE = [
  {
    icon: '📜',
    title: 'Smart contract',
    text: 'A NEP-171 NFT contract mints tokens, stores metadata, and manages NEP-178 approvals that represent decryption access.',
  },
  {
    icon: '🔐',
    title: 'Encrypted payload',
    text: 'The file is encrypted client-side and stored on IPFS or Arweave. Only the content identifier (CID) and access rules reach the chain.',
  },
  {
    icon: '🏦',
    title: 'Vault sub-account',
    text: 'Each token maps to token-{id}.vault.near. The sub-account has no external keys and holds licensing revenue for the current owner.',
  },
  {
    icon: '🧩',
    title: 'Threshold key derivation',
    text: 'Decryption keys are derived through NEAR MPC Confidential Key Derivation and released only when the contract state authorizes it.',
  },
];

const STANDARDS = [
  {
    icon: '🪙',
    title: 'NEP-171',
    text: 'Core non-fungible token standard: minting, ownership, transfers, and event emission.',
  },
  {
    icon: '🏷',
    title: 'NEP-177',
    text: 'Metadata standard extended with encryption flags, access rules, royalties, and vault bindings.',
  },
  {
    icon: '✅',
    title: 'NEP-178',
    text: 'Approval management, reused as the access grant. Approvals carry an optional expiry timestamp.',
  },
  {
    icon: '📣',
    title: 'NEP-171 events',
    text: 'Standard events such as nft_approve and nft_revoke let off-chain key services react in real time.',
  },
];

const METADATA_ROWS = [
  ['title / description', 'string', 'Human-readable listing information.'],
  ['media', 'string', 'CID of the encrypted file (ipfs://… or https://…).'],
  ['encrypted', 'bool', 'Marks the payload as protected at rest.'],
  [
    'access_rules',
    'object',
    '{ ttl_hours, single_use, max_views } — the window and usage limit for a grant.',
  ],
  ['whitelist_root', 'string | null', 'Optional Merkle root for allow-listed wallets.'],
  ['sub_account_id', 'AccountId', 'token-{id}.vault.near revenue account.'],
  [
    'decryption_key_cid',
    'string | null',
    'Reference to the key material managed by the key service.',
  ],
  [
    'royalty_percentage',
    'u16',
    'Resale royalty in basis points (1000 = 10%).',
  ],
];

const LIFECYCLE = [
  {
    title: 'Mint',
    text: 'The creator mints an NFT whose metadata records the encrypted CID, access rules, royalty, and vault sub-account.',
  },
  {
    title: 'Grant',
    text: 'The owner calls nft_approve for a buyer. The optional msg carries expires_at (nanoseconds) and ttl_hours.',
  },
  {
    title: 'Verify',
    text: 'nft_is_approved checks the approval and its expiry on-chain. The key service consumes the same state before releasing a key.',
  },
  {
    title: 'Decrypt',
    text: 'The buyer fetches the protected file, presents the grant, and decrypts in memory inside the browser.',
  },
  {
    title: 'Expire',
    text: 'When the window closes, the approval stops validating. No password rotation or file takedown is required.',
  },
  {
    title: 'Revoke',
    text: 'The owner can call nft_revoke at any time. The access ends immediately and an nft_revoke event is emitted.',
  },
];

const PURCHASE_FLOW = [
  {
    title: 'Transfer with payment',
    text: 'The buyer calls nft_transfer_call with the license fee attached. The receiver hook receives the msg payload.',
  },
  {
    title: 'Lock the token',
    text: 'The contract sets the token state to Locked and records a PendingTransfer so the asset cannot be double-spent mid-call.',
  },
  {
    title: 'Resolve',
    text: 'nft_resolve_transfer commits the new owner on success, or rolls the token and funds back to the sender on failure.',
  },
  {
    title: 'Issue access',
    text: 'A successful transfer emits nft_transfer and clears stale approvals. The new owner can grant or receive access next.',
  },
];

const EVENT_ROWS = [
  ['nft_approve', 'Access granted or renewed', 'Issue a short-lived key for the approved wallet.'],
  ['nft_revoke', 'Access removed', 'Invalidate the key and stop future decryptions.'],
  ['nft_metadata_update', 'Metadata changed', 'Refresh cached metadata and access UI.'],
  ['nft_transfer', 'Ownership changed', 'Re-bind treasury withdrawal rights to the new owner.'],
];

const SECURITY = [
  {
    icon: '🔑',
    title: 'No keys on sub-accounts',
    text: 'Vault sub-accounts have empty access-key sets. All withdrawals are dispatched by the root contract with a predecessor check.',
  },
  {
    icon: '🔒',
    title: 'Transfer lockout',
    text: 'Tokens are Locked during a cross-contract transfer. Dividends and withdrawals wait until the callback resolves.',
  },
  {
    icon: '🧹',
    title: 'Atomic approval clearance',
    text: 'Transfers clear approvals and reset the approval counter, so dangling approvals cannot survive a sale.',
  },
  {
    icon: '📊',
    title: 'Balance follows the owner',
    text: 'Entitlement is resolved from tokens_per_owner at withdrawal time, not at deposit time.',
  },
  {
    icon: '♻️',
    title: 'Rollback on failure',
    text: 'If a receiver hook fails, nft_resolve_transfer restores the sender, removes the receiver entry, and unlocks the token.',
  },
  {
    icon: '🕵️',
    title: 'No plaintext on-chain',
    text: 'Only ciphertext CIDs, access rules, and hashes are stored. Decryption happens in the client runtime.',
  },
];

const API_ROWS = [
  [
    'nft_mint',
    'token_id, owner_id, metadata',
    'Mints a token, stores metadata, and registers its vault sub-account.',
  ],
  [
    'nft_approve',
    'token_id, account_id, msg',
    'Owner grants time-boxed access. msg may include expires_at and ttl_hours.',
  ],
  [
    'nft_revoke',
    'token_id, account_id',
    'Owner removes an approval immediately and emits nft_revoke.',
  ],
  [
    'nft_is_approved',
    'token_id, approved_account_id',
    'View helper used by the UI and key service; respects expiry.',
  ],
  [
    'nft_transfer',
    'receiver_id, token_id, approval_id?, memo?',
    'Transfers ownership, locks the token during the call, then clears approvals.',
  ],
  [
    'nft_transfer_call',
    'receiver_id, token_id, approval_id?, memo?, msg',
    'Transfer with a receiver hook for atomic payment and access flows.',
  ],
  [
    'nft_resolve_transfer',
    'pending_id',
    'Callback that commits or rolls back a pending cross-contract transfer.',
  ],
  [
    'nft_token / nft_tokens_for_owner',
    'token_id / account_id, from_index?, limit?',
    'Metadata and paginated token views used by the frontend.',
  ],
  [
    'get_sub_account / get_lock_state',
    'token_id',
    'Inspect the vault account and whether a token is locked during transfer.',
  ],
];

export function TechnicalDocumentationPage() {
  return (
    <div className="doc-page">
      <header className="doc-hero">
        <span className="doc-eyebrow">Technical documentation</span>
        <h1>How the DRM vault works under the hood.</h1>
        <p>
          A standard NEAR NFT stack — NEP-171, NEP-177, and NEP-178 — combined
          with client-side encryption, threshold key derivation, and vault
          sub-accounts. This page is for developers integrating with, reviewing,
          or extending the contract.
        </p>
        <div className="doc-hero-chips">
          <span className="doc-chip">NEP-171</span>
          <span className="doc-chip">NEP-177</span>
          <span className="doc-chip">NEP-178</span>
          <span className="doc-chip">MPC · CKD</span>
        </div>
      </header>

      <div className="doc-layout">
        <DocToc
          items={TOC}
          ctaText="Explore the flow"
          ctaLabel="User guide"
          ctaTo="/docs"
        />

        <div className="doc-content">
          <section className="doc-section" id="overview">
            <div className="doc-section-heading">
              <span className="doc-section-number">01</span>
              <div>
                <h2>System overview</h2>
                <p>
                  Four moving parts: an NFT contract, an encrypted payload, a
                  treasury per token, and a threshold key service.
                </p>
              </div>
            </div>

            <p className="doc-lead">
              Each token is an NFT with extra metadata. The contract owns the
              ownership and access state, storage holds only ciphertext, and the
              key service turns an on-chain approval into a decryption
              capability that expires automatically.
            </p>

            <div className="doc-feature-grid">
              {ARCHITECTURE.map((item) => (
                <div key={item.title} className="doc-feature">
                  <span className="doc-feature-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>

            <div className="doc-note">
              <span className="doc-note-icon" aria-hidden="true">
                💡
              </span>
              <div>
                <strong>Design goal</strong>
                <p>
                  Sell the asset without selling the plaintext. Ownership and
                  access are separate on-chain facts, so a marketplace sale can
                  move the collectible while the file stays protected at rest.
                </p>
              </div>
            </div>
          </section>

          <section className="doc-section" id="architecture">
            <div className="doc-section-heading">
              <span className="doc-section-number">02</span>
              <div>
                <h2>Mint-to-open flow</h2>
                <p>The path a file takes from the creator&apos;s browser to a buyer.</p>
              </div>
            </div>

            <ol className="doc-flow">
              <li className="doc-flow-item">
                <span className="doc-flow-marker">1</span>
                <div>
                  <strong>Protect in the browser</strong>
                  <p>
                    The frontend reads the file, derives a key through the MPC
                    integration, encrypts the bytes, and uploads only ciphertext
                    to storage.
                  </p>
                </div>
              </li>
              <li className="doc-flow-item">
                <span className="doc-flow-marker">2</span>
                <div>
                  <strong>Mint with rules</strong>
                  <p>
                    nft_mint stores the CID, TTL, single-use flag, royalty, and
                    vault sub-account ID in NEP-177 metadata.
                  </p>
                </div>
              </li>
              <li className="doc-flow-item">
                <span className="doc-flow-marker">3</span>
                <div>
                  <strong>Approve a reader</strong>
                  <p>
                    The owner calls nft_approve for one account. The approval may
                    carry expires_at, and the contract emits an nft_approve
                    event.
                  </p>
                </div>
              </li>
              <li className="doc-flow-item">
                <span className="doc-flow-marker">4</span>
                <div>
                  <strong>Derive and decrypt</strong>
                  <p>
                    After verifying the approval, the key service releases a
                    derivation proof. The buyer fetches the ciphertext and
                    decrypts it in memory.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section className="doc-section" id="standards">
            <div className="doc-section-heading">
              <span className="doc-section-number">03</span>
              <div>
                <h2>NEP standards used</h2>
                <p>No custom token format — the access layer rides on standard extensions.</p>
              </div>
            </div>

            <div className="doc-feature-grid">
              {STANDARDS.map((standard) => (
                <div key={standard.title} className="doc-feature">
                  <span className="doc-feature-icon" aria-hidden="true">
                    {standard.icon}
                  </span>
                  <strong>{standard.title}</strong>
                  <span>{standard.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="doc-section" id="metadata">
            <div className="doc-section-heading">
              <span className="doc-section-number">04</span>
              <div>
                <h2>Metadata schema</h2>
                <p>
                  NEP-177 fields plus the encryption and access extensions used
                  by the vault.
                </p>
              </div>
            </div>

            <div className="doc-table-wrap">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {METADATA_ROWS.map(([field, type, purpose]) => (
                    <tr key={field}>
                      <td>
                        <code className="doc-code">{field}</code>
                      </td>
                      <td>{type}</td>
                      <td>{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="doc-note doc-note--warn">
              <span className="doc-note-icon" aria-hidden="true">
                ⚠️
              </span>
              <div>
                <strong>Royalties are basis points</strong>
                <p>
                  royalty_percentage is stored in basis points: 1000 means 10%,
                  1500 means 15%. The mint UI converts the percentage before
                  writing metadata.
                </p>
              </div>
            </div>
          </section>

          <section className="doc-section" id="lifecycle">
            <div className="doc-section-heading">
              <span className="doc-section-number">05</span>
              <div>
                <h2>Access lifecycle</h2>
                <p>From mint to expiry, every state transition is observable on-chain.</p>
              </div>
            </div>

            <ol className="doc-steps">
              {LIFECYCLE.map((step, index) => (
                <li key={step.title} className="doc-step">
                  <span className="doc-step-marker">{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="doc-section" id="purchase">
            <div className="doc-section-heading">
              <span className="doc-section-number">06</span>
              <div>
                <h2>Atomic access purchase</h2>
                <p>
                  Pay, receive the NFT, and resolve access in a single
                  cross-contract transaction.
                </p>
              </div>
            </div>

            <ol className="doc-flow">
              {PURCHASE_FLOW.map((step, index) => (
                <li key={step.title} className="doc-flow-item">
                  <span className="doc-flow-marker">{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="doc-note doc-note--success">
              <span className="doc-note-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>All-or-nothing settlement</strong>
                <p>
                  A failed receiver hook rolls the token back to the sender and
                  clears the pending entry. The buyer never ends up with a token
                  that was partially moved.
                </p>
              </div>
            </div>
          </section>

          <section className="doc-section" id="events">
            <div className="doc-section-heading">
              <span className="doc-section-number">07</span>
              <div>
                <h2>Events for off-chain key management</h2>
                <p>
                  The key service consumes standard logs from a NEAR indexer;
                  the chain remains the source of truth.
                </p>
              </div>
            </div>

            <div className="doc-table-wrap">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Trigger</th>
                    <th>Off-chain action</th>
                  </tr>
                </thead>
                <tbody>
                  {EVENT_ROWS.map(([event, trigger, action]) => (
                    <tr key={event}>
                      <td>
                        <code className="doc-code">{event}</code>
                      </td>
                      <td>{trigger}</td>
                      <td>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="doc-section" id="security">
            <div className="doc-section-heading">
              <span className="doc-section-number">08</span>
              <div>
                <h2>Security model</h2>
                <p>The defenses that keep a transfer from leaking access.</p>
              </div>
            </div>

            <div className="doc-feature-grid">
              {SECURITY.map((item) => (
                <div key={item.title} className="doc-feature">
                  <span className="doc-feature-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="doc-section" id="api">
            <div className="doc-section-heading">
              <span className="doc-section-number">09</span>
              <div>
                <h2>Contract API reference</h2>
                <p>
                  Public methods implemented in <code className="doc-code">contract/src</code>.
                </p>
              </div>
            </div>

            <div className="doc-table-wrap">
              <table className="doc-table doc-table--api">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Arguments</th>
                    <th>What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {API_ROWS.map(([method, args, description]) => (
                    <tr key={method}>
                      <td>
                        <code className="doc-code">{method}</code>
                      </td>
                      <td>
                        <span className="doc-args">{args}</span>
                      </td>
                      <td>{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="doc-section" id="implementation">
            <div className="doc-section-heading">
              <span className="doc-section-number">10</span>
              <div>
                <h2>Implementation map</h2>
                <p>Where to look when extending the demo.</p>
              </div>
            </div>

            <ul className="doc-checklist">
              <li>
                <code className="doc-code">contract/src/mint.rs</code> — minting
                plus sub-account registration and metadata events.
              </li>
              <li>
                <code className="doc-code">contract/src/approval.rs</code> —
                approvals, expiry checks, revocation, and access events.
              </li>
              <li>
                <code className="doc-code">contract/src/transfer.rs</code> —
                transfer locks, receiver hooks, and rollback resolution.
              </li>
              <li>
                <code className="doc-code">frontend/src/services/near-mpc.ts</code>{' '}
                — MPC key-derivation and encryption integration point.
              </li>
              <li>
                <code className="doc-code">frontend/src/services/contract.ts</code>{' '}
                — typed contract calls and wallet selection.
              </li>
            </ul>

            <div className="doc-note">
              <span className="doc-note-icon" aria-hidden="true">
                🧪
              </span>
              <div>
                <strong>Demo scope</strong>
                <p>
                  The deployed contract implements the NEP token, approval,
                  transfer, and vault metadata flows. The MPC client is a clearly
                  marked integration stub, so the UI can be exercised end-to-end
                  before the production key service is connected.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="doc-cta">
        <div>
          <h2>Want the creator and buyer walkthrough?</h2>
          <p>
            The user guide covers minting, granting access, and opening a file
            step by step.
          </p>
        </div>
        <div className="doc-cta-actions">
          <Link to="/docs" className="btn btn-primary">
            Read the user guide
          </Link>
          <Link to="/mint" className="btn btn-ghost">
            Try the mint flow
          </Link>
        </div>
      </section>
    </div>
  );
}
