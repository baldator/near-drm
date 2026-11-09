import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  contract,
  getAccountId,
  getModal,
  initWalletSelector,
  isSignedIn,
  CONTRACT_ID,
} from '../services/contract';
import { nearMPC } from '../services/near-mpc';

const IPFS_UPLOAD_URL =
  process.env.REACT_APP_IPFS_UPLOAD_URL ||
  'https://api.thegraph.com/ipfs/api/v0/add';
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type SourceMode = 'file' | 'link';
type StatusTone = 'info' | 'success' | 'error';

interface StatusMessage {
  tone: StatusTone;
  text: string;
}

interface PreparedAsset {
  media: string;
  keyId: string | null;
  extra: string | null;
}

const DURATION_OPTIONS = [
  { value: '1', label: '1 hour' },
  { value: '24', label: '24 hours' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function humanizeFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('We could not read that file.'));
        return;
      }
      const comma = reader.result.indexOf(',');
      resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
    };
    reader.onerror = () => reject(new Error('We could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function normalizeMediaLink(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (
    value.startsWith('ipfs://') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    return value;
  }
  if (
    value.startsWith('Qm') ||
    value.startsWith('bafy') ||
    value.startsWith('bafk')
  ) {
    return `ipfs://${value}`;
  }
  return value;
}

async function uploadProtectedFile(
  content: string,
  fileName: string
): Promise<string> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([content], { type: 'text/plain;charset=utf-8' }),
    fileName
  );

  const response = await fetch(IPFS_UPLOAD_URL, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(`The storage service returned ${response.status}.`);
  }

  const raw = await response.text();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The storage service returned an unexpected response.');
  }

  const cid = parsed.Hash || parsed.hash || parsed.cid;
  if (!cid) {
    throw new Error('The storage service did not return a file address.');
  }
  return cid;
}

function friendlyError(error: any): string {
  const raw = String(error?.message || error || 'Something went wrong.');

  if (/only owner can mint/i.test(raw)) {
    return 'This wallet is not allowed to create NFTs in this vault. Connect the creator wallet for this vault, or ask the site owner to add your account.';
  }
  if (/user (rejected|cancelled|canceled)|denied|reject/i.test(raw)) {
    return 'No charge was made. You can try again whenever you are ready.';
  }
  if (/insufficient|balance|deposit/i.test(raw)) {
    return 'Your wallet does not have enough NEAR for the small network fee. Add a little testnet NEAR and try again.';
  }
  if (/storage service|upload|ipfs|file/i.test(raw)) {
    return `We could not save the protected file. ${raw}`;
  }
  return `Something went wrong: ${raw}`;
}

