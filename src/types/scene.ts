/**
 * Scene data model.
 *
 * Two decisions here are load-bearing and worth stating up front:
 *
 * 1. Placed objects store their position in FLOOR METERS (fx, fz), not screen
 *    pixels. Screen position is always derived through the room's homography.
 *    This makes depth sorting, depth-based scaling, snapping, and physically
 *    correct sizing fall out for free, and it means a regenerated background at
 *    a different resolution doesn't invalidate an existing layout.
 *
 * 2. There is no `flipped` boolean. Orientation is a `facing` index 0-7, and
 *    the renderer decides internally whether that facing is served by a
 *    generated sprite or by mirroring one. Mirroring is an implementation
 *    detail of rotation, not a user-facing control. See lib/facing.ts.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Compass facing under the fixed isometric camera, in 45 degree steps. */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SpriteCell {
  url: string;
  width: number;
  height: number;
  /**
   * Ground-contact point in sprite pixels. Per-angle, because a sofa seen from
   * behind meets the floor at a different offset than one seen from the front.
   * Depth sorting and shadow placement both key off this.
   */
  anchor: Vec2;
  /**
   * Sprite pixels per real-world metre at generation time. Lets the renderer
   * scale a sprite to physically correct size anywhere on the floor. For
   * generated sprites this is derived from the asset's known width and the
   * measured extent of the cutout.
   */
  renderedPxPerMeter: number;
}

export interface SpriteSet {
  /**
   * Keyed by facing. A symmetric piece only needs facings 0-4 populated; the
   * renderer serves 5/6/7 by mirroring 3/2/1. An asymmetric piece needs all
   * eight, because mirroring it produces the wrong-handed object.
   */
  cells: Partial<Record<Facing, SpriteCell>>;
  /**
   * False for pieces where a mirror produces the wrong-handed object (an
   * L-sectional with the chaise on the left mirrors into one on the right).
   */
  symmetric: boolean;
}

/**
 * The visual style is a first-class entity rather than a property of a room.
 * Sprites are cached per (asset, style), so a furniture library built once is
 * reusable across every room sharing that style instead of being regenerated.
 */
export interface Style {
  id: string;
  name: string;
  /** Image that defines the look; fed as conditioning when generating sprites. */
  referenceImageUrl?: string;
  promptFragment: string;
  /** The camera contract every sprite in this style must be generated against. */
  camera: { elevationDeg: number; azimuthDeg: number };
  /**
   * Drives procedural shadows. Sprites themselves should be generated with flat,
   * near-ambient lighting: mirroring serves half the facings, so directional
   * light baked into a sprite would land on the wrong side when mirrored.
   */
  lightDirection: { azimuthDeg: number; elevationDeg: number };
}

/** Style-independent product identity. Real-world dimensions live here. */
export interface FurnitureAsset {
  id: string;
  name: string;
  category: string;
  widthMeters: number;
  depthMeters: number;
  heightMeters: number;
  sourcePhotoUrl?: string;
  spritesByStyle: Record<string, SpriteSet>;
}

/**
 * The floor plane, calibrated by dragging four handles onto the floor of the
 * background image. Four clicks beats trying to infer a projection the image
 * model never told us about.
 */
export interface FloorQuad {
  /** Screen-space corners, in background-image pixel coordinates. */
  tl: Vec2;
  tr: Vec2;
  br: Vec2;
  bl: Vec2;
  /** Real-world extent of that quad, which sets the meters-to-pixels scale. */
  widthMeters: number;
  depthMeters: number;
}

export interface Room {
  id: string;
  styleId: string;
  sourceImageUrl?: string;
  backgroundImageUrl: string;
  backgroundSize: { width: number; height: number };
  floor: FloorQuad;
}

/** Sprite generation is async and takes seconds; the canvas needs to show that. */
export type GenerationStatus = 'ready' | 'pending' | 'failed';

export interface PlacedObject {
  id: string;
  roomId: string;
  assetId: string;
  /** Floor-plane position in meters. Screen position is derived, never stored. */
  fx: number;
  fz: number;
  facing: Facing;
  /** Multiplier on the physically correct size. 1 means true to dimensions. */
  scaleMultiplier: number;
  /** Manual depth-sort tiebreak for the cases the anchor heuristic gets wrong. */
  zOffset: number;
  status: GenerationStatus;
}

export interface Scene {
  room: Room;
  style: Style;
  assets: Record<string, FurnitureAsset>;
  objects: PlacedObject[];
}
