import React from 'react';
import { Link } from 'react-router-dom';

export function DocumentationPage() {
  return (
    <div className="landing">
      <nav className="nav-links">
        <Link to="/" className="btn btn-outline">
          ← Back to Home
        </Link>
      </nav>

      {/* End user guide */}
      <section className="section">
        <h2>End User Guide</h2>
        <p>Follow these steps to use the platform as a creator or a buyer.</p>

        <div className="card-box">
          <h4>For Creators: Mint an NFT</h4>
          <ol>
            <li>Connect your NEAR wallet.</li>
            <li>Go to <strong>Mint</strong> and fill in the title, description, and royalty.</li>
            <li>Upload your file to IPFS first, then paste the encrypted file CID.</li>
            <li>Set the access TTL (how long the decryption key stays valid).</li>
            <li>Click <strong>Mint NFT</strong>. Your DRM-protected NFT is now live.</li>
          </ol>
        </div>

        <div className="card-box">
          <h4>For Creators: Grant Access to a Buyer</h4>
          <ol>
            <li>Open your NFT's page (<code>/gated/&lt;tokenId&gt;</code>).</li>
            <li>In the Grant Access section, enter the buyer's NEAR account ID.</li>
            <li>Choose how many hours the access should last.</li>
            <li>Click <strong>Grant Access</strong>.</li>
          </ol>
        </div>

        <div className="card-box">
          <h4>For Buyers: Decrypt a File</h4>
          <ol>
            <li>Make sure the creator has granted you access to the NFT.</li>
            <li>Open the NFT's page and confirm you see "You have decryption access!".</li>
            <li>Use NEAR MPC CKD to decrypt the file at the IPFS gateway link.</li>
          </ol>
        </div>

        <div className="card-box">
          <h4>View History</h4>
          <p>
            Any NFT has a history page (<code>/history/&lt;tokenId&gt;</code>) showing the current
            owner, sub-account, lock state, asset metadata, DRM rules, and threat-model defenses.
          </p>
        </div>
      </section>
    </div>
  );
}
