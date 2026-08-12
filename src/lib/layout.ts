import type { FurnitureAsset, PlacedObject, Scene, Vec2 } from '../types/scene';
import { resolveFacing, type ResolvedSprite } from './facing';
import { floorToScreen, pxPerMeterAt, type FloorTransform } from './homography';

export interface ObjectLayout {
  object: PlacedObject;
  asset: FurnitureAsset;
  sprite: ResolvedSprite | null;
  /** Where the object meets the floor, in background-image pixels. */
  ground: Vec2;
  /** Factor applied to the sprite bitmap to reach physically correct size. */
  scale: number;
  /** Top-left corner of the drawn sprite. */
  origin: Vec2;
  /** Drawn size in screen pixels. */
  size: { width: number; height: number };
  pxPerMeter: number;
  sortKey: number;
}

/**
 * Depth sorting keys off the ground-contact point, not the bounding-box centre.
 * A bookshelf and a rug whose boxes overlap sort correctly this way; by centre
 * they do not, because the bookshelf's centre sits far above where it actually
 * stands. `zOffset` exists for the residual cases the heuristic gets wrong.
 */
function sortKeyFor(ground: Vec2, object: PlacedObject): number {
  return ground.y + object.zOffset;
}

export function layoutObject(
  scene: Scene,
  transform: FloorTransform,
  object: PlacedObject,
): ObjectLayout | null {
  const asset = scene.assets[object.assetId];
  if (!asset) return null;

  const ground = floorToScreen(transform, object.fx, object.fz);
  const pxPerMeter = pxPerMeterAt(transform, object.fx, object.fz);
  const sprites = asset.spritesByStyle[scene.style.id];
  const sprite = sprites ? resolveFacing(sprites, object.facing) : null;

  if (!sprite) {
    return {
      object,
      asset,
      sprite: null,
      ground,
      scale: 1,
      origin: ground,
      size: { width: 0, height: 0 },
      pxPerMeter,
      sortKey: sortKeyFor(ground, object),
    };
  }

  // Physically correct size anywhere on the floor: the sprite knows how many of
  // its own pixels made up a metre when it was generated, and the homography
  // knows how many screen pixels make up a metre here. Depth scaling is just
  // the second number changing across the floor.
  const scale = (pxPerMeter / sprite.cell.renderedPxPerMeter) * object.scaleMultiplier;

  // Mirroring flips the anchor's horizontal position within the sprite.
  const anchorX = sprite.mirrored
    ? sprite.cell.width - sprite.cell.anchor.x
    : sprite.cell.anchor.x;

  return {
    object,
    asset,
    sprite,
    ground,
    scale,
    origin: {
      x: ground.x - anchorX * scale,
      y: ground.y - sprite.cell.anchor.y * scale,
    },
    size: {
      width: sprite.cell.width * scale,
      height: sprite.cell.height * scale,
    },
    pxPerMeter,
    sortKey: sortKeyFor(ground, object),
  };
}

/** Lay out every object and return them in back-to-front draw order. */
export function layoutScene(scene: Scene, transform: FloorTransform): ObjectLayout[] {
  return scene.objects
    .map((object) => layoutObject(scene, transform, object))
    .filter((layout): layout is ObjectLayout => layout !== null)
    .sort((a, b) => a.sortKey - b.sortKey || a.object.id.localeCompare(b.object.id));
}
