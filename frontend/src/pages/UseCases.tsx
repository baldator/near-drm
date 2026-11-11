import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const USE_CASES = [
  {
    title: 'Paid Macro Research & Investment Newsletters',
    shortTitle: 'Research & Newsletters',
    icon: '📈',
    badge: 'Use Case 1',
    summary:
      'Sell time-boxed access to paid research without losing control of every forwarded PDF.',
    tags: ['Subscriptions', 'Zero forwarding', 'Sellable cash flow'],
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
    shortTitle: 'M&A Data Rooms',
    icon: '🏦',
    badge: 'Use Case 2',
    summary:
      'Run confidential diligence with links that expire, cannot be forwarded, and can be revoked mid-deal.',
    tags: ['Diligence', 'Watermarked', 'Single-use'],
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
    shortTitle: 'IP Licensing',
    icon: '🧪',
    badge: 'Use Case 3',
    summary:
      'License CAD files, schematics, and formulas to enterprises with automated, revocable access.',
    tags: ['Annual licenses', 'Sub-accounts', 'Royalty routing'],
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
    shortTitle: 'Course Vaults',
    icon: '🎓',
    badge: 'Use Case 4',
    summary:
      'Protect high-ticket course material with wallet-free onboarding and an on-chain enrollment ledger.',
    tags: ['Passkeys', 'Per-module access', 'Proof of enrollment'],
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
    <div className="doc-page">
      <header className="doc-hero doc-hero--cases">
        <span className="doc-eyebrow">Use cases</span>
        <h1>Real-world applications for programmable documents.</h1>
        <p>
          How creators, analysts, founders, and instructors turn high-value
          documents into monetizable vaults on NEAR — without passwords,
          platform lock-in, or 30% intermediary fees.
        </p>

        <div
          className="doc-case-tabs"
          role="tablist"
          aria-label="Use cases"
        >
          {USE_CASES.map((useCaseOption, index) => (
            <button
              key={useCaseOption.badge}
              type="button"
              role="tab"
              aria-selected={activeIndex === index}
              className={`doc-case-tab${
                activeIndex === index ? ' is-active' : ''
              }`}
              onClick={() => setActiveIndex(index)}
            >
              <span className="doc-case-tab-icon" aria-hidden="true">
                {useCaseOption.icon}
              </span>
              <span className="doc-case-tab-badge">
                {useCaseOption.badge}
              </span>
              <span className="doc-case-tab-title">
                {useCaseOption.shortTitle}
              </span>
            </button>
          ))}
        </div>
      </header>

      <section className="doc-case-detail" aria-labelledby="use-case-title">
        <div className="doc-case-card">
          <div className="doc-case-header">
            <span className="doc-case-icon" aria-hidden="true">
              {useCase.icon}
            </span>
            <div>
              <span className="doc-badge">{useCase.badge}</span>
              <h2 id="use-case-title">{useCase.title}</h2>
              <p>{useCase.summary}</p>
              <div className="doc-tags">
                {useCase.tags.map((tag) => (
                  <span key={tag} className="doc-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="doc-case-grid">
            <div className="doc-panel doc-panel--problem">
              <h3>
                <span aria-hidden="true">⚠️</span> The problem
              </h3>
              <p>{useCase.problem}</p>
            </div>
            <div className="doc-panel doc-panel--solution">
              <h3>
                <span aria-hidden="true">🛠</span> How the vault solves it
              </h3>
              <ul>
                {useCase.implementation.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="doc-advantage">
            <strong>The asset advantage</strong>
            <p>{useCase.advantage}</p>
          </div>
        </div>
      </section>

      <section className="doc-pattern">
        <div className="doc-pattern-header">
          <span className="doc-eyebrow doc-eyebrow--dark">The pattern</span>
          <h2>Every use case follows the same three moves.</h2>
        </div>
        <div className="doc-feature-grid">
          <div className="doc-feature">
            <span className="doc-feature-icon" aria-hidden="true">
              🔐
            </span>
            <strong>Protect the file</strong>
            <span>
              Content is encrypted before it reaches storage. The chain only
              sees a content address and access rules.
            </span>
          </div>
          <div className="doc-feature">
            <span className="doc-feature-icon" aria-hidden="true">
              ✅
            </span>
            <strong>Approve each reader</strong>
            <span>
              NEP-178 approvals bind access to one wallet for a fixed window —
              one view, a day, or a month.
            </span>
          </div>
          <div className="doc-feature">
            <span className="doc-feature-icon" aria-hidden="true">
              🔁
            </span>
            <strong>Transfer the whole business</strong>
            <span>
              Selling the NFT moves the asset, the access rules, the treasury,
              and future cash flows in one settlement.
            </span>
          </div>
        </div>
      </section>

      <section className="doc-cta">
        <div>
          <h2>Start publishing without leaks.</h2>
          <p>
            Mint your first document vault on NEAR — readers get frictionless
            access and you keep 100% of the sovereignty.
          </p>
        </div>
        <div className="doc-cta-actions">
          <Link to="/mint" className="btn btn-primary">
            Create your first vault
          </Link>
          <Link to="/docs" className="btn btn-ghost">
            Read the docs
          </Link>
        </div>
      </section>
    </div>
  );
}
