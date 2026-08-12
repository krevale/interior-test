import { describe, expect, it } from 'vitest';
import type { Facing, SpriteCell, SpriteSet } from '../types/scene';
import { CANONICAL_FACINGS, missingFacings, resolveFacing, rotateFacing } from './facing';

const cell = (name: string): SpriteCell => ({
  url: `${name}.png`,
  width: 100,
  height: 80,
  anchor: { x: 50, y: 70 },
  renderedPxPerMeter: 100,
});

function symmetricSet(facings: Facing[]): SpriteSet {
  const cells: Partial<Record<Facing, SpriteCell>> = {};
  for (const f of facings) cells[f] = cell(`f${f}`);
  return { cells, symmetric: true };
}

describe('resolveFacing', () => {
  it('serves the five generated facings directly', () => {
    const sprites = symmetricSet(CANONICAL_FACINGS);
    for (const facing of CANONICAL_FACINGS) {
      const resolved = resolveFacing(sprites, facing);
      expect(resolved).toMatchObject({ mirrored: false, servedFacing: facing });
      expect(resolved?.cell.url).toBe(`f${facing}.png`);
    }
  });

  it('mirrors 5/6/7 from 3/2/1', () => {
    const sprites = symmetricSet(CANONICAL_FACINGS);
    const expected: [Facing, string][] = [
      [5, 'f3.png'],
      [6, 'f2.png'],
      [7, 'f1.png'],
    ];
    for (const [facing, url] of expected) {
      const resolved = resolveFacing(sprites, facing);
      expect(resolved).toMatchObject({ mirrored: true, servedFacing: facing });
      expect(resolved?.cell.url).toBe(url);
    }
  });

  it('covers all four diagonal facings from only two sprites', () => {
    const sprites = symmetricSet([1, 3]);
    for (const facing of [1, 3, 5, 7] as Facing[]) {
      const resolved = resolveFacing(sprites, facing);
      expect(resolved?.servedFacing).toBe(facing);
    }
  });

  it('never mirrors an asymmetric piece', () => {
    // Only facing 1 exists; facing 7 would be its mirror, which for a
    // left-chaise sectional is a different product.
    const sprites: SpriteSet = { cells: { 1: cell('f1') }, symmetric: false };
    const resolved = resolveFacing(sprites, 7);
    expect(resolved?.mirrored).toBe(false);
    expect(resolved?.servedFacing).toBe(1);
  });

  it('falls back to the nearest servable facing when a cell is missing', () => {
    const sprites = symmetricSet([0]);
    expect(resolveFacing(sprites, 3)?.servedFacing).toBe(0);
  });

  it('returns null for an empty sprite set', () => {
    expect(resolveFacing({ cells: {}, symmetric: true }, 0)).toBeNull();
  });
});

describe('missingFacings', () => {
  it('asks for five facings on a symmetric piece', () => {
    expect(missingFacings({ cells: {}, symmetric: true })).toEqual([0, 1, 2, 3, 4]);
  });

  it('asks for all eight on an asymmetric piece', () => {
    expect(missingFacings({ cells: {}, symmetric: false })).toHaveLength(8);
  });
});

describe('rotateFacing', () => {
  it('wraps in both directions', () => {
    expect(rotateFacing(7, 1)).toBe(0);
    expect(rotateFacing(0, -1)).toBe(7);
    expect(rotateFacing(3, 8)).toBe(3);
  });
});
