import React from 'react';
import type { NftApproval } from '../services/contract';

interface AccessListProps {
  approvals: NftApproval[];
  loading?: boolean;
  emptyText?: string;
  onRevoke?: (accountId: string) => void;
  revokingAccountId?: string | null;
}

function toMilliseconds(expiresAt: number): number {
  // NEAR timestamps are nanoseconds. Tolerate millisecond values as well so
  // the helper keeps working if the contract ever returns a different unit.
  return expiresAt > 1e15 ? Math.floor(expiresAt / 1_000_000) : expiresAt;
}

export function formatAccessDeadline(
  expiresAt: number | string | null | undefined
): string {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
    return 'No expiration';
  }

  const raw = typeof expiresAt === 'string' ? Number(expiresAt) : expiresAt;
  if (!Number.isFinite(raw)) return 'No expiration';

  const date = new Date(toMilliseconds(raw));
  if (Number.isNaN(date.getTime())) return 'No expiration';

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isExpired(expiresAt: number | string | null): boolean {
  if (expiresAt === null || expiresAt === '') return false;
  const raw = typeof expiresAt === 'string' ? Number(expiresAt) : expiresAt;
  if (!Number.isFinite(raw)) return false;
  return toMilliseconds(raw) <= Date.now();
}

export function AccessList({
  approvals,
  loading = false,
  emptyText = 'No one else has access yet.',
  onRevoke,
  revokingAccountId = null,
}: AccessListProps) {
  if (loading) {
    return <p className="access-empty">Loading people with access…</p>;
  }

  if (approvals.length === 0) {
    return <p className="access-empty">{emptyText}</p>;
  }

  return (
    <ul className="access-list">
      {approvals.map((approval) => {
        const expired = isExpired(approval.expires_at);
        const revoking = revokingAccountId === approval.account_id;

        return (
          <li className="access-row" key={approval.account_id}>
            <div className="access-info">
              <span className="access-account">{approval.account_id}</span>
              <span
                className={`access-deadline${expired ? ' access-deadline-expired' : ''}`}
              >
                {expired ? 'Expired ' : 'Expires '}
                {formatAccessDeadline(approval.expires_at)}
              </span>
            </div>
            {onRevoke && (
              <button
                type="button"
                className="btn btn-outline access-revoke"
                onClick={() => onRevoke(approval.account_id)}
                disabled={revoking}
              >
                {revoking ? 'Revoking…' : 'Revoke'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
