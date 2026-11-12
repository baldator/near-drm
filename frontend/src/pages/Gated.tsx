import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AccessList } from '../components/AccessList';
import { contract, getAccountId, isSignedIn } from '../services/contract';
import type { NftApproval } from '../services/contract';
import {
  ensureRegisteredPublicKey,
  grantContentKey,
  openProtectedFile,
} from '../services/near-mpc';
import { resolveMediaUrl } from '../services/ipfs';

interface StatusMessage {
  tone: 'info' | 'success' | 'error';
  text: string;
}

const TTL_OPTIONS = [
  { value: '24', label: '1 day', hint: 'Access expires in 24 hours' },
  { value: '72', label: '3 days', hint: 'Access expires in 3 days' },
  { value: '168', label: '1 week', hint: 'Access expires in 1 week' },
  { value: '720', label: '30 days', hint: 'Access expires in 30 days' },
];

interface ProtectedFileInfo {
  fileName: string;
  fileType: string;
  encrypted: boolean;
  legacy: boolean;
}

// `extra` is stored on the contract as a JSON string (see Mint.tsx), so it has
// to be parsed before we can read the original file name, MIME type, and the
// encryption metadata.
function readProtectedFileInfo(token: any): ProtectedFileInfo {
  let extra: any = token?.extra;
  if (typeof extra === 'string') {
    try {
      extra = JSON.parse(extra);
    } catch {
      extra = null;
    }
  }

  const media = typeof token?.media === 'string' ? token.media : '';
  const legacy =
    extra?.content_encoding === 'base64' ||
    Boolean(extra?.mpc_key_id) ||
    media.startsWith('mpc-encrypted:');

  return {
    fileName: extra?.file_name || token?.title || 'protected-file',
    fileType: extra?.file_type || 'application/octet-stream',
    encrypted: Boolean(extra?.encryption),
    legacy,
  };
}

function canPreviewAsText(fileType: string): boolean {
  return (
    fileType.startsWith('text/') ||
    fileType === 'application/json' ||
    fileType === 'application/xml'
  );
}

