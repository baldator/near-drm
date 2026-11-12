import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  contract,
  getAccountId,
  onAccountChange,
} from '../services/contract';
import { ensureRegisteredPublicKey } from '../services/near-mpc';

/**
 * Global prompt that appears after a wallet connects when the account has not
 * registered an X25519 encryption key yet.
 *
 * The check is deliberately a read-only view call, so it costs nothing and
 * does not require a wallet signature. Only pressing "Create my key" asks the
 * wallet for the CKD and registration transactions.
 */
export function EncryptionKeyPrompt() {
  const [accountId, setAccountId] = useState<string | null>(getAccountId());
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismissedFor = useRef<string | null>(null);
  const checkedFor = useRef<string | null>(null);

  // Keep the account in sync even if the prompt mounts before the wallet
  // selector finishes restoring a previous session.
  useEffect(() => {
    const sync = () => {
      const next = getAccountId();
      setAccountId((current) => (current === next ? current : next));
    };

    sync();
    const unsubscribe = onAccountChange((next) => setAccountId(next));

    return () => {
      unsubscribe();
    };
  }, []);

  // Check the on-chain registry whenever the signed-in account changes.
  useEffect(() => {
    if (!accountId) {
      setOpen(false);
      setError(null);
      dismissedFor.current = null;
      checkedFor.current = null;
      return;
    }

    if (dismissedFor.current === accountId) return;
    if (checkedFor.current === accountId) return;
    checkedFor.current = accountId;

    let cancelled = false;

    (async () => {
      try {
        const registered = await contract.get_encryption_key({
          account_id: accountId,
        });
        if (cancelled || registered) return;
        if (dismissedFor.current === accountId) return;
        setOpen(true);
      } catch (checkError) {
        // An older deployment may not expose the key registry yet. Failing the
        // check silently is better than nagging every visitor of such a build.
        console.warn('Could not check the account encryption key:', checkError);
        checkedFor.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // If the key is created from a page-level button, close the prompt too.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (!accountId || detail?.accountId !== accountId) return;
      setOpen(false);
      setError(null);
    };
    window.addEventListener('near-drm:encryption-key-registered', handler);
    return () =>
      window.removeEventListener('near-drm:encryption-key-registered', handler);
  }, [accountId]);

  const dismiss = useCallback(() => {
    if (creating) return;
    if (accountId) dismissedFor.current = accountId;
    setOpen(false);
    setError(null);
  }, [accountId, creating]);

  const handleCreate = async () => {
    if (!accountId || creating) return;

    setCreating(true);
    setError(null);
    try {
      const publicKey = await ensureRegisteredPublicKey(accountId);
      setOpen(false);
      window.dispatchEvent(
        new CustomEvent('near-drm:encryption-key-registered', {
          detail: { accountId, publicKey },
        })
      );
    } catch (createError: any) {
      setError(
        createError?.message ||
          String(createError) ||
          'The encryption key could not be created.'
      );
    } finally {
      setCreating(false);
    }
  };

  if (!open || !accountId) return null;

  return (
    <div
      className="key-prompt-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        className="key-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-prompt-title"
        aria-describedby="key-prompt-description"
      >
        <span className="key-prompt-icon" aria-hidden="true">
          🔐
        </span>
        <h2 id="key-prompt-title">Create your encryption key</h2>
        <p id="key-prompt-description">
          Your NEAR DRM files are protected with a confidential key derived by
          NEAR MPC. Create yours once to open files shared with you and to grant
          access to your own files.
        </p>
        <p className="key-prompt-note">
          The key is derived in your browser and only its public half is stored
          on-chain. You will approve a wallet transaction.
        </p>

        {error && (
          <div className="key-prompt-error" role="alert">
            {error}
          </div>
        )}

        {creating && (
          <div className="key-prompt-progress" role="status">
            <span className="gated-spinner" aria-hidden="true" />
            Creating your key with NEAR MPC…
          </div>
        )}

        <div className="key-prompt-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={dismiss}
            disabled={creating}
          >
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create my key'}
          </button>
        </div>
      </div>
    </div>
  );
}
