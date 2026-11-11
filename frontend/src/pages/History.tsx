import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AccessList } from '../components/AccessList';
import { contract } from '../services/contract';
import type { NftApproval } from '../services/contract';
import { resolveMediaUrl } from '../services/ipfs';

interface StatusMessage {
  tone: 'info' | 'success' | 'error';
  text: string;
}

export function HistoryPage() {
  const { tokenId } = useParams();
  const [owner, setOwner] = useState<string | null>(null);
  const [token, setToken] = useState<any>(null);
  const [approvals, setApprovals] = useState<NftApproval[]>([]);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [loading, setLoading] = useState(true);

  const LOAD_TIMEOUT_MS = 30000;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tokenId) {
        setStatus({ tone: 'info', text: 'No collectible ID was provided.' });
        setLoading(false);
        return;
      }

      setLoading(true);
      setStatus(null);

      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error('The request timed out. Please check your connection and try again.')),
            LOAD_TIMEOUT_MS
          );
        });

        const [o, t, approvalsResult] = await Promise.race([
          Promise.all([
            contract.nft_owner_of({ token_id: tokenId }),
            contract.nft_token({ token_id: tokenId }),
            contract
              .nft_approvals({ token_id: tokenId })
              .then((list) => ({ list, error: null as string | null }))
              .catch((error: any) => ({
                list: [] as NftApproval[],
                error: error.message || error.toString(),
              })),
          ]),
          timeout,
        ]);
        if (cancelled) return;

        setOwner(o);
        setToken(t);
        setApprovals(approvalsResult.list);
        setApprovalsError(approvalsResult.error);
        if (!t) {
          setStatus({
            tone: 'error',
            text: `The collectible "${tokenId}" wasn't found.`,
          });
        }
      } catch (error: any) {
        if (cancelled) return;
        setStatus({
          tone: 'error',
          text: `Couldn't load details: ${error.message || error.toString()}`,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  if (loading) return <div className="history-loading">Loading details…</div>;

  return (
    <div className="history-page">
      <header className="history-hero">
        <span className="history-eyebrow">About this collectible</span>
        <h1>{token?.title || 'Untitled'}</h1>
        <p>{token?.description || 'A protected collectible on NEAR.'}</p>
      </header>

      {status && (
        <div className={`history-status history-status-${status.tone}`}>
          <span>{status.tone === 'success' ? '✓' : status.tone === 'error' ? '!' : 'i'}</span>
          <p>{status.text}</p>
        </div>
      )}

      {!token && (
        <div className="history-empty">
          <p>
            We couldn't find this collectible. It may not exist, or you may not
            have permission to view it.
          </p>
        </div>
      )}

      {token && (
        <section className="history-details">
          <h2>Collectible details</h2>
          <div className="history-grid">
            <div className="history-card">
              <span className="history-label">Owner</span>
              <p className="history-value">{owner}</p>
            </div>
            <div className="history-card">
              <span className="history-label">File</span>
              <p className="history-value">
                {token.media ? (
                  <a
                    href={resolveMediaUrl(token.media)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="history-file-link"
                  >
                    Open protected file
                  </a>
                ) : (
                  'No file attached'
                )}
              </p>
            </div>
            {token.access_rules && (
              <div className="history-card">
                <span className="history-label">Access expires</span>
                <p className="history-value">
                  {token.access_rules.ttl_hours
                    ? `${token.access_rules.ttl_hours} hours after being granted`
                    : 'No expiration set'}
                </p>
              </div>
            )}
            <div className="history-card">
              <span className="history-label">NFT ID</span>
              <p className="history-value"><code>{tokenId}</code></p>
            </div>
          </div>
          <section className="history-access">
            <h3>People with access</h3>
            <p className="history-access-intro">
              These accounts can open the protected file until their deadline.
            </p>
            {approvalsError ? (
              <p className="access-empty">
                Couldn't load the access list: {approvalsError}
              </p>
            ) : (
              <AccessList
                approvals={approvals}
                emptyText="No one else has access to this collectible yet."
              />
            )}
          </section>
          <div className="history-actions">
            <Link to={`/gated/${tokenId}`} className="btn btn-primary">
              Manage access
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
