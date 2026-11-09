import React from 'react';
import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="hero-eyebrow">NEAR DRM Vault</div>
        <h1>The Zero-Leak Document Platform.</h1>
        <p className="hero-sub">
          Publish high-value documents without passwords, platform lock-in, or
          intermediary fees.
        </p>
        <div className="hero-actions">
          <Link to="/mint" className="btn btn-primary">
            Publish Your First Document
          </Link>
          <Link to="/use-cases" className="btn btn-ghost">
            See Use Cases
          </Link>
          <Link to="/docs" className="btn btn-ghost">
            Read the Docs
          </Link>
        </div>
      </section>

      {/* Value Strip: monetization + key metrics */}
      <section className="value-strip">
        <div className="value-strip-inner">
          <div className="value-strip-copy">
            <span className="value-strip-tag">Monetize</span>
            <h3>Get paid directly — keep 100% of your sovereignty.</h3>
            <p>
              Subscribers pay by credit card. Funds route straight to your
              document's on-chain treasury. No passwords, no lock-in, no
              30% platform cut.
            </p>
          </div>
          <div className="value-strip-metrics">
            <div className="metric-chip">
              <span className="chip-value">0</span>
              <span className="chip-label">Seed Phrases</span>
            </div>
            <div className="metric-chip">
              <span className="chip-value">1-Click</span>
              <span className="chip-label">Passkey Onboarding</span>
            </div>
            <div className="metric-chip">
              <span className="chip-value">100%</span>
              <span className="chip-label">In-Memory Decryption</span>
            </div>
            <div className="metric-chip">
              <span className="chip-value">Sub-Second</span>
              <span className="chip-label">Revocation</span>
            </div>
          </div>
        </div>
      </section>

      {/* Problem vs Solution */}
      <section className="comparison">
        <div className="comparison-header">
          <h2>The Core Problem vs. The Solution</h2>
          <p>
            Why publications, research firms, and creators are moving off
            legacy DRM platforms.
          </p>
        </div>
        <table className="comparison-table">
          <thead>
            <tr>
              <th className="col--legacy">The Legacy Way</th>
              <th className="col--solution">The Programmable DRM Vault</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="The Legacy Way">
                <strong>DocSend · Substack · Gumroad</strong>
              </td>
              <td data-label="The Programmable DRM Vault">
                <strong>Built on NEAR · NEP-171 · Passkeys</strong>
              </td>
            </tr>
            <tr>
              <td data-label="Leaked Files">
                <h4>Leaked Files</h4>
                <p>
                  PDFs are easily downloaded, stripped of metadata, and
                  forwarded on WhatsApp or Telegram.
                </p>
              </td>
              <td data-label="Ephemerally Decrypted">
                <h4>Ephemerally Decrypted</h4>
                <p>
                  Content streams in-memory directly to an HTML5 canvas with
                  per-viewer watermarking. No file sits on disk.
                </p>
              </td>
            </tr>
            <tr>
              <td data-label="High Platform Rents">
                <h4>High Platform Rents</h4>
                <p>
                  Centralized SaaS providers extract 10%–30% of gross recurring
                  subscription volume.
                </p>
              </td>
              <td data-label="Direct Settlement">
                <h4>Direct Settlement</h4>
                <p>
                  Funds route directly to the document's on-chain treasury with
                  standard card-processing fees.
                </p>
              </td>
            </tr>
            <tr>
              <td data-label="Illiquid Publication IP">
                <h4>Illiquid Publication IP</h4>
                <p>
                  A newsletter or research firm's subscriber base cannot be sold
                  cleanly without selling the entire legal entity.
                </p>
              </td>
              <td data-label="Liquid Sovereign Vaults">
                <h4>Liquid Sovereign Vaults</h4>
                <p>
                  The publication is an NEP-171 asset. Transferring or selling
                  the token transfers future monthly cash flows and treasury
                  reserves automatically.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* CTA */}
      <section className="cta">
        <h2>Ready to publish without leaks?</h2>
        <p>
          Mint your document as a programmable vault on NEAR — subscribers pay
          by card, you keep 100% of the sovereignty.
        </p>
        <br />
        <div className="hero-actions">
          <Link to="/mint" className="btn btn-primary">
            Start Minting
          </Link>
          <Link to="/docs" className="btn btn-ghost">
            Read the Docs
          </Link>
        </div>
      </section>
    </div>
  );
}
