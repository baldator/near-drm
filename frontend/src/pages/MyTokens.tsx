import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAccessDeadline } from '../components/AccessList';
import { contract, getAccountId, isSignedIn } from '../services/contract';
import type { TokenApproval } from '../services/contract';
import { resolveMediaUrl } from '../services/ipfs';

interface StatusMessage {
  tone: 'info' | 'success' | 'error';
  text: string;
}

async function loadTokenItem(tokenId: string) {
  try {
    const meta = await contract.nft_token({ token_id: tokenId });
    return { tokenId, ...meta };
  } catch {
    return { tokenId, title: 'Untitled', description: null, media: null };
  }
}

export function MyTokensPage() {
  const accountId = getAccountId();
  const [tokens, setTokens] = useState<any[]>([]);
  const [sharedTokens, setSharedTokens] = useState<any[]>([]);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn() || !accountId) {
      setStatus({ tone: 'info', text: 'Connect your wallet to see your collection.' });
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setStatus(null);
      setSharedError(null);
      try {
        const [tokenIds, accessResult] = await Promise.all([
          contract.nft_tokens_for_owner({
            account_id: accountId!,
            from_index: null,
            limit: 50,
          }),
          contract
            .nft_approvals_for_account({
              account_id: accountId!,
              from_index: null,
              limit: 50,
            })
            .then((list) => ({ list, error: null as string | null }))
            .catch((error: any) => ({
              list: [] as TokenApproval[],
              error: error.message || error.toString(),
            })),
        ]);

        // A token can appear in both lists if the owner approved themselves,
        // so owned tokens take precedence in the "Shared with you" section.
        const ownedIds = new Set(tokenIds);
        const sharedById = new Map<string, TokenApproval>();
        for (const entry of accessResult.list) {
          if (!ownedIds.has(entry.token_id) && !sharedById.has(entry.token_id)) {
            sharedById.set(entry.token_id, entry);
          }
        }

        const [items, sharedItems] = await Promise.all([
          Promise.all(tokenIds.map((tokenId) => loadTokenItem(tokenId))),
          Promise.all(
            Array.from(sharedById.values()).map(async (entry) => {
              const item = await loadTokenItem(entry.token_id);
              return { ...item, accessExpiresAt: entry.approval.expires_at };
            })
          ),
        ]);

        setTokens(items);
        setSharedTokens(sharedItems);
        setSharedError(accessResult.error);

        if (items.length === 0 && sharedItems.length === 0 && !accessResult.error) {
          setStatus({
            tone: 'info',
            text: "You don't own any collectibles yet, and no one has shared access with you.",
          });
        }
      } catch (error: any) {
        setStatus({
          tone: 'error',
          text: `Couldn't load your collection: ${error.message || error.toString()}`,
        });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [accountId]);

  if (loading) return <div className="tokens-loading">Loading your collection…</div>;

  const renderTokenCard = (token: any, shared: boolean) => (
    <div
      key={`${shared ? 'shared' : 'owned'}-${token.tokenId}`}
      className="tokens-card"
    >
      <div className="tokens-card-header">
        <h3>{token.title || 'Untitled'}</h3>
        <span className={`tokens-badge${shared ? ' tokens-badge-shared' : ''}`}>
          {shared ? 'Access granted' : 'You own this'}
        </span>
      </div>
      {token.description && (
        <p className="tokens-description">{token.description}</p>
      )}
      {shared && (
        <p className="tokens-deadline">
          {token.accessExpiresAt == null
            ? 'Access does not expire'
            : `Access until ${formatAccessDeadline(token.accessExpiresAt)}`}
        </p>
      )}
      <div className="tokens-actions">
        <Link to={`/history/${token.tokenId}`} className="btn btn-outline">
          View details
        </Link>{' '}
        <Link to={`/gated/${token.tokenId}`} className="btn btn-primary">
          {shared ? 'Open file' : 'Manage access'}
        </Link>
      </div>
      <div className="tokens-token-id">
        <span>NFT ID</span>
        <code>{token.tokenId}</code>
      </div>
    </div>
  );

  return (
    <div className="tokens-page">
      <header className="tokens-hero">
        <span className="tokens-eyebrow">Your collection</span>
        <h1>Your protected collectibles</h1>
        <p>
          These are the collectibles you own, plus the ones other people have
          shared with you. Each one protects a file you can open with permission.
        </p>
      </header>

      {!isSignedIn() || !accountId ? (
        <div className="tokens-connect-banner">
          <strong>Connect your wallet</strong>
          <p>Sign in to see your collectibles and manage who can open them.</p>
        </div>
      ) : null}

      {status && (
        <div className={`tokens-status tokens-status-${status.tone}`}>
          <span>{status.tone === 'success' ? '✓' : status.tone === 'error' ? '!' : 'i'}</span>
          <p>{status.text}</p>
        </div>
      )}

      <section className="tokens-section">
        <h2>Your collectibles</h2>
        {tokens.length === 0 ? (
          <p className="tokens-empty">
            No collectibles yet.{' '}
            <Link to="/mint" className="tokens-empty-link">
              Create your first one
            </Link>
            .
          </p>
        ) : (
          <div className="tokens-grid">
            {tokens.map((token) => renderTokenCard(token, false))}
          </div>
        )}
      </section>

      <section className="tokens-section">
        <h2>Shared with you</h2>
        {sharedError ? (
          <p className="tokens-empty">
            Couldn't load the collectibles shared with you: {sharedError}
          </p>
        ) : sharedTokens.length === 0 ? (
          <p className="tokens-empty">
            No one has shared access to a collectible with you yet.
          </p>
        ) : (
          <div className="tokens-grid">
            {sharedTokens.map((token) => renderTokenCard(token, true))}
          </div>
        )}
      </section>

      <section className="tokens-access">
        <h2>How access works</h2>
        <p>
          On collectibles you own, use <strong>Manage access</strong> to grant
          someone temporary access or revoke it. Collectibles in{' '}
          <strong>Shared with you</strong> stay available until their deadline,
          then you can open them from this page.
        </p>
      </section>
    </div>
  );
}
