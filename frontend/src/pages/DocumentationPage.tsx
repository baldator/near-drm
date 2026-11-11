import React from 'react';
import { Link } from 'react-router-dom';
import { DocToc } from '../components/DocToc';

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'create', label: 'Create a collectible' },
  { id: 'grant', label: 'Grant access' },
  { id: 'open', label: 'Open a file' },
  { id: 'details', label: 'Track details' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
];

const FEATURES = [
  {
    icon: '🔒',
    title: 'Private by default',
    text: 'Your file is protected before it leaves your device. Only wallets you approve can unlock the original.',
  },
  {
    icon: '⏱',
    title: 'Access on a clock',
    text: 'Decide how long a buyer can open the file — a single view, 24 hours, 30 days, or a custom window.',
  },
  {
    icon: '💸',
    title: 'Earn on every resale',
    text: 'Set a royalty once and receive your share automatically whenever the collectible changes hands.',
  },
  {
    icon: '🧾',
    title: 'One asset, full control',
    text: 'The NFT carries the file, its access rules, and its resale terms. Revoke access whenever you need to.',
  },
];

const CREATOR_STEPS = [
  {
    title: 'Connect your NEAR wallet',
    text: 'Select Connect in the top-right corner. Your wallet is your login — there is no password or email sign-up.',
  },
  {
    title: 'Describe the collectible',
    text: 'Add a clear title and an optional description. This is what buyers see before they request access.',
  },
  {
    title: 'Add the file',
    text: 'Upload a file up to 5 MB or paste a link to one you have already protected. The browser protects it before it is stored.',
  },
  {
    title: 'Choose access rules',
    text: 'Pick how long access lasts after it is granted and whether the file can be opened once or repeatedly.',
  },
  {
    title: 'Set your resale royalty',
    text: 'Choose 0–50%. Ten percent is a common starting point. Then confirm the transaction in your wallet.',
  },
];

const GRANT_STEPS = [
  {
    title: 'Open the collectible page',
    text: 'After minting, select Manage access. You can also find it at any time under My Tokens.',
  },
  {
    title: "Enter the buyer's account",
    text: 'Type the NEAR account ID they will sign in with — for example alice.testnet.',
  },
  {
    title: 'Pick a time window',
    text: 'Choose 1 day, 3 days, 1 week, or 30 days. The clock starts the moment you grant access.',
  },
  {
    title: 'Confirm the approval',
    text: 'Approve the transaction in your wallet. The buyer can now open the file until the window ends.',
  },
];

const BUYER_STEPS = [
  {
    title: 'Connect the approved wallet',
    text: 'Sign in with the exact NEAR account the creator granted access to.',
  },
  {
    title: 'Open the collectible',
    text: 'The page shows a green “You can open this” badge when access is active.',
  },
  {
    title: 'Unlock and download',
    text: 'Select Open protected file. The browser decrypts it in memory and offers a temporary download link.',
  },
];

const TROUBLESHOOTING = [
  {
    question: 'The page says “Access not granted”.',
    answer:
      'Only the creator can share a file. Ask them to grant access to the exact NEAR account you are signed in with, then reload the page.',
  },
  {
    question: 'My wallet is connected to the wrong account.',
    answer:
      'Disconnect and reconnect with the account that owns the collectible or received the approval. Access is tied to the account ID, not the browser.',
  },
  {
    question: 'The upload button does nothing.',
    answer:
      'The demo accepts files up to 5 MB. Try a smaller file, or paste a link to a file you have already protected instead.',
  },
  {
    question: 'The transaction was rejected.',
    answer:
      'Nothing was charged. Open your wallet, approve the request, or try again when you are ready.',
  },
  {
    question: 'The file would not open.',
    answer:
      'The access window may have expired or been revoked. Ask the creator to grant access again.',
  },
];

