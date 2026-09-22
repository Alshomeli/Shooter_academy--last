const MAX_EDGE = 1600;
const QUALITY = 0.80;

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
}

export async function compressImage(file: File): Promise<CompressionResult> {
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

  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });

  if (!blob || blob.size === 0) {
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  }

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
