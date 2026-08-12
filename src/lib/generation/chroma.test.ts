import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHROMA,
  gridCells,
  keyChroma,
  silhouetteBounds,
  type RasterImage,
} from './chroma';

function blank(width: number, height: number, rgb: [number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function fill(
  image: RasterImage,
  rect: { x: number; y: number; width: number; height: number },
  rgb: [number, number, number],
) {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const i = (y * image.width + x) * 4;
      image.data[i] = rgb[0];
      image.data[i + 1] = rgb[1];
      image.data[i + 2] = rgb[2];
      image.data[i + 3] = 255;
    }
  }
}

const CHROMA: [number, number, number] = [0, 177, 64];
const SUBJECT: [number, number, number] = [150, 120, 110];

const alphaAt = (image: RasterImage, x: number, y: number) =>
  image.data[(y * image.width + x) * 4 + 3];

describe('keyChroma', () => {
  it('removes the chroma background and keeps the subject', () => {
    const image = blank(20, 20, CHROMA);
    fill(image, { x: 5, y: 5, width: 8, height: 8 }, SUBJECT);

    const keyed = keyChroma(image);
    expect(alphaAt(keyed, 1, 1)).toBe(0);
    expect(alphaAt(keyed, 8, 8)).toBe(255);
  });

  it('keys on green dominance, so uneven backdrop shading still comes out', () => {
    // Models rarely render a perfectly flat backdrop; a fixed RGB distance test
    // punches holes in the darker patches, dominance does not.
    const image = blank(10, 10, [0, 120, 42]);
    const keyed = keyChroma(image);
    expect(alphaAt(keyed, 5, 5)).toBe(0);
  });

  it('ramps alpha for edge pixels instead of hard-thresholding', () => {
    const image = blank(3, 1, CHROMA);
    // Dominance 40, between keepBelow (20) and cutAbove (60).
    fill(image, { x: 1, y: 0, width: 1, height: 1 }, [60, 100, 40]);
    const keyed = keyChroma(image);
    const alpha = alphaAt(keyed, 1, 0);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
  });

  it('despills green fringing on partially-keyed edge pixels', () => {
    // Dominance 30: kept, but green-tinted. Fully-keyed pixels are invisible
    // and skip despill entirely, so an edge pixel is the case that matters.
    const image = blank(1, 1, [90, 120, 80]);
    const keyed = keyChroma(image, { ...DEFAULT_CHROMA, despill: true });
    expect(keyed.data[3]).toBeGreaterThan(0);
    expect(keyed.data[1]).toBeLessThanOrEqual(92);
  });

  it('leaves the subject untouched when despill is off', () => {
    const image = blank(1, 1, SUBJECT);
    const keyed = keyChroma(image, { ...DEFAULT_CHROMA, despill: false });
    expect([keyed.data[0], keyed.data[1], keyed.data[2]]).toEqual(SUBJECT);
  });
});

describe('silhouetteBounds', () => {
  it('measures the tight box of visible pixels', () => {
    const image = blank(30, 30, CHROMA);
    fill(image, { x: 6, y: 9, width: 10, height: 4 }, SUBJECT);
    const keyed = keyChroma(image);

    expect(silhouetteBounds(keyed, { x: 0, y: 0, width: 30, height: 30 })).toEqual({
      x: 6,
      y: 9,
      width: 10,
      height: 4,
    });
  });

  it('returns null for an empty region', () => {
    const keyed = keyChroma(blank(10, 10, CHROMA));
    expect(silhouetteBounds(keyed, { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });
});

describe('gridCells', () => {
  it('lays cells out left to right, then top to bottom', () => {
    const cells = gridCells(400, 200, 4, 2, 8);
    expect(cells[0]).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(cells[3]).toEqual({ x: 300, y: 0, width: 100, height: 100 });
    expect(cells[4]).toEqual({ x: 0, y: 100, width: 100, height: 100 });
  });

  it('emits only as many cells as were requested', () => {
    expect(gridCells(300, 200, 3, 2, 5)).toHaveLength(5);
  });
});
