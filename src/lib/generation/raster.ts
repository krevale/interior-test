import type { RasterImage } from './chroma';

/** Browser-only encode/decode. Kept apart so the pipeline itself stays pure. */

export async function decodeImageFile(file: Blob): Promise<RasterImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data };
}

export function encodeRaster(image: RasterImage): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  const buffer = ctx.createImageData(image.width, image.height);
  buffer.data.set(image.data);
  ctx.putImageData(buffer, 0, 0);
  return canvas.toDataURL('image/png');
}
