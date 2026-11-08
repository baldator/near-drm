import React, { useState, useEffect } from 'react';
import { contract, getAccountId, isSignedIn } from '../services/contract';
import { useParams } from 'react-router-dom';
import { nearMPC } from '../services/near-mpc';

export function GatedPage() {
  const { tokenId } = useParams();
  const [isOwner, setIsOwner] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [token, setToken] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [lockState, setLockState] = useState('');

  // Owner granting access to another account
  const [grantAccount, setGrantAccount] = useState('');
  const [grantTtl, setGrantTtl] = useState('24');
  const [revokeAccount, setRevokeAccount] = useState('');
  const [decrypting, setDecrypting] = useState(false);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [mpcKeyId] = useState('');
  const [mpcProof] = useState('');

  useEffect(() => {
    async function load() {
      if (!tokenId) return;
      try {
        const owner = await contract.nft_owner_of({ token_id: tokenId });
        setIsOwner(owner === getAccountId()!);

        const tokenData = await contract.nft_token({ token_id: tokenId });
        setToken(tokenData);

        const lock = await contract.get_lock_state({ token_id: tokenId });
        setLockState(lock);

        if (isSignedIn()) {
          const approved = await contract.nft_is_approved({
            token_id: tokenId,
            approved_account_id: getAccountId()!,
          });
          setIsApproved(approved);
        }
      } catch (error: any) {
        setStatus(`Error loading token: ${error.message || error.toString()}`);
      }
    }
    load();
  }, [tokenId]);

  const handleGrantAccess = async (targetAccount: string, ttlHours: string) => {
    if (!isSignedIn()) {
      setStatus('Please connect your wallet first.');
      return;
    }
    if (!targetAccount) {
      setStatus('Enter an account ID to grant access to.');
      return;
    }

    const expiresAt = Date.now() + parseInt(ttlHours || '24') * 60 * 60 * 1000;
    try {
      setStatus(`Granting access to ${targetAccount}...`);
      await contract.nft_approve({
        token_id: tokenId!,
        account_id: targetAccount,
        msg: JSON.stringify({
          expires_at: expiresAt,
          ttl_hours: parseInt(ttlHours || '24'),
          granted_by: getAccountId()!,
        }),
      });
      setStatus(`Access granted to ${targetAccount} for ${ttlHours} hours.`);
      setGrantAccount('');
      setGrantTtl('24');
      // Refresh approval status for the current user in case they granted themselves
      if (isSignedIn()) {
        const approved = await contract.nft_is_approved({
          token_id: tokenId!,
          approved_account_id: getAccountId()!,
        });
        setIsApproved(approved);
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message || error.toString()}`);
    }
  };

  const handleRevoke = async (targetAccount?: string) => {
    const account = targetAccount || getAccountId()!;
    try {
      setStatus(`Revoking access for ${account}...`);
      await contract.nft_revoke({
        token_id: tokenId!,
        account_id: account,
      });
      setStatus(`Access revoked for ${account}.`);
      if (isSignedIn()) {
        const approved = await contract.nft_is_approved({
          token_id: tokenId!,
          approved_account_id: getAccountId()!,
        });
        setIsApproved(approved);
      }
    } catch (error: any) {
      setStatus(`Error: ${error.message || error.toString()}`);
    }
  };

  const handleDecrypt = async () => {
    if (!isSignedIn()) {
      setStatus('Please connect your wallet first.');
      return;
    }

    setDecrypting(true);
    setDecryptError(null);
    setDecryptedContent(null);

    try {
      // Step 1: Verify NFT approval via the DRM contract
      const isApproved = await contract.nft_is_approved({
        token_id: tokenId!,
        approved_account_id: getAccountId()!,
      });

      if (!isApproved) {
        throw new Error('You do not have decryption approval for this NFT.');
      }

      // Step 2: Request decryption authorization from NEAR MPC network
      // MPC verifies the request originates from valid contract logic and
      // that the caller holds an active NEP-178 approval for the token.
      const cid = token.media.replace('ipfs://', '');
      const gatewayUrl = `https://ipfs.io/ipfs/${cid}`;
      const response = await fetch(gatewayUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch encrypted file: ${response.statusText}`);
      }

      const ciphertext = await response.text();

      // Step 3: Decrypt via NEAR MPC CKD
      const decrypted = await nearMPC.decryptWithMPC({
        ciphertext,
        keyId: mpcKeyId || `mpc-${tokenId}-${getAccountId()!}-decryption`,
        accountId: getAccountId()!,
        tokenId: tokenId!,
        mpcProof: mpcProof || `mpc-proof-${tokenId}`,
      });

      setDecryptedContent(decrypted);
      setStatus('File decrypted via NEAR MPC!');
    } catch (error: any) {
      setDecryptError(error.message || error.toString());
      setStatus('Decryption failed.');
    } finally {
      setDecrypting(false);
    }
  };

  if (!token) return <div>Loading token...</div>;

  return (
    <div className="page gated-page">
      <h1>DRM Asset: {token.title || 'Untitled'}</h1>
      <div className="status">{status}</div>

      <div className="token-info">
        <p><strong>Token ID:</strong> {tokenId}</p>
        <p><strong>Description:</strong> {token.description || 'N/A'}</p>
        <p><strong>Encrypted File:</strong> {token.media}</p>
        <p><strong>Sub-account:</strong> {token.sub_account_id}</p>
        <p><strong>Lock State:</strong> {lockState}</p>
        <p><strong>Royalty:</strong> {token.royalty_percentage} basis points</p>
      </div>

      <div className="access-section">
        <h2>Access Control</h2>
        <p>Current account: {getAccountId()!}</p>
        <p>Is Owner: {isOwner ? 'Yes' : 'No'}</p>
        <p>Your decryption access: {isApproved ? 'Yes' : 'No'}</p>

        {isOwner ? (
          <>
            <h3>Grant Access (Owner)</h3>
            <p>
              Grant decryption access to another NEAR account. Each grant can have
              its own TTL policy.
            </p>
            <div className="grant-form">
              <input
                type="text"
                placeholder="NEAR account ID (e.g. alice.testnet)"
                value={grantAccount}
                onChange={(e) => setGrantAccount(e.target.value)}
              />
              <input
                type="number"
                placeholder="TTL hours"
                value={grantTtl}
                onChange={(e) => setGrantTtl(e.target.value)}
                min="1"
              />
              <button
                onClick={() => handleGrantAccess(grantAccount, grantTtl)}
                className="btn btn-primary"
              >
                Grant Access
              </button>
            </div>
            <p className="hint">
              The owner can grant access to multiple accounts, each with a
              different TTL policy.
            </p>
            <div className="revoke-form">
              <input
                type="text"
                placeholder="NEAR account ID to revoke"
                value={revokeAccount}
                onChange={(e) => setRevokeAccount(e.target.value)}
              />
              <button
                onClick={() => handleRevoke(revokeAccount)}
                className="btn btn-outline"
              >
                Revoke Access for Account
              </button>
            </div>
          </>
        ) : (
          <>
            {isApproved ? (
              <>
                <p className="success">✓ You have decryption access!</p>
                <button onClick={() => handleRevoke()} className="btn btn-outline">
                  Revoke My Access
                </button>
              </>
            ) : (
              <p>
                You do not own this NFT and have not been granted decryption
                access. Ask the owner to grant you access.
              </p>
            )}
          </>
        )}
      </div>

      {isApproved && token.media && (
        <div className="decrypt-section">
          <h2>Decrypt</h2>
          <p>
            Encrypted file CID: <code>{token.media.replace('ipfs://', '')}</code>
          </p>
          <p>
            To decrypt: NEAR's MPC network (17 nodes, 11-of-17 threshold)
            derives the decryption key via Confidential Key Derivation. The MPC
            network verifies your NEP-178 approval for this token before
            releasing the plaintext.
          </p>

          {decryptError && (
            <div className="status" style={{ backgroundColor: '#fdecea', color: '#b3261e' }}>
              Decryption error: {decryptError}
            </div>
          )}

          {decryptedContent ? (
            <>
              <h3>Decrypted Content</h3>
              <div style={{ whiteSpace: 'pre-wrap', backgroundColor: '#f5f5f5', padding: '1rem', borderRadius: '4px', border: '1px solid #ddd' }}>
                {decryptedContent}
              </div>
              <button onClick={() => setDecryptedContent(null)} className="btn btn-outline">
                Clear
              </button>
            </>
          ) : (
            <button
              onClick={handleDecrypt}
              className="btn btn-primary"
              disabled={decrypting}
            >
              {decrypting ? 'Decrypting...' : 'Decrypt File'}
            </button>
          )}

          <p className="hint" style={{ marginTop: '0.75rem' }}>
            The encrypted file is fetched from IPFS and decrypted via NEAR MPC
            CKD. Only accounts with an active NEP-178 approval for this token
            can decrypt.
          </p>
          {mpcKeyId && (
            <div style={{ marginTop: '0.5rem' }}>
              <strong>MPC Key ID:</strong> <code>{mpcKeyId}</code>
            </div>
          )}
          {mpcProof && (
            <div style={{ marginTop: '0.25rem' }}>
              <strong>MPC Proof:</strong> <code>{mpcProof}</code>
            </div>
          )}
          <a
            href={`https://ipfs.io/ipfs/${token.media.replace('ipfs://', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ marginLeft: '0.5rem' }}
          >
            Open Encrypted File (Raw)
          </a>
        </div>
      )}
    </div>
  );
}
