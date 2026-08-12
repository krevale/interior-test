import type { Style, Vec2 } from '../types/scene';
import { floorToScreen, type FloorTransform } from './homography';
import type { ObjectLayout } from './layout';

export interface ShadowSpec {
  center: Vec2;
  radiusX: number;
  radiusY: number;
  opacity: number;
  blur: number;
}

/**
 * Shadows are drawn, not generated.
 *
 * Two reasons this is the right call. It is cheaper and far more consistent
 * than hoping an image model bakes a matching shadow into every sprite. And it
 * is what makes the mirroring trick viable at all: half the facings are served
 * by mirrored sprites, so any directional light baked into a sprite would land
 * on the wrong side. Sprites carry flat ambient light; the shadow carries the
 * direction.
 *
 * The ellipse is derived by projecting floor-space offsets through the
 * homography rather than by fudging a squash factor, so it sits in the floor
 * plane by construction and stays correct as the perspective changes.
 */
export function shadowFor(
  layout: ObjectLayout,
  transform: FloorTransform,
  style: Style,
): ShadowSpec | null {
  if (!layout.sprite) return null;

  const { fx, fz } = layout.object;
  const { widthMeters, depthMeters, heightMeters } = layout.asset;
  const spread = layout.object.scaleMultiplier;

  const azimuth = (style.lightDirection.azimuthDeg * Math.PI) / 180;
  const elevation = (style.lightDirection.elevationDeg * Math.PI) / 180;

  // A low light throws a longer shadow, but this ellipse is a contact shadow,
  // not a full cast shadow. It has to stay visually attached to the object's
  // base, so the displacement is heavily damped and hard-capped - otherwise a
  // floor lamp ends up with a smudge half a metre from where it stands.
  const lengthMeters = heightMeters / Math.tan(Math.max(elevation, 0.15));
  const offsetMeters = Math.min(lengthMeters * 0.12, 0.4);
  const offsetX = -Math.sin(azimuth) * offsetMeters;
  const offsetZ = Math.cos(azimuth) * offsetMeters;

  const center = floorToScreen(transform, fx + offsetX, fz + offsetZ);
  const alongX = floorToScreen(transform, fx + (widthMeters / 2) * spread, fz);
  const alongZ = floorToScreen(transform, fx, fz + (depthMeters / 2) * spread);
  const origin = floorToScreen(transform, fx, fz);

  const radiusX = Math.hypot(alongX.x - origin.x, alongX.y - origin.y) * 1.05;
  const radiusY = Math.hypot(alongZ.x - origin.x, alongZ.y - origin.y) * 1.05;

  // Taller objects cast softer, fainter contact shadows.
  const softness = Math.min(heightMeters / 2, 1.5);
  return {
    center,
    radiusX,
    radiusY,
    opacity: 0.38 - softness * 0.1,
    blur: 6 + softness * 10,
  };
}
