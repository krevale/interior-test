import type { Facing, FurnitureAsset, Style } from '../../types/scene';
import { facingDegrees } from '../facing';
import { formatLength, type Unit } from '../units';

/**
 * Prompt construction, written for Nano Banana specifically.
 *
 * Gemini's image models read a prompt as language rather than as a tag list, so
 * these are narrative art-director briefs, not bulleted specifications. Three
 * rules shape the wording:
 *
 * - Describe the scene in prose. A coherent paragraph beats a pile of
 *   comma-separated keywords, which is the style that suits diffusion models.
 * - Phrase constraints positively. "An empty room with bare floors" lands where
 *   "no furniture" tends not to.
 * - On an edit, name what stays locked FIRST, then describe the single thing
 *   that changes.
 *
 * What stays rigid is the machine-readable half — grid layout, chroma colour,
 * camera angles — because the slicer measures against exactly those numbers.
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

type AssetBrief = Pick<
  FurnitureAsset,
  'name' | 'category' | 'widthMeters' | 'depthMeters' | 'heightMeters'
>;

export interface SheetPromptOptions {
  asset: AssetBrief;
  style: Style;
  facings: Facing[];
  layout?: SheetLayout;
  unit?: Unit;
}

export interface SheetPrompt {
  text: string;
  layout: SheetLayout;
  facings: Facing[];
  chromaHex: string;
}

function dimensions(asset: AssetBrief, unit: Unit): string {
  return `roughly ${formatLength(asset.widthMeters, unit)} wide, ${formatLength(
    asset.depthMeters,
    unit,
  )} deep and ${formatLength(asset.heightMeters, unit)} tall`;
}

function cameraSentence(style: Style): string {
  const { elevationDeg, azimuthDeg } = style.camera;
  return `The camera sits ${elevationDeg}° above the horizon at a ${azimuthDeg}° azimuth, framing the subject in a near-orthographic isometric projection with straight parallel edges, no perspective convergence and no lens distortion.`;
}

const LIGHTING_SENTENCE =
  'Light it with flat, even, ambient illumination arriving equally from every direction, as though it were sitting inside a photographer\'s lightbox: soft, directionless, with no key light, no bright specular highlights, and no shadow of any kind cast on or around it. Shadows are drawn separately afterwards, so the object must arrive without them.';

export function buildSheetPrompt(options: SheetPromptOptions): SheetPrompt {
  const { asset, style, facings, unit = 'm' } = options;
  const layout = options.layout ?? defaultSheetLayout(facings.length);
  const count = facings.length;

  const cellList = facings
    .map((facing, index) => {
      const row = Math.floor(index / layout.cols) + 1;
      const col = (index % layout.cols) + 1;
      const position =
        layout.rows === 1 ? `cell ${index + 1}` : `row ${row}, column ${col}`;
      return `${position} shows it turned ${facingDegrees(facing)}°`;
    })
    .join('; ');

  const text = `Treat the attached photograph as the definitive record of one specific real product — a ${asset.name.toLowerCase()} — and produce a single image showing that same object from ${count} different angles.

Lock the object itself and keep it identical in every view: the same proportions, the same materials and surface texture, the same colour, the same leg and frame construction, the same stitching and detailing. This is one physical object, ${dimensions(asset, unit)}, placed on a turntable and photographed ${count} times as it rotates. It is not ${count} variations on a design, and nothing about it may be redesigned or simplified between views.

${cameraSentence(style)} The camera never moves between views and never changes distance — only the object rotates on its vertical axis, so it occupies the same proportion of the frame every time.

Render it in this visual style: ${style.promptFragment}.

Arrange the ${count} views as a ${layout.cols} by ${layout.rows} grid, reading left to right and then top to bottom: ${cellList}. Give each view its own clear space with a generous even margin between them, so every object sits well inside its own cell and none touches or overlaps its neighbours.

${LIGHTING_SENTENCE}

Fill the whole canvas with solid flat chroma green ${CHROMA_HEX} — one uniform colour edge to edge, behind and between every view, with no gradient, no vignette, no ground plane and no horizon. Each object floats cleanly on that green field.

The finished image contains exactly ${count} things: the ${count} rotations of this one object. Everything else in the frame is plain green — no text, numbers, captions, labels, arrows, grid lines, borders or watermarks, and no other furniture, props, plants or people.`;

  return { text, layout, facings, chromaHex: CHROMA_HEX };
}

export interface SingleViewPromptOptions {
  asset: AssetBrief;
  style: Style;
  facing: Facing;
  unit?: Unit;
}

/**
 * One angle only. Useful when you already have a product shot from roughly the
 * right side and just want it restyled and cut out, without paying for a full
 * rotation set.
 */
