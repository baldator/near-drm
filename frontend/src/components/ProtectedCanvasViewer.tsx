import React, { useEffect, useRef, useState } from 'react';

/**
 * Renders decrypted bytes directly into an HTML5 canvas and stamps a
 * per-viewer watermark over every frame.
 *
 * Nothing is written to a file and no download URL is exposed. Images, PDFs,
 * and text files are supported; unsupported binary formats show a safe notice
 * instead of being handed to the browser's download manager.
 */

type RenderKind = 'image' | 'pdf' | 'text' | 'unsupported';
type ViewState = 'loading' | 'ready' | 'error';

interface ProtectedCanvasViewerProps {
  bytes: Uint8Array;
  fileName: string;
  fileType: string;
  viewerId: string;
  tokenId: string;
}

const CANVAS_WIDTH = 1200;
const MAX_CANVAS_HEIGHT = 20000;
const PAGE_GAP = 24;
const TEXT_FONT = '17px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const TEXT_LINE_HEIGHT = 26;

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName || '');
  return match ? match[1].toLowerCase() : '';
}

function detectKind(fileType: string, fileName: string): RenderKind {
  const type = (fileType || '').toLowerCase();
  const extension = extensionOf(fileName);

  if (type.startsWith('image/')) return 'image';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(extension)) {
    return 'image';
  }

  if (type === 'application/pdf' || extension === 'pdf') return 'pdf';

  if (
    type.startsWith('text/') ||
    type === 'application/json' ||
    type === 'application/xml' ||
    ['txt', 'md', 'csv', 'json', 'xml', 'html', 'log'].includes(extension)
  ) {
    return 'text';
  }

  return 'unsupported';
}

function bytesToBlobPart(bytes: Uint8Array): BlobPart {
  // `Uint8Array` is a valid BlobPart; the cast keeps older TypeScript DOM
  // typings (which only accept `ArrayBufferView`) happy.
  return bytes as unknown as BlobPart;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be decoded.'));
    };
    image.src = url;
  });
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/);
    let line = '';

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) lines.push(line);

      if (context.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }

      // Break a long unbroken token (URL, hash, base64 blob) across lines.
      let chunk = '';
      for (const character of word) {
        if (context.measureText(chunk + character).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk += character;
        }
      }
      line = chunk;
    }

    if (line) lines.push(line);
  }

  return lines;
}

function renderText(canvas: HTMLCanvasElement, text: string): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is not available.');

  const padding = 48;
  canvas.width = CANVAS_WIDTH;
  canvas.height = 1;

  context.font = TEXT_FONT;
  context.textBaseline = 'top';

  const availableWidth = canvas.width - padding * 2;
  let lines = wrapText(context, text, availableWidth);
  let truncated = false;

  const maxLines = Math.floor(
    (MAX_CANVAS_HEIGHT - padding * 2) / TEXT_LINE_HEIGHT
  );
  if (lines.length > maxLines) {
    lines = lines.slice(0, Math.max(1, maxLines - 2));
    lines.push('… preview truncated to fit the secure viewer.');
    truncated = true;
  }

  canvas.height = Math.max(
    360,
    padding * 2 + lines.length * TEXT_LINE_HEIGHT + (truncated ? 8 : 0)
  );

  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0f172a';
  context.font = TEXT_FONT;
  context.textBaseline = 'top';

  lines.forEach((line, index) => {
    context.fillText(line, padding, padding + index * TEXT_LINE_HEIGHT);
  });
}

async function renderImage(
  canvas: HTMLCanvasElement,
  bytes: Uint8Array,
  fileType: string
): Promise<void> {
  const blob = new Blob([bytesToBlobPart(bytes)], {
    type: fileType || 'application/octet-stream',
  });
  const image = await loadImage(blob);

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('The image has no visible pixels.');

  const scale = Math.min(1, CANVAS_WIDTH / width);
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  if (height > MAX_CANVAS_HEIGHT) {
    const shrink = MAX_CANVAS_HEIGHT / height;
    width = Math.max(1, Math.round(width * shrink));
    height = MAX_CANVAS_HEIGHT;
  }

  // Letterbox small or ultra-wide images so the watermark and corner labels
  // always have room to render.
  const canvasWidth = Math.max(width, 640);
  const canvasHeight = Math.max(height, 360);

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is not available.');

  context.fillStyle = '#0b1220';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.drawImage(
    image,
    Math.floor((canvasWidth - width) / 2),
    Math.floor((canvasHeight - height) / 2),
    width,
    height
  );
}

