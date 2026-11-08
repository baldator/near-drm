import React, { useState } from 'react';
import { contract, getAccountId, isSignedIn, CONTRACT_ID } from '../services/contract';
import { nearMPC } from '../services/near-mpc';

export function MintPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mediaCid, setMediaCid] = useState('');
  const [ttlHours, setTtlHours] = useState('24');
  const [singleUse, setSingleUse] = useState(true);
  const [whitelistRoot, setWhitelistRoot] = useState('');
  const [royaltyPercentage, setRoyaltyPercentage] = useState('1000');
  const [status, setStatus] = useState('');
  const [tokenId, setTokenId] = useState('');

  // NEAR MPC encryption states
  const [fileContent, setFileContent] = useState('');
  const [encryptedContent, setEncryptedContent] = useState('');
  const [encrypting, setEncrypting] = useState(false);
  const [mpcKeyId, setMpcKeyId] = useState('');

  const handleEncryptWithMPC = async () => {
    if (!fileContent.trim()) {
      setStatus('Please enter content to encrypt.');
      return;
    }

    setEncrypting(true);
    setStatus('Encrypting with NEAR MPC (CKD)...');

    try {
      // Step 1: Request key derivation from NEAR MPC network
      // The contract attests the request so MPC can verify it comes from valid logic
      const nonce = Math.random().toString(36).substring(2);
      const derivation = await nearMPC.requestKeyDerivation({
        contractId: CONTRACT_ID,
        tokenId: `token-${Date.now()}`,
        accountId: getAccountId()!,
        purpose: 'encryption',
        nonce,
      });

      // Step 2: Encrypt content using the MPC-derived key
      const result = await nearMPC.encryptWithMPC({
        content: fileContent,
        keyId: derivation.keyId,
        mpcProof: derivation.derivationProof,
      });

      setEncryptedContent(result.ciphertext);
      setMpcKeyId(result.keyId);
      setStatus(
        `Content encrypted via NEAR MPC CKD! Key ID: ${result.keyId}. Upload the ciphertext to IPFS and paste the CID above.`
      );
    } catch (error: any) {
      setStatus(`MPC encryption failed: ${error.message || error.toString()}`);
    } finally {
      setEncrypting(false);
    }
  };

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn()) {
      setStatus('Please connect your wallet first.');
      return;
    }

    const newTokenId = `token-${Date.now()}`;
    const metadata = {
      title,
      description,
      media: `ipfs://${mediaCid}`,
      encrypted: true,
      access_rules: {
        ttl_hours: parseInt(ttlHours) || 24,
        single_use: singleUse,
        max_views: singleUse ? 1 : undefined,
      },
      whitelist_root: whitelistRoot || null,
      sub_account_id: `token-${newTokenId}.vault.near`,
      decryption_key_cid: null,
      royalty_percentage: parseInt(royaltyPercentage) || 1000,
    };

    try {
      setStatus('Minting NFT...');
      await contract.nft_mint({
        token_id: newTokenId,
        owner_id: getAccountId()!,
        metadata: metadata,
      });
      setTokenId(newTokenId);
      setStatus(`NFT minted successfully: ${newTokenId}`);
    } catch (error: any) {
      setStatus(`Error: ${error.message || error.toString()}`);
    }
  };

  return (
    <div className="page mint-page">
      <h1>Mint DRM NFT</h1>
      <p>
        Create a new encrypted digital rights NFT. The file is stored on IPFS
        and access is controlled via NEP-178 approvals. You can encrypt content
        directly using NEAR's native MPC network (CKD) below, or provide an
        existing encrypted file CID.
      </p>

      <div className="status">{status}</div>

      {/* NEAR MPC Encryption Section */}
      <div className="access-section" style={{ marginBottom: '2rem' }}>
        <h2>Encrypt with NEAR MPC (CKD)</h2>
        <p>
          Enter the plaintext content you want to protect. NEAR's MPC network
          (17 nodes, 11-of-17 threshold) derives an application-specific secret
          key via Confidential Key Derivation — the key is never fully
          reconstructed at any single node. The DRM contract attests the
          derivation request so the MPC network verifies it comes from valid
          contract logic.
        </p>
        <div className="form-group">
          <label>Plaintext Content</label>
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            placeholder="Enter the file content to encrypt..."
            rows={4}
          />
        </div>
        <button
          onClick={handleEncryptWithMPC}
          className="btn btn-primary"
          disabled={encrypting}
        >
          {encrypting ? 'Encrypting...' : 'Encrypt with NEAR MPC'}
        </button>

        {encryptedContent && (
          <div className="result" style={{ marginTop: '1rem' }}>
            <h3>MPC-Encrypted Ciphertext</h3>
            <textarea
              value={encryptedContent}
              readOnly
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <div style={{ marginTop: '0.5rem' }}>
              <strong>MPC Key ID:</strong> <code>{mpcKeyId}</code>
            </div>
            <small className="hint">
              Copy this ciphertext, upload it to IPFS, then paste the resulting
              CID in the "IPFS CID" field above. The MPC key ID is stored
              off-chain and used during decryption to authorize key release.
            </small>
          </div>
        )}
      </div>

      <form onSubmit={handleMint} className="mint-form">
        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Premium Design Template"
            required
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the digital asset"
          />
        </div>

        <div className="form-group">
          <label>IPFS CID (encrypted file)</label>
          <input
            type="text"
            value={mediaCid}
            onChange={(e) => setMediaCid(e.target.value)}
            placeholder="QmEncryptedFileCID"
            required
          />
          <small className="hint">
            Upload your encrypted file (or MPC ciphertext) to IPFS first, then
            paste the CID here.
          </small>
        </div>

        <div className="form-group">
          <label>Access TTL (hours)</label>
          <input
            type="number"
            value={ttlHours}
            onChange={(e) => setTtlHours(e.target.value)}
            min="1"
          />
          <small className="hint">
            How long the decryption key remains valid after approval.
          </small>
        </div>

        <div className="form-group">
          <label>Single Use</label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={singleUse}
              onChange={(e) => setSingleUse(e.target.checked)}
            />
            Decryption key can be used only once
          </label>
        </div>

        <div className="form-group">
          <label>Whitelist Root (Merkle root)</label>
          <input
            type="text"
            value={whitelistRoot}
            onChange={(e) => setWhitelistRoot(e.target.value)}
            placeholder="0x1234... (optional)"
          />
          <small className="hint">
            Merkle root of whitelisted wallet addresses that can receive
            decryption keys.
          </small>
        </div>

        <div className="form-group">
          <label>Creator Royalty (basis points)</label>
          <input
            type="number"
            value={royaltyPercentage}
            onChange={(e) => setRoyaltyPercentage(e.target.value)}
            min="0"
            max="10000"
          />
          <small className="hint">
            1000 = 10% royalty on secondary sales.
          </small>
        </div>

        <button type="submit" className="btn btn-primary">
          Mint NFT
        </button>
      </form>

      {tokenId && (
        <div className="result">
          <h3>Minted!</h3>
          <p>Token ID: <code>{tokenId}</code></p>
          <p>Sub-account: <code>token-{tokenId}.vault.near</code></p>
          <p>
            <a href={`/history/${tokenId}`} target="_blank" rel="noopener noreferrer">
              View History
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
