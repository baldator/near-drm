// Resolves an IPFS media reference to a URL the browser can fetch.
//
// In local development, ipfs.io does not emit Access-Control-Allow-Origin,
// so browser fetch() from http://localhost:3000 would be blocked by CORS.
// Route IPFS gateway requests through the dev-server proxy (/ipfs), which is
// same-origin and forwards to https://ipfs.io. On any other host (production,
// etc.) we call the public gateway directly.
export function resolveMediaUrl(media: string): string {
  if (!media) return '';
  if (media.startsWith('ipfs://')) {
    media = media.slice('ipfs://'.length);
  }
  if (media.startsWith('http://') || media.startsWith('https://')) {
    return media;
  }
  const isLocalhost =
    typeof window !== 'undefined' && window.location.hostname === 'localhost';
  return isLocalhost ? `/ipfs/${media}` : `https://ipfs.io/ipfs/${media}`;
}
