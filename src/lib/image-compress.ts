const MAX_EDGE = 1600;
const QUALITY = 0.80;

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
}

export async function compressImage(file: File): Promise<CompressionResult> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 20_000_000) {
    throw new Error('Use a JPG, PNG or WebP photo smaller than 20 MB.');
  }
  const originalSize = file.size;
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  let targetW = width;
  let targetH = height;
  if (Math.max(width, height) > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(width, height);
    targetW = Math.round(width * scale);
    targetH = Math.round(height * scale);
  }

  // HTMLCanvasElement also supports browsers without OffscreenCanvas.
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw new Error('Image compression is unavailable in this browser.'); }
  try { ctx.drawImage(bitmap, 0, 0, targetW, targetH); }
  finally { bitmap.close(); }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result?.size ? resolve(result) : reject(new Error('Unable to compress this image.')), 'image/webp', QUALITY);
  });
  if (blob.type !== 'image/webp') throw new Error('This browser does not support WebP compression.');
  if (blob.size > 5_000_000) throw new Error('Choose a smaller photo. The compressed file must be under 5 MB.');

  return {
    blob,
    originalSize,
    compressedSize: blob.size,
    reductionPercent: Math.round((1 - blob.size / originalSize) * 100),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
