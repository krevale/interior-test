/**
 * Chroma keying, because image models do not emit alpha.
 *
 * Generating onto flat chroma green and keying it out afterwards is more
 * predictable than asking for a transparent background and hoping, and it gives
 * cleaner edges than running a general-purpose segmentation model over a
 * background the model chose for itself.
 *
 * The key metric is green dominance, `g - max(r, b)`, rather than distance to a
 * fixed RGB value. That survives the model shading the backdrop unevenly, which
 * it usually does, and it degrades gracefully instead of punching holes.
 */

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChromaOptions {
  /** Dominance at or below which a pixel is fully opaque. */
  keepBelow: number;
  /** Dominance at or above which a pixel is fully transparent. */
  cutAbove: number;
  /** Neutralise green fringing left on edge pixels. */
  despill: boolean;
}

export const DEFAULT_CHROMA: ChromaOptions = {
  keepBelow: 20,
  cutAbove: 60,
  despill: true,
};

function dominance(r: number, g: number, b: number): number {
  return g - Math.max(r, b);
}

/**
 * Returns a new image with the chroma background removed.
 *
 * The soft ramp between `keepBelow` and `cutAbove` is what keeps antialiased
 * edges from turning into a hard jagged cutout; a single hard threshold is what
 * makes composited sprites look pasted on.
 */
export function keyChroma(
  image: RasterImage,
  options: ChromaOptions = DEFAULT_CHROMA,
): RasterImage {
  const { keepBelow, cutAbove, despill } = options;
  const span = Math.max(cutAbove - keepBelow, 1);
  const data = new Uint8ClampedArray(image.data);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const d = dominance(r, g, b);

    if (d >= cutAbove) {
      data[i + 3] = 0;
      continue;
    }
    if (d > keepBelow) {
      const t = (d - keepBelow) / span;
      data[i + 3] = Math.round(data[i + 3] * (1 - t));
    }

    // Pull the green channel back down to the neighbouring channels on any
    // pixel that still leans green, so edges do not keep a green halo once
    // they are composited over a different background.
    if (despill && d > 0) {
      data[i + 1] = Math.max(r, b) + Math.min(d, 2);
    }
  }

  return { width: image.width, height: image.height, data };
}

/**
 * Tight bounding box of pixels above an alpha threshold, searched within a
 * region. Returns null when the region is empty.
 *
 * Cell boundaries are computed nominally from the requested grid, but models do
 * not place objects precisely, so the real extent has to be measured rather
 * than assumed.
 */
export function silhouetteBounds(
  image: RasterImage,
  region: Rect,
  alphaThreshold = 8,
): Rect | null {
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(image.width, Math.ceil(region.x + region.width));
  const y1 = Math.min(image.height, Math.ceil(region.y + region.height));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] <= alphaThreshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Copy a sub-rectangle into a new image. */
export function cropImage(image: RasterImage, rect: Rect): RasterImage {
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const data = new Uint8ClampedArray(width * height * 4);
  const originX = Math.round(rect.x);
  const originY = Math.round(rect.y);

  for (let y = 0; y < height; y++) {
    const sourceY = originY + y;
    if (sourceY < 0 || sourceY >= image.height) continue;
    for (let x = 0; x < width; x++) {
      const sourceX = originX + x;
      if (sourceX < 0 || sourceX >= image.width) continue;
      const from = (sourceY * image.width + sourceX) * 4;
      const to = (y * width + x) * 4;
      data[to] = image.data[from];
      data[to + 1] = image.data[from + 1];
      data[to + 2] = image.data[from + 2];
      data[to + 3] = image.data[from + 3];
    }
  }

  return { width, height, data };
}

/** Nominal cell rectangles for a grid, before measuring actual contents. */
export function gridCells(
  width: number,
  height: number,
  cols: number,
  rows: number,
  count: number,
): Rect[] {
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const cells: Rect[] = [];
  for (let index = 0; index < count; index++) {
    cells.push({
      x: (index % cols) * cellWidth,
      y: Math.floor(index / cols) * cellHeight,
      width: cellWidth,
      height: cellHeight,
    });
  }
  return cells;
}