export function MintPage() {
  const [accountId, setAccountId] = useState<string | null>(getAccountId());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceMode, setSourceMode] = useState<SourceMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [durationPreset, setDurationPreset] = useState('24');
  const [customHours, setCustomHours] = useState('48');
  const [singleUse, setSingleUse] = useState(true);
  const [royaltyPercent, setRoyaltyPercent] = useState('10');
  const [whitelistRoot, setWhitelistRoot] = useState('');
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [minting, setMinting] = useState(false);
  const [phase, setPhase] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [mintedTitle, setMintedTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  // Keep the wallet indicator in sync with the header's Connect button.
  useEffect(() => {
    const timer = window.setInterval(() => setAccountId(getAccountId()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (tokenId) {
      successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [tokenId]);

  const selectFile = (selected: File | null) => {
    if (!selected) return;

    if (selected.size > MAX_FILE_BYTES) {
      setStatus({
        tone: 'error',
        text: `That file is ${formatBytes(
          selected.size
        )}. Please choose a file under 5 MB for this demo.`,
      });
      return;
    }

    setFile(selected);
    setStatus(null);
    if (!title.trim()) {
      setTitle(humanizeFileName(selected.name));
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const prepareAsset = async (newTokenId: string): Promise<PreparedAsset> => {
    if (sourceMode === 'link') {
      return {
        media: normalizeMediaLink(link),
        keyId: null,
        extra: null,
      };
    }

    if (!file) {
      throw new Error('Please choose a file first.');
    }

    setPhase('Reading your file…');
    const base64 = await fileToBase64(file);

    setPhase('Protecting your file…');
    const derivation = await nearMPC.requestKeyDerivation({
      contractId: CONTRACT_ID,
      tokenId: newTokenId,
      accountId: getAccountId()!,
      purpose: 'encryption',
      nonce: Math.random().toString(36).slice(2),
    });

    const result = await nearMPC.encryptWithMPC({
      content: base64,
      keyId: derivation.keyId,
      mpcProof: derivation.derivationProof,
    });

    setPhase('Saving your protected copy…');
    const safeName =
      file.name.replace(/[^a-zA-Z0-9._-]/g, '-') || 'protected-file';
    const cid = await uploadProtectedFile(
      result.ciphertext,
      `${safeName}.protected.txt`
    );

    const extra = JSON.stringify({
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      content_encoding: 'base64',
      mpc_key_id: result.keyId,
      protected_at: new Date().toISOString(),
    });

    return {
      media: `ipfs://${cid}`,
      keyId: result.keyId,
      extra,
    };
  };

  const handleMint = async (event: React.FormEvent) => {
    event.preventDefault();
    if (minting) return;

    if (!isSignedIn()) {
      setStatus({
        tone: 'error',
        text: 'Please connect your NEAR wallet first. Use the Connect button in the top-right corner.',
      });
      return;
    }
    if (!title.trim()) {
      setStatus({ tone: 'error', text: 'Please give your NFT a title.' });
      return;
    }
    if (sourceMode === 'file' && !file) {
      setStatus({
        tone: 'error',
        text: 'Please choose the file you want to protect.',
      });
      return;
    }
    if (sourceMode === 'link' && !link.trim()) {
      setStatus({
        tone: 'error',
        text: 'Please paste the link to your protected file.',
      });
      return;
    }

    const royalty = Number(royaltyPercent);
    if (!Number.isFinite(royalty) || royalty < 0 || royalty > 50) {
      setStatus({
        tone: 'error',
        text: 'Please choose a resale royalty between 0% and 50%.',
      });
      return;
    }

    const hours =
      durationPreset === 'custom'
        ? parseInt(customHours, 10)
        : parseInt(durationPreset, 10);
    if (!Number.isFinite(hours) || hours < 1) {
      setStatus({
        tone: 'error',
        text: 'Please choose how long access should last (at least 1 hour).',
      });
      return;
    }

    setMinting(true);
    setTokenId('');
    setMintedTitle('');
    setCopied(false);
    setStatus(null);

    const newTokenId = `token-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    try {
      const prepared = await prepareAsset(newTokenId);

      setPhase('Creating your NFT…');
      const metadata = {
        title: title.trim(),
        description: description.trim(),
        media: prepared.media,
        encrypted: true,
        access_rules: {
          ttl_hours: hours,
          single_use: singleUse,
          max_views: singleUse ? 1 : undefined,
        },
        whitelist_root: whitelistRoot.trim() || null,
        sub_account_id: `token-${newTokenId}.vault.near`,
        decryption_key_cid: prepared.keyId,
        royalty_percentage: Math.round(royalty * 100),
        extra: prepared.extra,
      };

      await contract.nft_mint({
        token_id: newTokenId,
        owner_id: getAccountId()!,
        metadata,
      });

      setTokenId(newTokenId);
      setMintedTitle(title.trim());
      setStatus({
        tone: 'success',
        text: 'Your NFT is live! Use the buttons below to manage access or share it.',
      });
    } catch (error: any) {
      setStatus({ tone: 'error', text: friendlyError(error) });
    } finally {
      setMinting(false);
      setPhase('');
    }
  };

  const copyTokenId = async () => {
    try {
      await navigator.clipboard.writeText(tokenId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the ID is still visible to copy manually.
    }
  };

  const openWalletModal = async () => {
    let modal = getModal();
    if (!modal) {
      try {
        await initWalletSelector();
        modal = getModal();
      } catch {
        // The header's connect button remains available as a fallback.
      }
    }
    modal?.show();
  };

  return (
    <div className="mint-page">
      <header className="mint-hero">
        <span className="mint-eyebrow">Create</span>
        <h1>Turn a file into a protected collectible</h1>
        <p>
          Add your work, choose how people can open it, and create an NFT that
          can be bought, sold, or shared — all from your NEAR wallet.
        </p>
        <div className="mint-hero-points">
          <span>🔒 Stays private</span>
          <span>⏱ You control access</span>
          <span>💸 Earn when it resells</span>
        </div>
      </header>

      {!accountId && (
        <div className="mint-connect-banner">
          <div>
            <strong>Connect your wallet to create an NFT</strong>
            <p>Your wallet is your login — it keeps the NFT and your earnings safe.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openWalletModal}
          >
            Connect wallet
          </button>
        </div>
      )}

      {status && (
        <div
          className={`mint-status mint-status-${status.tone}`}
          role="status"
        >
          <span>{status.tone === 'success' ? '✓' : status.tone === 'error' ? '!' : 'i'}</span>
          <p>{status.text}</p>
        </div>
      )}

      <form className="mint-form" onSubmit={handleMint}>
        {/* Step 1 — Details */}
        <section className="mint-step" aria-labelledby="mint-step-1">
          <div className="mint-step-heading">
            <span className="mint-step-number">1</span>
            <div>
              <h2 id="mint-step-1">Describe your work</h2>
              <p>This is what buyers will see when they find your NFT.</p>
            </div>
          </div>

          <div className="mint-field">
            <div className="mint-label-row">
              <label htmlFor="mint-title">Title</label>
              <span className="mint-badge">Required</span>
            </div>
            <input
              id="mint-title"
              className="mint-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Watercolor texture pack"
              autoComplete="off"
            />
            <p className="mint-help">
              A short, clear name. This is the first thing people will notice.
            </p>
          </div>

          <div className="mint-field">
            <div className="mint-label-row">
              <label htmlFor="mint-description">Description</label>
              <span className="mint-badge mint-badge-muted">Optional</span>
            </div>
            <textarea
              id="mint-description"
              className="mint-input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is inside? Who is it for?"
              rows={3}
            />
            <p className="mint-help">
              Tell buyers what they will get. This appears on the NFT&apos;s page.
            </p>
          </div>
        </section>

        {/* Step 2 — File */}
        <section className="mint-step" aria-labelledby="mint-step-2">
          <div className="mint-step-heading">
            <span className="mint-step-number">2</span>
            <div>
              <h2 id="mint-step-2">Add your file</h2>
              <p>We will protect it before it is saved, so nobody can open it without your permission.</p>
            </div>
          </div>

          <div className="mint-tabs" role="tablist" aria-label="How to add your file">
            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === 'file'}
              className={`mint-tab${sourceMode === 'file' ? ' is-active' : ''}`}
              onClick={() => setSourceMode('file')}
            >
              Upload a file
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === 'link'}
              className={`mint-tab${sourceMode === 'link' ? ' is-active' : ''}`}
              onClick={() => setSourceMode('link')}
            >
              I already have a link
            </button>
          </div>

          {sourceMode === 'file' ? (
            <div
              className={`mint-dropzone${dragActive ? ' is-dragging' : ''}${
                file ? ' has-file' : ''
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                if (
                  event.relatedTarget &&
                  event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                  return;
                }
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                id="mint-file"
                className="mint-file-input"
                type="file"
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="mint-file-card">
                  <span className="mint-file-icon" aria-hidden="true">
                    📄
                  </span>
                  <div className="mint-file-info">
                    <strong>{file.name}</strong>
                    <span>{formatBytes(file.size)} · protected before upload</span>
                  </div>
                  <button
                    type="button"
                    className="mint-link-button"
                    onClick={clearFile}
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <label htmlFor="mint-file" className="mint-drop-label">
                  <span className="mint-drop-icon" aria-hidden="true">
                    ⬆
                  </span>
                  <strong>Choose a file or drag it here</strong>
                  <span>We will protect it and save a copy for you.</span>
                  <span className="mint-drop-note">
                    Images, PDFs, audio, video, documents — up to 5 MB
                  </span>
                </label>
              )}
            </div>
          ) : (
            <div className="mint-field">
              <label htmlFor="mint-link">Link to your protected file</label>
              <input
                id="mint-link"
                className="mint-input"
                type="text"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://…"
                autoComplete="off"
              />
              <p className="mint-help">
                Paste a link to a file you have already protected. Not protected
                yet? Switch to &ldquo;Upload a file&rdquo; and we will do it for you.
              </p>
            </div>
          )}

          <div className="mint-note">
            <span className="mint-note-icon" aria-hidden="true">
              🔒
            </span>
            <div>
              <strong>What happens to my file?</strong>
              <p>
                {sourceMode === 'file'
                  ? 'It is scrambled on your device before it is saved. Only people you approve can unlock the original.'
                  : 'The link is stored as-is. Make sure it points to a protected file, not the original.'}
              </p>
            </div>
          </div>
        </section>

        {/* Step 3 — Access and earnings */}
        <section className="mint-step" aria-labelledby="mint-step-3">
          <div className="mint-step-heading">
            <span className="mint-step-number">3</span>
            <div>
              <h2 id="mint-step-3">Choose how people can use it</h2>
              <p>You can change these settings later from the NFT&apos;s page.</p>
            </div>
          </div>

          <div className="mint-field">
            <label>How long should access last after someone unlocks it?</label>
            <div className="mint-pill-row">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`mint-pill${
                    durationPreset === option.value ? ' is-active' : ''
                  }`}
                  onClick={() => setDurationPreset(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {durationPreset === 'custom' && (
              <div className="mint-inline-input">
                <input
                  className="mint-input"
                  type="number"
                  min={1}
                  value={customHours}
                  onChange={(event) => setCustomHours(event.target.value)}
                  aria-label="Custom access length in hours"
                />
                <span>hours</span>
              </div>
            )}
            <p className="mint-help">
              The clock starts when you grant someone access. After this time,
              the unlock link stops working.
            </p>
          </div>

          <div className="mint-field">
            <label>How many times can they open it?</label>
            <div className="mint-choice-grid">
              <label
                className={`mint-choice${singleUse ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="mint-views"
                  checked={singleUse}
                  onChange={() => setSingleUse(true)}
                />
                <span className="mint-choice-body">
                  <strong>One time only</strong>
                  <span>The link stops working after the first open.</span>
                </span>
              </label>
              <label
                className={`mint-choice${!singleUse ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="mint-views"
                  checked={!singleUse}
                  onChange={() => setSingleUse(false)}
                />
                <span className="mint-choice-body">
                  <strong>As often as they like</strong>
                  <span>They can reopen it until the time limit runs out.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="mint-field">
            <label htmlFor="mint-royalty">Resale royalty</label>
            <div className="mint-royalty">
              <input
                id="mint-royalty"
                className="mint-input"
                type="number"
                min={0}
                max={50}
                step={1}
                value={royaltyPercent}
                onChange={(event) => setRoyaltyPercent(event.target.value)}
              />
              <span className="mint-royalty-suffix">%</span>
            </div>
            <div className="mint-pill-row mint-pill-row-sm">
              {['5', '10', '15', '20'].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`mint-pill${
                    royaltyPercent === value ? ' is-active' : ''
                  }`}
                  onClick={() => setRoyaltyPercent(value)}
                >
                  {value}%
                </button>
              ))}
            </div>
            <p className="mint-help">
              Every time your NFT is resold, you will receive this percentage.
              10% is a common starting point.
            </p>
          </div>

          <details className="mint-advanced">
            <summary>Advanced settings</summary>
            <div className="mint-field">
              <div className="mint-label-row">
                <label htmlFor="mint-whitelist">Allow-list code</label>
                <span className="mint-badge mint-badge-muted">Optional</span>
              </div>
              <input
                id="mint-whitelist"
                className="mint-input"
                type="text"
                value={whitelistRoot}
                onChange={(event) => setWhitelistRoot(event.target.value)}
                placeholder="Leave blank unless a developer gave you one"
                autoComplete="off"
              />
              <p className="mint-help">
                Only use this if a developer gave you a special code to control
                who can unlock the file. Otherwise, leave it blank.
              </p>
            </div>
          </details>
        </section>

        <div className="mint-submit">
          <div className="mint-submit-copy">
            <h2>Ready to create it?</h2>
            <p>
              {accountId ? (
                <>
                  Creating as <strong>{accountId}</strong>.
                </>
              ) : (
                'Connect your wallet to continue.'
              )}{' '}
              You will approve one transaction in your wallet. A small network
              fee applies.
            </p>
          </div>
          <button
            type="submit"
            className="btn btn-primary mint-submit-btn"
            disabled={minting}
          >
            {minting ? 'Working…' : 'Create my NFT'}
          </button>
        </div>

        {minting && (
          <div className="mint-progress" role="status">
            <span className="mint-spinner" aria-hidden="true" />
            {phase || 'Working…'}
          </div>
        )}
      </form>

      {tokenId && (
        <div className="mint-success" ref={successRef}>
          <div className="mint-success-icon" aria-hidden="true">
            ✓
          </div>
          <h2>Your NFT is live!</h2>
          <p>
            &ldquo;{mintedTitle}&rdquo; is ready to share. You can now grant
            access to buyers from its page.
          </p>
          <div className="mint-success-actions">
            <Link to={`/gated/${tokenId}`} className="btn btn-primary">
              Manage access
            </Link>
            <Link to={`/history/${tokenId}`} className="btn btn-outline">
              View details
            </Link>
          </div>
          <div className="mint-token-id">
            <span>NFT ID</span>
            <code>{tokenId}</code>
            <button type="button" onClick={copyTokenId}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
