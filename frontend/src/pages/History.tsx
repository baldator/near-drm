import React, { useEffect, useState } from 'react';
import { contract } from '../services/contract';
import { useParams } from 'react-router-dom';

export function HistoryPage() {
  const { tokenId } = useParams();
  const [owner, setOwner] = useState<string | null>(null);
  const [token, setToken] = useState<any>(null);
  const [subAccount, setSubAccount] = useState<string | null>(null);
  const [lockState, setLockState] = useState<string>('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    async function load() {
      if (!tokenId) return;
      try {
        const [o, t, sa, ls] = await Promise.all([
          contract.nft_owner_of({ token_id: tokenId }),
          contract.nft_token({ token_id: tokenId }),
          contract.get_sub_account({ token_id: tokenId }),
          contract.get_lock_state({ token_id: tokenId }),
        ]);
        setOwner(o);
        setToken(t);
        setSubAccount(sa);
        setLockState(ls);
      } catch (error: any) {
        setStatus(`Error loading history: ${error.message || error.toString()}`);
      }
    }
    load();
  }, [tokenId]);

  if (!token) return <div>Loading history...</div>;

  return (
    <div className="page history-page">
      <h1>NFT History: {tokenId}</h1>
      <div className="status">{status}</div>

      <div className="history-grid">
        <div className="card">
          <h3>Current Owner</h3>
          <p>{owner}</p>
        </div>

        <div className="card">
          <h3>Sub-Account</h3>
          <p>{subAccount}</p>
          <small>Revenue account bound to this NFT</small>
        </div>

        <div className="card">
          <h3>Lock State</h3>
          <p>{lockState}</p>
          <small>{lockState === 'Locked' ? 'Transfer in progress' : 'Active'}</small>
        </div>

        <div className="card">
          <h3>Asset Metadata</h3>
          <p><strong>Title:</strong> {token.title}</p>
          <p><strong>Description:</strong> {token.description}</p>
          <p><strong>Encrypted File:</strong> <a href={token.media} target="_blank" rel="noopener noreferrer">{token.media}</a></p>
          <p><strong>Access TTL:</strong> {token.access_rules?.ttl_hours} hours</p>
          <p><strong>Single Use:</strong> {token.access_rules?.single_use ? 'Yes' : 'No'}</p>
          <p><strong>Royalty:</strong> {token.royalty_percentage} bps</p>
        </div>
      </div>

      <div className="card">
        <h3>DRM Access Rules</h3>
        <ul>
          <li>File: IPFS/Arweave CID stored on-chain</li>
          <li>Access granted via NEP-178 <code>nft_approve</code></li>
          <li>Access revoked via NEP-178 <code>nft_revoke</code></li>
          <li>Decryption keys issued by Lit Protocol on approve event</li>
          <li>Keys expire based on TTL in metadata</li>
        </ul>
      </div>

      <div className="card">
        <h3>Threat Model Defenses</h3>
        <ul>
          <li>Sub-account has zero external keys — controlled only by root contract</li>
          <li>Transfer lockout during settlement (<code>LOCKED</code> state)</li>
          <li>All approvals cleared on transfer (no dangling spenders)</li>
          <li>Balance belongs to current holder at withdrawal time</li>
        </ul>
      </div>
    </div>
  );
}