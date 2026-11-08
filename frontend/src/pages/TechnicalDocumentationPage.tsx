import React from 'react';
import { Link } from 'react-router-dom';

export function TechnicalDocumentationPage() {
  return (
    <div className="landing">
      <nav className="nav-links">
        <Link to="/" className="btn btn-outline">
          ← Back to Home
        </Link>
      </nav>

      {/* Technical Documentation */}
      <section className="section" id="technical-documentation">
        <h2>Technical Documentation</h2>
        <p>
          This section explains how the platform works under the hood. It is
          intended for developers and anyone who wants to understand the
          architecture.
        </p>

        <div className="card-box">
          <h4>Architecture</h4>
          <ul>
            <li><strong>Smart contract</strong> — A NEAR NFT contract (NEP-171) that mints tokens, stores metadata, and manages access approvals (NEP-178).</li>
            <li><strong>Encrypted file</strong> — The actual content is encrypted client-side and stored on IPFS or Arweave. Only the content identifier (CID) is stored on-chain.</li>
            <li><strong>Sub-accounts</strong> — Each NFT gets a dedicated NEAR sub-account with no external keys, controlled only by the root contract.</li>
            <li><strong>NEAR MPC (CKD)</strong> — Decryption keys are derived via NEAR's MPC network (17 nodes, 11-of-17 threshold) using Confidential Key Derivation, verified by the DRM contract.</li>
          </ul>
        </div>

        <div className="card-box">
          <h4>NEP Standards Used</h4>
          <ul>
            <li><strong>NEP-171</strong> — Non-fungible token standard for minting and ownership.</li>
            <li><strong>NEP-177</strong> — NFT metadata standard.</li>
            <li><strong>NEP-178</strong> — NFT approvals, used to grant and revoke decryption access per account.</li>
            <li><strong>NEP-171 Events</strong> — On-chain events that trigger key issuance and revocation.</li>
          </ul>
        </div>

        <div className="card-box">
          <h4>Access Flow</h4>
          <ol>
            <li>Creator mints an NFT with an encrypted file CID and access rules (TTL, single-use, royalty).</li>
            <li>Creator calls <span className="code">nft_approve</span> for a buyer's account, attaching an expiry policy.</li>
            <li>The approval event is emitted on-chain.</li>
            <li>The NEAR MPC network verifies the approval event and derives the decryption key via Confidential Key Derivation.</li>
            <li>The buyer uses the key to decrypt the file from IPFS/Arweave.</li>
            <li>Creator can call <span className="code">nft_revoke</span> to remove access at any time.</li>
          </ol>
        </div>
      </section>

    </div>
  );
}
