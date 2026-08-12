import type { Facing, FurnitureAsset, Style } from '../../types/scene';
import { facingDegrees } from '../facing';

/**
 * Prompt construction for the generation pipeline.
 *
 * Two prompts matter, and both encode decisions the renderer depends on:
 *
 * - The sprite sheet asks for every facing in ONE image. Consistency is then
 *   enforced within a single generation rather than hoped for across N separate
 *   calls, it costs one image instead of N, and a 2K sheet sliced 2x2 still
 *   leaves ~1024px per sprite, which is more than a 2.5D canvas needs.
 *
 * - The room prompt de-furnishes as well as restyles. Without that the source
 *   room's own furniture is baked into the background permanently, which
 *   directly contradicts an app whose entire premise is moving furniture.
 */

export interface SheetLayout {
  cols: number;
  rows: number;
}

/**
 * Cell arrangement for a given facing count. Single rows slice most reliably,
 * so they win until the cells get too narrow to hold detail.
 */
export function defaultSheetLayout(count: number): SheetLayout {
  switch (count) {
    case 1:
      return { cols: 1, rows: 1 };
    case 2:
      return { cols: 2, rows: 1 };
    case 3:
      return { cols: 3, rows: 1 };
    case 4:
      return { cols: 2, rows: 2 };
    case 5:
      return { cols: 5, rows: 1 };
    case 6:
      return { cols: 3, rows: 2 };
    case 8:
      return { cols: 4, rows: 2 };
    default: {
      const cols = Math.ceil(Math.sqrt(count));
      return { cols, rows: Math.ceil(count / cols) };
    }
  }
}

/** Chroma background. Keyed out after generation; models will not emit alpha. */
export const CHROMA_HEX = '#00b140';

export interface SheetPromptOptions {
  asset: Pick<FurnitureAsset, 'name' | 'category' | 'widthMeters' | 'depthMeters' | 'heightMeters'>;
  style: Style;
  facings: Facing[];
  layout?: SheetLayout;
}

export interface SheetPrompt {
  text: string;
  layout: SheetLayout;
  facings: Facing[];
  chromaHex: string;
}

export function buildSheetPrompt(options: SheetPromptOptions): SheetPrompt {
  const { asset, style, facings } = options;
  const layout = options.layout ?? defaultSheetLayout(facings.length);
  const { elevationDeg, azimuthDeg } = style.camera;

  const cellList = facings
    .map((facing, index) => {
      const row = Math.floor(index / layout.cols) + 1;
      const col = (index % layout.cols) + 1;
      return `  ${index + 1}. row ${row}, column ${col} — object rotated ${facingDegrees(
        facing,
      )}° clockwise about its vertical axis`;
    })
    .join('\n');

  const text = `Render the SAME single piece of furniture from the reference photo — a ${asset.name.toLowerCase()} (${asset.category}) — as a sprite sheet of ${facings.length} views.

Style: ${style.promptFragment}

CAMERA (identical for every cell, do not vary it):
- Fixed isometric view, ${elevationDeg}° above the horizon, ${azimuthDeg}° azimuth
- Near-orthographic: no perspective convergence, no lens distortion
- The camera never moves between cells. Only the object rotates.

LAYOUT: a ${layout.cols} x ${layout.rows} grid, ${facings.length} cells, read left to right then top to bottom:
${cellList}
- Even gutters between cells; nothing crosses a cell boundary
- The object occupies the same proportion of every cell — do not zoom or crop differently per cell

LIGHTING (important):
- Flat, even, ambient light only. No key light, no directional highlights.
- No cast shadow, no contact shadow, no reflection on the ground.
- Shadows are added later in the app; a baked directional shadow makes the
  sprite unusable when it is mirrored.

BACKGROUND: solid flat chroma green ${CHROMA_HEX}, edge to edge, in every cell and gutter. No floor, no wall, no ground plane, no gradient, no vignette.

IDENTITY: this is one specific real product. Preserve its exact proportions, materials, colour, leg style and detailing across all ${facings.length} views. Do not redesign, restyle the silhouette, or substitute a similar item.

Real-world size for proportion reference: ${asset.widthMeters} m wide, ${asset.depthMeters} m deep, ${asset.heightMeters} m tall.

Do not add: text, labels, arrows, numbers, borders, watermarks, other furniture, plants, people, or props.`;

  return { text, layout, facings, chromaHex: CHROMA_HEX };
}

export interface RoomPromptOptions {
  style: Style;
  /** Room footprint, if known, to steer the projection. */
  widthMeters?: number;
  depthMeters?: number;
}

/**
 * Turns an uploaded room photo into the stylised isometric background — and
 * empties it. The de-furnishing half is the part that is easy to forget and
 * impossible to fix later, since anything left in the image cannot be moved.
 */
export function buildRoomPrompt(options: RoomPromptOptions): string {
  const { style } = options;
  const { elevationDeg, azimuthDeg } = style.camera;
  const footprint =
    options.widthMeters && options.depthMeters
      ? `\nApproximate room footprint: ${options.widthMeters} m x ${options.depthMeters} m.`
      : '';

  return `Redraw this room photograph as a stylised isometric interior.

Style: ${style.promptFragment}

EMPTY THE ROOM. Remove all furniture, rugs, lamps, plants, decor, curtains and clutter. Keep only the permanent shell: floor, walls, ceiling line, windows, doors, radiators, and built-in fixtures. Reconstruct the floor and wall surfaces that the removed objects were covering, continuing the existing material and pattern.

CAMERA:
- Fixed isometric view, ${elevationDeg}° above the horizon, ${azimuthDeg}° azimuth
- Near-orthographic: no perspective convergence
- Show the floor as a clean, unobstructed plane with its full extent visible${footprint}

LIGHTING: even ambient light with soft, non-directional shading. No strong cast shadows on the floor — furniture shadows are drawn by the app later.

Preserve the room's real proportions, window positions, and floor and wall materials. Do not invent architecture that is not in the photograph.

Do not add: furniture of any kind, text, labels, people, or watermarks.`;
}
