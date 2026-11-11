// Pinata IPFS uploads.
//
// NOTE: Create React App inlines every REACT_APP_* variable into the browser
// bundle, so credentials used here are visible to anyone who loads the site.
// Use a Pinata key scoped to "pinFileToIPFS" and restricted to your domain, or
// point REACT_APP_PINATA_UPLOAD_URL at a server-side proxy that holds the real
// credentials.

const DEFAULT_PINATA_UPLOAD_URL =
  'https://api.pinata.cloud/pinning/pinFileToIPFS';

function pinataAuthHeaders(): Record<string, string> {
  const jwt = process.env.REACT_APP_PINATA_JWT?.trim();
  if (jwt) {
    return { Authorization: `Bearer ${jwt}` };
  }

  const apiKey = process.env.REACT_APP_PINATA_API_KEY?.trim();
  const apiSecret = process.env.REACT_APP_PINATA_API_SECRET?.trim();
  if (apiKey && apiSecret) {
    return {
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    };
  }

  return {};
}

export async function pinFileToIPFS(
  content: Blob,
  fileName: string
): Promise<string> {
  const uploadUrl =
    process.env.REACT_APP_PINATA_UPLOAD_URL?.trim() || DEFAULT_PINATA_UPLOAD_URL;
  const headers = pinataAuthHeaders();

  if (
    uploadUrl === DEFAULT_PINATA_UPLOAD_URL &&
    !headers.Authorization &&
    !headers.pinata_api_key
  ) {
    throw new Error(
      'Pinata credentials are missing. Set REACT_APP_PINATA_JWT in your .env file.'
    );
  }

  const form = new FormData();
  form.append('file', content, fileName);
  form.append('pinataMetadata', JSON.stringify({ name: fileName }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      const raw = body?.error?.details || body?.error || '';
      detail = typeof raw === 'string' ? raw : JSON.stringify(raw);
    } catch {
      // The response was not JSON; the status code is still useful.
    }
    throw new Error(
      `Pinata returned ${response.status}${detail ? `: ${detail}` : '.'}`
    );
  }

  const parsed = await response.json().catch(() => null);
  const cid = parsed?.IpfsHash || parsed?.ipfsHash || parsed?.cid;
  if (!cid) {
    throw new Error('Pinata did not return a CID for the uploaded file.');
  }
  return cid;
}
