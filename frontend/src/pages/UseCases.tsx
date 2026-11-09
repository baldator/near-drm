import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const USE_CASES = [
  {
    title: 'Paid Macro Research & Investment Newsletters',
    badge: 'Use Case 1',
    problem:
      'Financial analysts and hedge fund alumni charge $2,000–$10,000/year for boutique investment intelligence. Subscribers routinely share their logins or forward weekly PDF teardowns to non-paying peers, decimating author revenue.',
    implementation: [
      'Each publication issue or thematic series is minted as an encrypted vault backed by a root contract on NEAR.',
      'Web2 readers subscribe using credit card or Apple Pay via Stripe. A relayer sponsors an nft_approve transaction that registers their email-bound Passkey for 30 days.',
      'If a subscription cancels or a chargeback occurs, access is terminated in real time without rotating passwords across all users.',
    ],
    advantage:
      'When the author wants to take a sabbatical, they can list the newsletter’s master NFT on a marketplace. The buyer receives the token, the active subscriber cash flows, and accumulated treasury balance in one single settlement.',
  },
  {
    title: 'Virtual Data Rooms (VDR) & Confidential M&A Diligence',
    badge: 'Use Case 2',
    problem:
      'Founders and investment bankers use DocSend or Intralinks for fundraising and M&A due diligence. Traditional links leak when unvetted viewers inspect browser network caches or share viewing links.',
    implementation: [
      'Pitch decks, audit reports, and financial models are encrypted with AES-256 and pinned on decentralized storage (Arweave/IPFS).',
      'Invited venture capital firms are whitelisted on-chain. Access keys are strictly single-use and valid only during active review windows.',
      'The in-browser viewer renders frames dynamically onto an encrypted canvas, overlaying the partner’s firm name, IP address, and timestamp. Raw binary streams cannot be saved via browser download managers.',
    ],
    advantage:
      'Diligent buyers get time-boxed, watermarked access that cannot be downloaded or forwarded, while sellers retain cryptographic control over every document in the room.',
  },
  {
    title: 'B2B Engineering Blueprints & Proprietary IP Licensing',
    badge: 'Use Case 3',
    problem:
      'Semiconductor schematics, industrial CAD files, and proprietary chemical formulas require ongoing annual licensing. Managing API keys or vendor portals across dozens of enterprise licensees creates significant credential-management overhead.',
    implementation: [
      'Each patent or schematic file is bound to a dedicated sub-account (patent-412.vault.near).',
      'Corporate licensees execute recurring automated payments that flow directly into that sub-account.',
      'An enterprise engineering workstation verifies current authorization status via NEAR RPC events before triggering secure-enclave decryption.',
    ],
    advantage:
      'If the engineering firm sells the patent to another conglomerate, transferring the underlying NEP-171 NFT reroutes all recurring royalty payments instantly to the acquirer.',
  },
  {
    title: 'Accredited Professional Courses & Certification Vaults',
    badge: 'Use Case 4',
    problem:
      'Instructors selling high-ticket ($500–$3,000) cohort-based training materials and trade-secret frameworks face rampant account sharing and course piracy on file-sharing sites.',
    implementation: [
      'Students purchase access with zero crypto awareness via credit card checkout. A lightweight NEAR account is created behind the scenes using WebAuthn (TouchID/FaceID).',
      'Video streams, workbook templates, and private slide decks are decrypted per module based on NEP-178 ephemeral approvals.',
      'Instructors maintain accurate on-chain ledgers of every student who held access, their completion status, and lifetime collected fees.',
    ],
    advantage:
      'Instructors get cryptographic proof of enrollment and completion, plus an on-chain fee ledger — with no passwords for students and no platform taking a cut.',
  },
];

export function UseCasesPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const useCase = USE_CASES[activeIndex];

  return (
    <div className="landing">
      <nav className="nav-links">
        <Link to="/" className="btn btn-outline">
          ← Back to Home
        </Link>
      </nav>

      <section className="section use-cases-hero">
        <h2>Real-World Applications</h2>
        <p>
          How creators, analysts, founders, and instructors turn high-value
          documents into programmable, monetizable vaults on NEAR — without
          passwords, platform lock-in, or 30% intermediary fees.
        </p>

        <div className="tab-list" role="tablist" aria-label="Use cases">
          {USE_CASES.map((uc, index) => (
            <button
              key={index}
              role="tab"
              aria-selected={activeIndex === index}
              className={`tab-btn ${activeIndex === index ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveIndex(index)}
            >
              <span className="tab-badge">{uc.badge}</span>
              <span className="tab-title">{uc.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section use-case-detail" aria-labelledby="use-case-title">
        <div className="use-case-card">
          <div className="use-case-header">
            <div className="use-case-badge">{useCase.badge}</div>
            <h3 id="use-case-title">{useCase.title}</h3>
          </div>

          <div className="use-case-grid">
            <div className="use-case-panel use-case-panel--problem">
              <h4>The Problem</h4>
              <p>{useCase.problem}</p>
            </div>
            <div className="use-case-panel use-case-panel--solution">
              <h4>The Implementation</h4>
              <ul>
                {useCase.implementation.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="use-case-advantage">
            <strong>The Asset Advantage:</strong> {useCase.advantage}
          </div>
        </div>
      </section>

      <section className="cta">
        <h2>Start publishing without leaks.</h2>
        <p>
          Mint your first document vault on NEAR — subscribers pay by card,
          you keep 100% of the sovereignty.
        </p>
        <br />
        <Link to="/mint" className="btn btn-primary">
          Create Your First Vault
        </Link>
      </section>
    </div>
  );
}
