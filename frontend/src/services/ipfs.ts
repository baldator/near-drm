// Resolves an IPFS media reference to a URL the browser can fetch.
//
// Content is pinned through Pinata, so downloads go through a Pinata gateway.
// In local development the request is routed through the dev-server proxy
// (/ipfs), which is same-origin and forwards to the gateway, avoiding CORS
// blocks when downloading protected files from http://localhost:3000.

const DEFAULT_PINATA_GATEWAY = 'https://gateway.pinata.cloud';

function pinataGateway(): string {
  const configured = process.env.REACT_APP_PINATA_GATEWAY?.trim();
  if (!configured) {
    return DEFAULT_PINATA_GATEWAY;
  }
  const withScheme = /^https?:\/\//.test(configured)
    ? configured
    : `https://${configured}`;
  return withScheme.replace(/\/+$/, '');
}

export function resolveMediaUrl(media: string): string {
  if (!media) return '';
  let cid = media;
  if (cid.startsWith('ipfs://')) {
    cid = cid.slice('ipfs://'.length);
  }
  if (cid.startsWith('http://') || cid.startsWith('https://')) {
    return cid;
  }
  const isLocalhost =
    typeof window !== 'undefined' && window.location.hostname === 'localhost';
  return isLocalhost
    ? `/ipfs/${cid}`
    : `${pinataGateway()}/ipfs/${cid}`;
}