export function GatedPage() {
  const { tokenId } = useParams();
  const [token, setToken] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [grantAccount, setGrantAccount] = useState('');
  const [grantTtl, setGrantTtl] = useState('24');
  const [decrypting, setDecrypting] = useState(false);
  const [decryptedPreview, setDecryptedPreview] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState('protected-file');
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<NftApproval[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [revokingAccount, setRevokingAccount] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [registeringKey, setRegisteringKey] = useState(false);

  useEffect(() => {
    if (!tokenId) return;
    // Capture the id so its narrowing survives inside the async closure
    // (TypeScript does not preserve narrowing of outer variables in callbacks).
    const id = tokenId;
    async function load() {
      try {
        const o = await contract.nft_owner_of({ token_id: id });
        setIsOwner(o === (getAccountId() || ''));

        const tokenData = await contract.nft_token({ token_id: id });
        setToken(tokenData);

        if (isSignedIn()) {
          const approved = await contract.nft_is_approved({
            token_id: id,
            approved_account_id: getAccountId()!,
          });
          setIsApproved(approved);

          try {
            const key = await contract.get_encryption_key({
              account_id: getAccountId()!,
            });
            setEncryptionKey(key || null);
          } catch {
            // Older deployments may not have the encryption-key view yet.
          }
        }
      } catch (error: any) {
        setStatus({ tone: 'error', text: `Couldn't load this file: ${error.message || error.toString()}` });
      }
    }
    load();
  }, [tokenId]);

  // Free the temporary download URL when the page closes or it is replaced.
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const refreshApprovals = useCallback(async () => {
    if (!tokenId) return;
    setApprovalsLoading(true);
    setApprovalsError(null);
    try {
      const list = await contract.nft_approvals({ token_id: tokenId });
      setApprovals(list || []);
    } catch (error: any) {
      setApprovalsError(error.message || error.toString());
    } finally {
      setApprovalsLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    refreshApprovals();
  }, [refreshApprovals]);

  const handleRegisterKey = async () => {
    if (!isSignedIn()) {
      setStatus({ tone: 'error', text: 'Please connect your wallet first.' });
      return;
    }
    setRegisteringKey(true);
    setStatus({
      tone: 'info',
      text: 'Creating your confidential key with NEAR MPC. Please approve the wallet request…',
    });
    try {
      const publicKey = await ensureRegisteredPublicKey(getAccountId()!);
      setEncryptionKey(publicKey);
      setStatus({
        tone: 'success',
        text: 'Your encryption key is registered. The owner can now share protected files with you.',
      });
    } catch (error: any) {
      setStatus({
        tone: 'error',
        text: `Couldn't create your encryption key: ${error.message || error.toString()}`,
      });
    } finally {
      setRegisteringKey(false);
    }
  };

  const handleGrantAccess = async (targetAccount: string, ttlHours: string) => {
    if (!isSignedIn()) {
      setStatus({ tone: 'error', text: 'Please connect your wallet first.' });
      return;
    }
    if (!targetAccount) {
      setStatus({ tone: 'error', text: 'Enter a NEAR account ID to grant access to.' });
      return;
    }
    setStatus({ tone: 'info', text: `Granting access to ${targetAccount}…` });
    try {
      const recipientKey = await contract.get_encryption_key({
        account_id: targetAccount,
      });
      if (!recipientKey) {
        throw new Error(
          `${targetAccount} has not set up an encryption key yet. Ask them to open this page and click "Create my encryption key" first.`
        );
      }

      setStatus({
        tone: 'info',
        text: `Wrapping the content key for ${targetAccount} with NEAR MPC…`,
      });
      const keyEnvelope = await grantContentKey(
        tokenId!,
        getAccountId()!,
        targetAccount
      );

      // The contract stores the (expires_at) deadline and the wrapped key in
      // one transaction, so access and key delivery cannot diverge.
      const deadlineMs =
        Date.now() + parseInt(ttlHours || '24') * 60 * 60 * 1000;
      const expiresAt = deadlineMs * 1_000_000;
      await contract.nft_approve({
        token_id: tokenId!,
        account_id: targetAccount,
        msg: JSON.stringify({
          expires_at: expiresAt,
          ttl_hours: parseInt(ttlHours || '24'),
          granted_by: getAccountId()!,
          key_envelope: keyEnvelope,
        }),
      });

      setStatus({ tone: 'success', text: `Access granted to ${targetAccount} for ${ttlHours} hours.` });
      setGrantAccount('');
      setGrantTtl('24');
      await refreshApprovals();
      if (isSignedIn()) {
        const approved = await contract.nft_is_approved({
          token_id: tokenId!,
          approved_account_id: getAccountId()!,
        });
        setIsApproved(approved);
      }
    } catch (error: any) {
      setStatus({ tone: 'error', text: `Couldn't grant access: ${error.message || error.toString()}` });
    }
  };

  const handleRevoke = async (account: string) => {
    if (!account) return;
    setRevokingAccount(account);
    setStatus({ tone: 'info', text: `Revoking access for ${account}…` });
    try {
      await contract.nft_revoke({
        token_id: tokenId!,
        account_id: account,
      });
      setStatus({ tone: 'success', text: `Access revoked for ${account}. Their wrapped key was deleted.` });
      await refreshApprovals();
      if (isSignedIn()) {
        const approved = await contract.nft_is_approved({
          token_id: tokenId!,
          approved_account_id: getAccountId()!,
        });
        setIsApproved(approved);
      }
    } catch (error: any) {
      setStatus({ tone: 'error', text: `Couldn't revoke access: ${error.message || error.toString()}` });
    } finally {
      setRevokingAccount(null);
    }
  };

  const handleDecrypt = async () => {
    if (!isSignedIn()) {
      setStatus({ tone: 'error', text: 'Please connect your wallet first.' });
      return;
    }

    setDecrypting(true);
    setDecryptError(null);
    setDecryptedPreview(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      const info = readProtectedFileInfo(token);
      if (info.legacy) {
        throw new Error(
          'This file was created with the old demo encryption format and cannot be opened. Re-create it from the mint page to use AES-256-GCM.'
        );
      }
      if (!info.encrypted) {
        throw new Error(
          'This token points to an external link rather than an encrypted file. Open the link directly instead.'
        );
      }

      const isApprovedCheck =
        isOwner ||
        (await contract.nft_is_approved({
          token_id: tokenId!,
          approved_account_id: getAccountId()!,
        }));

      if (!isApprovedCheck) {
        throw new Error("You don't have permission to open this file.");
      }

      setStatus({
        tone: 'info',
        text: 'Fetching your wrapped key from NEAR MPC…',
      });

      const response = await fetch(resolveMediaUrl(token.media));
      if (!response.ok) {
        throw new Error(`Failed to fetch the protected file (${response.status}).`);
      }
      const ciphertext = new Uint8Array(await response.arrayBuffer());

      const plaintext = await openProtectedFile(
        tokenId!,
        getAccountId()!,
        ciphertext
      );

      const blob = new Blob([plaintext as BlobPart], { type: info.fileType });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(info.fileName);
      setDecryptedPreview(
        canPreviewAsText(info.fileType)
          ? new TextDecoder().decode(plaintext)
          : null
      );
      setStatus({ tone: 'success', text: 'The file is ready to download.' });
    } catch (error: any) {
      setDecryptError(error.message || error.toString());
      setStatus({ tone: 'error', text: "Couldn't open the file." });
    } finally {
      setDecrypting(false);
    }
  };

  if (!token) {
    return (
      <div className="gated-page">
        <header className="gated-hero">
          <span className="gated-eyebrow">Protected file</span>
          <h1>Loading…</h1>
        </header>
        <div className="gated-loading">Loading file details…</div>
      </div>
    );
  }

  return (
    <div className="gated-page">
      <header className="gated-hero">
        <span className="gated-eyebrow">Protected file</span>
        <h1>{token.title || 'Untitled'}</h1>
        <p>{token.description || 'A protected collectible file.'}</p>
      </header>

      {status && (
        <div className={`gated-status gated-status-${status.tone}`}>
          <span>{status.tone === 'success' ? '✓' : status.tone === 'error' ? '!' : 'i'}</span>
          <p>{status.text}</p>
        </div>
      )}

      {!isSignedIn() && (
        <div className="gated-connect-banner">
          <strong>Connect your wallet</strong>
          <p>Sign in to open this file or manage access.</p>
        </div>
      )}

      {isSignedIn() && (
        <section className="gated-step">
          <div className="gated-step-heading">
            <div>
              <h2>Your encryption key</h2>
              <p>
                Your key is derived confidentially by NEAR MPC and never stored
                on-chain. You need it to open files shared with you.
              </p>
            </div>
          </div>
          {encryptionKey ? (
            <div className="gated-status gated-status-success">
              <span>✓</span>
              <p>Your encryption key is registered and ready.</p>
            </div>
          ) : (
            <>
              <p className="gated-help">
                Create your key once. You will approve one wallet transaction
                and wait a few seconds for the MPC network.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleRegisterKey}
                disabled={registeringKey}
              >
                {registeringKey ? 'Creating your key…' : 'Create my encryption key'}
              </button>
            </>
          )}
        </section>
      )}

      <div className="gated-access-badge">
        {isOwner ? (
          <span className="gated-badge gated-badge-owner">👑 You own this</span>
        ) : isApproved ? (
          <span className="gated-badge gated-badge-approved">✓ You can open this</span>
        ) : (
          <span className="gated-badge gated-badge-locked">🔒 Access not granted</span>
        )}
      </div>

      {!isOwner && !isApproved && (
        <div className="gated-empty">
          <p>
            Only the owner can share this file. If you know the owner, ask them
            to grant you access.
          </p>
        </div>
      )}

      {isOwner && (
        <section className="gated-step">
          <div className="gated-step-heading">
            <div className="gated-step-number">1</div>
            <div>
              <h2>Share access</h2>
              <p>Let someone else open this file for a limited time.</p>
            </div>
          </div>
          <div className="gated-field">
            <div className="gated-label-row">
              <label htmlFor="gated-account">NEAR account (e.g. alice.testnet)</label>
              <span className="gated-badge gated-badge-required">Required</span>
            </div>
            <input
              id="gated-account"
              className="gated-input"
              type="text"
              value={grantAccount}
              onChange={(e) => setGrantAccount(e.target.value)}
              placeholder="Enter a NEAR account ID"
              autoComplete="off"
            />
            <p className="gated-help">
              This is the NEAR account ID of the person you want to share with.
              They must create their encryption key first.
            </p>
          </div>
          <div className="gated-field">
            <div className="gated-label-row">
              <label htmlFor="gated-ttl">Access lasts for</label>
              <span className="gated-badge gated-badge-optional">Optional</span>
            </div>
            <div className="gated-choice-grid">
              {TTL_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`gated-choice${grantTtl === opt.value ? ' is-selected' : ''}`}
                  onClick={() => setGrantTtl(opt.value)}
                >
                  <input
                    type="radio"
                    name="gated-ttl"
                    value={opt.value}
                    checked={grantTtl === opt.value}
                    readOnly
                  />
                  <div className="gated-choice-body">
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => handleGrantAccess(grantAccount, grantTtl)}
            disabled={!grantAccount}
          >
            Grant access
          </button>
        </section>
      )}

      <section className="gated-step gated-access-section">
        <div className="gated-step-heading">
          <div>
            <h2>People with access</h2>
            <p>
              {isOwner
                ? 'These accounts can open this file until their deadline. Revoke access at any time.'
                : 'These accounts can open this file until their deadline.'}
            </p>
          </div>
        </div>
        {approvalsError ? (
          <p className="access-empty">
            Couldn't load the people with access: {approvalsError}
          </p>
        ) : (
          <AccessList
            approvals={approvals}
            loading={approvalsLoading}
            emptyText="No one else has access to this file yet."
            onRevoke={isOwner ? handleRevoke : undefined}
            revokingAccountId={revokingAccount}
          />
        )}
      </section>

      {(isOwner || isApproved) && (
        <section className="gated-step">
          <div className="gated-step-heading">
            <div className="gated-step-number">2</div>
            <div>
              <h2>Open the file</h2>
              <p>Decrypt and download your protected file.</p>
            </div>
          </div>
          {decrypting && (
            <div className="gated-progress">
              <span className="gated-spinner" aria-hidden="true" />
              Opening…
            </div>
          )}
          {decryptError && (
            <div className="gated-status gated-status-error">
              <span>!</span>
              <p>{decryptError}</p>
            </div>
          )}
          {downloadUrl ? (
            <>
              <div className="gated-status gated-status-success">
                <span>✓</span>
                <p>The file is ready.</p>
              </div>
              <a
                href={downloadUrl}
                download={downloadName}
                className="btn btn-primary"
              >
                Download {downloadName}
              </a>
              {decryptedPreview && (
                <div className="gated-decrypted-preview">{decryptedPreview}</div>
              )}
              <button
                onClick={() => {
                  setDecryptedPreview(null);
                  URL.revokeObjectURL(downloadUrl);
                  setDownloadUrl(null);
                }}
                className="btn btn-outline"
              >
                Clear
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleDecrypt}
              disabled={decrypting}
            >
              {decrypting ? 'Opening…' : 'Open protected file'}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
