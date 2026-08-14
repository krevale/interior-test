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

/**
 * Read a file as a data URL plus its natural size. Backgrounds don't need their
 * pixels decoded, only their dimensions, and a data URL survives in scene state
 * where an object URL would be revoked out from under it.
 */
export function readImageAsDataUrl(
  file: Blob,
): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read the image file'));
    reader.onload = () => {
      const url = String(reader.result);
      const probe = new Image();
      probe.onerror = () => reject(new Error('could not decode the image'));
      probe.onload = () =>
        resolve({ url, width: probe.naturalWidth, height: probe.naturalHeight });
      probe.src = url;
    };
    reader.readAsDataURL(file);
  });
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
