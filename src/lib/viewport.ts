import type { Vec2 } from '../types/scene';

/**
 * Pan/zoom math for the canvas viewport, kept pure and separate from the
 * Konva/React wiring in RoomCanvas so it can be tested without a DOM.
 *
 * The view is a scale plus a screen-space translation: `screen = content *
 * scale + (x, y)`. This is exactly Konva's own Stage transform, so applying
 * `view` as the Stage's x/y/scaleX/scaleY is a direct, no-conversion mapping -
 * and because it lives on the Stage rather than on individual nodes, none of
 * the floor-homography or drag-snapping code needs to know the view exists.
 * Konva reports drag positions in each node's local (unscaled) coordinate
 * space regardless of the Stage's own transform.
 */

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 6;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Re-scale a view to `targetScale` while holding `anchor` (a screen point)
 * fixed over the same piece of content it currently covers. This is the one
 * operation both wheel-zoom (anchored on the pointer) and the +/- buttons
 * (anchored on the viewport centre) need.
 */
export function zoomTo(view: Viewport, anchor: Vec2, targetScale: number): Viewport {
  const scale = clampScale(targetScale);
  if (scale === view.scale) return view;

  const contentPoint = {
    x: (anchor.x - view.x) / view.scale,
    y: (anchor.y - view.y) / view.scale,
  };
  return {
    scale,
    x: anchor.x - contentPoint.x * scale,
    y: anchor.y - contentPoint.y * scale,
  };
}

/**
 * Continuous, exponential response to a wheel delta. Exponential rather than
 * linear so the same physical wheel/trackpad motion feels proportional at any
 * zoom level, and so many small trackpad deltas compose smoothly into the same
 * result as fewer large mouse-wheel notches.
 */
export function zoomByWheel(
  view: Viewport,
  anchor: Vec2,
  deltaY: number,
  intensity = 0.0018,
): Viewport {
  return zoomTo(view, anchor, view.scale * Math.exp(-deltaY * intensity));
}

/** Scale and centre `content` inside `viewport`, leaving a screen-pixel margin. */
export function fitToScreen(viewport: Size, content: Size, padding = 40): Viewport | null {
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  if (content.width <= 0 || content.height <= 0) return null;

  const scale = clampScale(
    Math.min(
      (viewport.width - padding * 2) / content.width,
      (viewport.height - padding * 2) / content.height,
    ),
  );
  return {
    scale,
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
  };
}