async function renderPdf(canvas: HTMLCanvasElement, bytes: Uint8Array): Promise<void> {
  // Loaded on demand so the PDF renderer stays out of the initial bundle.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url
  ).toString();

  const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;
  const pageCount = Math.min(pdfDocument.numPages, 60);
  const pages: Array<{ canvas: HTMLCanvasElement; width: number; height: number }> = [];

  let totalHeight = 0;
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = (CANVAS_WIDTH - 64) / baseViewport.width;
      const viewport = page.getViewport({ scale });

      const width = Math.max(1, Math.floor(viewport.width));
      const height = Math.max(1, Math.floor(viewport.height));

      // Stop before the browser's maximum canvas size is exceeded.
      if (
        pages.length > 0 &&
        totalHeight + height + PAGE_GAP > MAX_CANVAS_HEIGHT
      ) {
        break;
      }

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = width;
      pageCanvas.height = height;
      const pageContext = pageCanvas.getContext('2d');
      if (!pageContext) throw new Error('Canvas rendering is not available.');

      await page.render({ canvasContext: pageContext, viewport }).promise;
      if (typeof page.cleanup === 'function') page.cleanup();

      pages.push({ canvas: pageCanvas, width, height });
      totalHeight += height + PAGE_GAP;
    }
  } finally {
    await pdfDocument.destroy();
  }

  if (pages.length === 0) {
    throw new Error('The PDF has no renderable pages.');
  }

  const padding = 32;
  canvas.width = CANVAS_WIDTH;
  canvas.height = Math.min(
    MAX_CANVAS_HEIGHT,
    Math.max(480, totalHeight + padding * 2 - PAGE_GAP)
  );

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is not available.');

  context.fillStyle = '#e5e7eb';
  context.fillRect(0, 0, canvas.width, canvas.height);

  let y = padding;
  for (const page of pages) {
    const x = Math.floor((canvas.width - page.width) / 2);
    context.fillStyle = '#ffffff';
    context.fillRect(x, y, page.width, page.height);
    context.drawImage(page.canvas, x, y);
    y += page.height + PAGE_GAP;
  }
}

function drawWatermark(
  canvas: HTMLCanvasElement,
  viewerId: string,
  tokenId: string
): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  const timestamp = new Date().toLocaleString();
  const tile = `${viewerId}  •  ${tokenId}`;

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(-Math.PI / 6);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const stepX = 480;
  const stepY = 240;
  const reach = Math.ceil(Math.hypot(width, height) / 2) + 240;

  for (let y = -reach; y <= reach; y += stepY) {
    for (let x = -reach; x <= reach; x += stepX) {
      context.shadowColor = 'rgba(0, 0, 0, 0.45)';
      context.shadowBlur = 4;
      context.fillStyle = 'rgba(255, 255, 255, 0.32)';
      context.fillText(tile, x, y);
    }
  }
  context.restore();

  // Fixed corner labels so a cropped screenshot still carries the viewer ID.
  context.save();
  context.font = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  context.textBaseline = 'middle';

  const header = `CONFIDENTIAL  •  viewed by ${viewerId}`;
  const headerWidth = context.measureText(header).width;
  context.fillStyle = 'rgba(15, 23, 42, 0.78)';
  context.fillRect(16, 16, headerWidth + 24, 34);
  context.fillStyle = '#ffffff';
  context.fillText(header, 28, 34);

  const footer = `NEAR DRM  •  ${tokenId}  •  ${timestamp}`;
  const footerWidth = context.measureText(footer).width;
  context.fillStyle = 'rgba(15, 23, 42, 0.78)';
  context.fillRect(
    Math.max(16, width - footerWidth - 40),
    Math.max(16, height - 48),
    footerWidth + 24,
    32
  );
  context.fillStyle = '#ffffff';
  context.fillText(
    footer,
    Math.max(28, width - footerWidth - 28),
    Math.max(32, height - 32)
  );

  context.restore();
}

function clearCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (context) context.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
}

export function ProtectedCanvasViewer({
  bytes,
  fileName,
  fileType,
  viewerId,
  tokenId,
}: ProtectedCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<ViewState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<RenderKind>(() =>
    detectKind(fileType, fileName)
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const detected = detectKind(fileType, fileName);
    setKind(detected);
    setState('loading');
    setError(null);
    clearCanvas(canvas);

    (async () => {
      try {
        if (detected === 'image') {
          await renderImage(canvas, bytes, fileType);
        } else if (detected === 'pdf') {
          await renderPdf(canvas, bytes);
        } else if (detected === 'text') {
          renderText(canvas, new TextDecoder().decode(bytes));
        } else {
          throw new Error(
            'This file type cannot be rendered in the secure canvas viewer. ' +
              'Only images, PDFs, and text files are supported.'
          );
        }

        if (cancelled) return;
        drawWatermark(canvas, viewerId, tokenId);
        setState('ready');
      } catch (renderError: any) {
        if (cancelled) return;
        setError(renderError?.message || String(renderError));
        setState('error');
      }
    })();

    return () => {
      cancelled = true;
      clearCanvas(canvas);
    };
  }, [bytes, fileName, fileType, viewerId, tokenId]);

  return (
    <div className="protected-viewer">
      <div className="protected-viewer-caption">
        <span className="protected-viewer-file">{fileName}</span>
        <span className="protected-viewer-viewer">
          {viewerId} · {kind.toUpperCase()}
        </span>
      </div>

      <div className="protected-viewer-frame">
        {state === 'loading' && (
          <div className="protected-viewer-message" role="status">
            <span className="gated-spinner" aria-hidden="true" />
            Rendering the protected file…
          </div>
        )}
        {state === 'error' && (
          <div className="protected-viewer-message protected-viewer-message-error" role="alert">
            {error}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="protected-viewer-canvas"
          style={{ display: state === 'ready' ? 'block' : 'none' }}
          onContextMenu={(event) => event.preventDefault()}
          aria-label={`Protected file ${fileName} watermarked for ${viewerId}`}
        />
      </div>

      <p className="protected-viewer-note">
        Watermarked for {viewerId}. This view is rendered in memory and cannot be
        downloaded from the page.
      </p>
    </div>
  );
}
