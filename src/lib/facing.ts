import type { Facing, SpriteSet, SpriteCell } from '../types/scene';

/**
 * Under a fixed isometric camera a horizontal mirror maps a facing angle t to
 * -t. So for a symmetric piece the eight facings are served by five sprites:
 *
 *   facing 0 (0deg)   -> generated        facing 4 (180deg) -> generated
 *   facing 1 (45deg)  -> generated        facing 5 (225deg) -> facing 3 mirrored
 *   facing 2 (90deg)  -> generated        facing 6 (270deg) -> facing 2 mirrored
 *   facing 3 (135deg) -> generated        facing 7 (315deg) -> facing 1 mirrored
 *
 * Facings 0 and 180 sit in the mirror plane, so they are the two that buy
 * nothing. Restricting to the four diagonal facings (1/3/5/7) needs only two
 * generated sprites, which is the cheapest useful set and also the one that
 * tends to look best under an isometric camera.
 */
const MIRROR_SOURCE: Record<Facing, Facing | null> = {
  0: null,
  1: null,
  2: null,
  3: null,
  4: null,
  5: 3,
  6: 2,
  7: 1,
};

/** Facings worth generating for a symmetric piece, cheapest useful set first. */
export const DIAGONAL_FACINGS: Facing[] = [1, 3];
export const CANONICAL_FACINGS: Facing[] = [0, 1, 2, 3, 4];
export const ALL_FACINGS: Facing[] = [0, 1, 2, 3, 4, 5, 6, 7];

export interface ResolvedSprite {
  cell: SpriteCell;
  mirrored: boolean;
  /** The facing actually shown. Differs from the request only on fallback. */
  servedFacing: Facing;
}

function cellFor(sprites: SpriteSet, facing: Facing): ResolvedSprite | null {
  const direct = sprites.cells[facing];
  if (direct) return { cell: direct, mirrored: false, servedFacing: facing };

  // Only symmetric pieces may borrow a mirrored sprite from the opposite side.
  if (!sprites.symmetric) return null;
  const source = MIRROR_SOURCE[facing];
  if (source === null) return null;
  const borrowed = sprites.cells[source];
  if (!borrowed) return null;
  return { cell: borrowed, mirrored: true, servedFacing: facing };
}

/**
 * Resolve a facing to a concrete sprite cell plus whether to mirror it.
 *
 * Falls back to the nearest servable facing so a partly-generated library still
 * renders something sensible instead of a hole in the scene.
 */
export function resolveFacing(sprites: SpriteSet, facing: Facing): ResolvedSprite | null {
  const exact = cellFor(sprites, facing);
  if (exact) return exact;

  for (let distance = 1; distance <= 4; distance++) {
    for (const candidate of [facing + distance, facing - distance]) {
      const wrapped = (((candidate % 8) + 8) % 8) as Facing;
      const fallback = cellFor(sprites, wrapped);
      if (fallback) return fallback;
    }
  }
  return null;
}

/** Facings still needing generation for this asset to cover all eight. */
export function missingFacings(sprites: SpriteSet): Facing[] {
  const required = sprites.symmetric ? CANONICAL_FACINGS : ALL_FACINGS;
  return required.filter((facing) => !sprites.cells[facing]);
}

export function rotateFacing(facing: Facing, steps: number): Facing {
  return ((((facing + steps) % 8) + 8) % 8) as Facing;
}

export function facingDegrees(facing: Facing): number {
  return facing * 45;
}