export function DocumentationPage() {
  return (
    <div className="doc-page">
      <header className="doc-hero">
        <span className="doc-eyebrow">Documentation</span>
        <h1>From a private file to a programmable collectible.</h1>
        <p>
          This guide walks creators and buyers through the whole flow: publishing
          a protected file, granting time-boxed access, and opening it with a
          NEAR wallet.
        </p>
        <div className="doc-hero-chips">
          <span className="doc-chip">🎨 For creators</span>
          <span className="doc-chip">🛒 For buyers</span>
          <span className="doc-chip">⏱ 5-minute read</span>
        </div>
      </header>

      <div className="doc-layout">
        <DocToc
          items={TOC}
          ctaText="Ready to publish?"
          ctaLabel="Create an NFT"
          ctaTo="/mint"
        />

        <div className="doc-content">
          <section className="doc-section" id="overview">
            <div className="doc-section-heading">
              <span className="doc-section-number">01</span>
              <div>
                <h2>What you can do</h2>
                <p>
                  One NFT bundles your file, its access rules, and its resale
                  terms into a single transferable asset.
                </p>
              </div>
            </div>

            <p className="doc-lead">
              NEAR DRM turns a normal file into a collectible that stays under
              your control. Buyers do not receive a forwarded PDF or a password
              they can share — they receive a wallet-bound approval that expires
              when you say so.
            </p>

            <div className="doc-feature-grid">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="doc-feature">
                  <span className="doc-feature-icon" aria-hidden="true">
                    {feature.icon}
                  </span>
                  <strong>{feature.title}</strong>
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="doc-section" id="create">
            <div className="doc-section-heading">
              <span className="doc-section-number">02</span>
              <div>
                <h2>Create a protected collectible</h2>
                <p>Everything happens from the Mint page in five steps.</p>
              </div>
            </div>

            <ol className="doc-steps">
              {CREATOR_STEPS.map((step, index) => (
                <li key={step.title} className="doc-step">
                  <span className="doc-step-marker">{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="doc-note">
              <span className="doc-note-icon" aria-hidden="true">
                💡
              </span>
              <div>
                <strong>What happens to the file?</strong>
                <p>
                  It is scrambled on your device before it is uploaded. The
                  collectible stores only the protected copy and its content
                  address — never the plaintext.
                </p>
              </div>
            </div>
          </section>

          <section className="doc-section" id="grant">
            <div className="doc-section-heading">
              <span className="doc-section-number">03</span>
              <div>
                <h2>Grant access to a buyer</h2>
                <p>
                  Access is an on-chain approval tied to one NEAR account and an
                  optional expiry.
                </p>
              </div>
            </div>

            <ol className="doc-steps">
              {GRANT_STEPS.map((step, index) => (
                <li key={step.title} className="doc-step">
                  <span className="doc-step-marker">{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="doc-note doc-note--warn">
              <span className="doc-note-icon" aria-hidden="true">
                ⚠️
              </span>
              <div>
                <strong>Access is per account</strong>
                <p>
                  Approving alice.testnet does not approve alice&apos;s other
                  wallets or the person she forwards the link to. To stop access
                  early, use Revoke access on the collectible page.
                </p>
              </div>
            </div>
          </section>

          <section className="doc-section" id="open">
            <div className="doc-section-heading">
              <span className="doc-section-number">04</span>
              <div>
                <h2>Open a protected file</h2>
                <p>Buyers need a wallet, an active approval, and a browser.</p>
              </div>
            </div>

            <ol className="doc-steps">
              {BUYER_STEPS.map((step, index) => (
                <li key={step.title} className="doc-step">
                  <span className="doc-step-marker">{index + 1}</span>
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
                <strong>Nothing is left behind</strong>
                <p>
                  Decryption happens in memory. The temporary download link is
                  created by the browser and disappears when you leave the page.
                </p>
              </div>
            </div>
          </section>

          <section className="doc-section" id="details">
            <div className="doc-section-heading">
              <span className="doc-section-number">05</span>
              <div>
                <h2>Track every collectible</h2>
                <p>
                  Your collection and each collectible&apos;s details stay
                  readable on-chain.
                </p>
              </div>
            </div>

            <div className="doc-split">
              <div className="doc-card">
                <h3>My Tokens</h3>
                <p>
                  Lists every collectible held by the connected wallet, with
                  shortcuts to manage access or view its details.
                </p>
              </div>
              <div className="doc-card">
                <h3>Collectible details</h3>
                <p>
                  Shows the current owner, the protected file link, the access
                  window, and the NFT ID — useful when sharing or debugging.
                </p>
              </div>
            </div>

            <ul className="doc-checklist">
              <li>Owner and transfer history are derived from the contract.</li>
              <li>Access rules travel with the NFT when it is sold or transferred.</li>
              <li>Each collectible records its own vault sub-account for revenue.</li>
            </ul>
          </section>

          <section className="doc-section" id="troubleshooting">
            <div className="doc-section-heading">
              <span className="doc-section-number">06</span>
              <div>
                <h2>Troubleshooting</h2>
                <p>Quick answers to the most common snags.</p>
              </div>
            </div>

            <div className="doc-faq">
              {TROUBLESHOOTING.map((item) => (
                <details key={item.question} className="doc-faq-item">
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="doc-cta">
        <div>
          <h2>Ready to create your first protected collectible?</h2>
          <p>
            Mint a file, choose who can open it, and keep control when it
            changes hands.
          </p>
        </div>
        <div className="doc-cta-actions">
          <Link to="/mint" className="btn btn-primary">
            Start minting
          </Link>
          <Link to="/use-cases" className="btn btn-ghost">
            Explore use cases
          </Link>
        </div>
      </section>
    </div>
  );
}