export function buildSingleViewPrompt(options: SingleViewPromptOptions): SheetPrompt {
  const { asset, style, facing, unit = 'm' } = options;
  const degrees = facingDegrees(facing);

  const text = `Treat the attached photograph as the definitive record of one specific real product — a ${asset.name.toLowerCase()} — and redraw that same object as a single clean cutout.

Lock the object itself: the same proportions, the same materials and surface texture, the same colour, the same leg and frame construction, the same stitching and detailing. This is one physical object, ${dimensions(asset, unit)}, and nothing about it may be redesigned or simplified. Change only how it is drawn and how it is viewed.

Turn it ${degrees}° on its vertical axis from facing the camera, then hold it there. ${cameraSentence(
    style,
  )}

Render it in this visual style: ${style.promptFragment}.

${LIGHTING_SENTENCE}

Fill the whole canvas with solid flat chroma green ${CHROMA_HEX} — one uniform colour edge to edge, with no gradient, no vignette, no ground plane and no horizon. The object floats cleanly on that green field, centred, with a comfortable margin of green on all four sides.

The finished image contains exactly one thing: this object. Everything else in the frame is plain green — no text, captions, labels, borders or watermarks, and no other furniture, props, plants or people.`;

  return {
    text,
    layout: { cols: 1, rows: 1 },
    facings: [facing],
    chromaHex: CHROMA_HEX,
  };
}

export interface RoomPromptOptions {
  style: Style;
  widthMeters?: number;
  depthMeters?: number;
  unit?: Unit;
}

/**
 * Turns an uploaded room photo into the stylised isometric background, and
 * empties it on the way. The de-furnishing half is the part that is easy to
 * forget and impossible to fix later: anything left in the image is baked in
 * and can never be moved.
 */
export function buildRoomPrompt(options: RoomPromptOptions): string {
  const { style, unit = 'm' } = options;
  const footprint =
    options.widthMeters && options.depthMeters
      ? ` The room is roughly ${formatLength(options.widthMeters, unit)} by ${formatLength(
          options.depthMeters,
          unit,
        )}, and the drawing should read at that scale.`
      : '';

  return `Redraw the attached photograph of a real room as a stylised isometric illustration of the same room, completely empty.

Work in two passes. First, strip the room back to its bare shell. Every piece of furniture, every rug, lamp, plant, cushion, curtain, picture and loose object leaves the room, and the floor and wall surfaces they were covering are rebuilt underneath them so the material, grain and pattern run unbroken from wall to wall. What remains is only what is fixed to the building itself: the floor, the walls, the ceiling line, the windows, the doors, the skirting boards, the radiators and any built-in joinery — each one exactly where the photograph puts it.

Then redraw that empty shell in this visual style: ${style.promptFragment}.

Keep locked throughout: the room's real proportions, the position and size of every window and door, the direction each wall runs, and the actual floor and wall materials.${footprint} Invent no architecture the photograph does not show, and move nothing that is part of the building.

${cameraSentence(
    style,
  )} Position it so the entire floor reads as one clean, uninterrupted plane, visible from wall to wall with nothing standing on it.

Light the room with soft, even, ambient daylight falling equally across the whole space, leaving the floor evenly lit and free of strong cast shadows or pools of shade. Furniture shadows are drawn separately afterwards, so the empty floor must arrive without them.

The finished image shows an empty, unfurnished room waiting to be furnished — architecture and surfaces only, with no text, labels, watermarks or people anywhere in the frame.`;
}
