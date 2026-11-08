import React from 'react';
import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <h1>NEAR DRM</h1>
        <p>
          Digital content that stays yours. Sell or share encrypted files as NFTs
          and control who can open them — and for how long.
        </p>
        <div className="hero-actions">
          <Link to="/mint" className="btn btn-primary">
            Create Your First NFT
          </Link>
          <Link to="/docs" className="btn btn-ghost">
            Read the Docs
          </Link>
        </div>
      </section>

      {/* What is it */}
      <section className="section">
        <h2>What is NEAR DRM?</h2>
        <p>
          NEAR DRM lets creators turn digital files — images, music, documents,
          videos — into NFTs on the NEAR blockchain. The file is encrypted before
          it is stored, and only people you approve can decrypt and view it.
        </p>
        <p>
          Think of it as a digital vault with programmable keys. You decide who
          gets in, how long they stay, and you can revoke access at any time.
        </p>
      </section>

      {/* How it works */}
      <section className="section">
        <h2>How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="num">1</div>
            <h3>Mint</h3>
            <p>Upload your encrypted file and create an NFT that represents it.</p>
          </div>
          <div className="step">
            <div className="num">2</div>
            <h3>Grant</h3>
            <p>Approve specific NEAR accounts to unlock the file, each with their own time limit.</p>
          </div>
          <div className="step">
            <div className="num">3</div>
            <h3>Decrypt</h3>
            <p>Approved users receive a decryption key and can open the file.</p>
          </div>
          <div className="step">
            <div className="num">4</div>
            <h3>Revoke</h3>
            <p>Remove access at any time — instantly and on-chain.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <h2>Main Features</h2>
        <div className="features">
          <div className="feature">
            <h4>Encrypted Storage</h4>
            <p>Files are encrypted before upload, so nobody can read them without a key.</p>
          </div>
          <div className="feature">
            <h4>Programmable Access</h4>
            <p>Grant access to specific accounts with custom expiry times.</p>
          </div>
          <div className="feature">
            <h4>Instant Revocation</h4>
            <p>Revoke a user's access whenever you need to.</p>
          </div>
          <div className="feature">
            <h4>Built on NEAR</h4>
            <p>Fast, low-cost transactions on the NEAR blockchain using NEP standards.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <h2>Ready to protect your digital content?</h2>
        <p>Create your first DRM-protected NFT on NEAR in minutes.</p>
        <br />
        <Link to="/mint" className="btn btn-primary">
          Start Minting
        </Link>
      </section>
    </div>
  );
}
