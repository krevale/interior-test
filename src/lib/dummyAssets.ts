import type { Facing, FloorQuad, SpriteCell, SpriteSet, Vec2 } from '../types/scene';
import {
  boundsOf,
  project,
  projectBoxVertices,
  projectGroundPoint,
  rotateY,
  type IsoCamera,
  type Point3,
} from './isoCamera';

/**
 * Placeholder asset generation.
 *
 * Everything here exists to be deleted once the real generation pipeline is
 * wired up. Until then it produces sprites with correct per-facing anchors and
 * a known metric scale, which is what the canvas layer actually needs to be
 * exercised properly. Nothing in this file costs a generation call.
 */

const PADDING = 6;

interface BoxFace {
  indices: number[];
  /** Outward normal in object space, for view-consistent shading. */
  normal: Point3;
}

// Vertices: 0-3 bottom (y=0), 4-7 top (y=h), each running (-x,-z) -> (x,-z) ->
// (x,z) -> (-x,z).
//
// Every face below is wound counter-clockwise as seen from OUTSIDE the box.
// That consistency is what makes screen-space winding a valid front/back test;
// with mixed winding the top and bottom faces project to identical signed areas
// and become indistinguishable.
const FACES: BoxFace[] = [
  { indices: [4, 7, 6, 5], normal: { x: 0, y: 1, z: 0 } },
  { indices: [0, 1, 2, 3], normal: { x: 0, y: -1, z: 0 } },
  { indices: [4, 5, 1, 0], normal: { x: 0, y: 0, z: -1 } },
  { indices: [3, 2, 6, 7], normal: { x: 0, y: 0, z: 1 } },
  { indices: [5, 6, 2, 1], normal: { x: 1, y: 0, z: 0 } },
  { indices: [0, 3, 7, 4], normal: { x: -1, y: 0, z: 0 } },
];

/** Signed area of a projected polygon. Its sign encodes winding direction. */
function signedArea(vertices: { x: number; y: number }[], indices: number[]): number {
  let area = 0;
  for (let i = 0; i < indices.length; i++) {
    const a = vertices[indices[i]];
    const b = vertices[indices[(i + 1) % indices.length]];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Indices of the box faces pointing towards the camera.
 *
 * Backface culling rather than a painter's sort: the top and bottom faces of a
 * box share an average depth, so sorting between them is a coin flip and the
 * bottom face can end up drawn over the top. Culling by screen-space winding is
 * exact, and the surviving faces of a convex box never overlap, so no ordering
 * is needed afterwards. The top face is visible from any camera above the
 * floor, which is what fixes the sign convention.
 */
export function visibleFaces(vertices: { x: number; y: number }[]): number[] {
  const frontSign = Math.sign(signedArea(vertices, FACES[0].indices)) || 1;
  return FACES.map((_, index) => index).filter(
    (index) => Math.sign(signedArea(vertices, FACES[index].indices)) === frontSign,
  );
}

/** Index into FACES of the underside, which must never be visible. */
export const BOTTOM_FACE_INDEX = 1;

function shade(hex: string, factor: number): string {
  const value = parseInt(hex.slice(1), 16);
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp(((value >> 16) & 255) * factor);
  const g = clamp(((value >> 8) & 255) * factor);
  const b = clamp((value & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

export interface DummyBoxSpec {
  widthMeters: number;
  heightMeters: number;
  depthMeters: number;
  color: string;
  /** Draws an off-centre marker so a wrongly-mirrored sprite is obvious. */
  handedMarker?: boolean;
}

/**
 * Render one facing of a box as a transparent PNG data URI, with the ground
 * contact point recorded in sprite pixels.
 */
export function renderBoxSprite(
  spec: DummyBoxSpec,
  facing: Facing,
  camera: IsoCamera,
): SpriteCell {
  const rotation = facing * 45;
  const vertices = projectBoxVertices(spec, facing, camera);

  const groundPoint = projectGroundPoint(facing, camera);

  const bounds = boundsOf([...vertices, groundPoint]);
  const width = Math.ceil(bounds.maxX - bounds.minX) + PADDING * 2;
  const height = Math.ceil(bounds.maxY - bounds.minY) + PADDING * 2;
  const offsetX = PADDING - bounds.minX;
  const offsetY = PADDING - bounds.minY;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  const rotatedNormals = FACES.map((face) => rotateY(face.normal, rotation));

  for (const index of visibleFaces(vertices)) {
    const face = FACES[index];
    const normal = rotatedNormals[index];
    // View-consistent shading only: no directional key light, because half the
    // facings are served by mirrored sprites and a baked key would land on the
    // wrong side. Direction comes from the procedural shadow instead.
    const facingRatio = 0.62 + normal.y * 0.3 + Math.abs(normal.x) * 0.06;

    ctx.beginPath();
    face.indices.forEach((vertexIndex, i) => {
      const v = vertices[vertexIndex];
      const px = v.x + offsetX;
      const py = v.y + offsetY;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = shade(spec.color, facingRatio);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (spec.handedMarker) {
    // Sits over one corner of the top face. If mirroring is wired up wrongly
    // this jumps to the other side, which is easy to spot by eye.
    const corner = vertices[5];
    const centre = vertices[4];
    ctx.beginPath();
    ctx.arc(
      corner.x + offsetX + (centre.x - corner.x) * 0.22,
      corner.y + offsetY + (centre.y - corner.y) * 0.22,
      Math.max(3, camera.pxPerMeter * 0.05),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }

  return {
    url: canvas.toDataURL('image/png'),
    width,
    height,
    anchor: { x: groundPoint.x + offsetX, y: groundPoint.y + offsetY },
    renderedPxPerMeter: camera.pxPerMeter,
  };
}

/**
 * Build a sprite set the same way the real pipeline will: generate only the
 * facings that cannot be mirrored, and let the renderer derive the rest.
 */
export function makeDummySpriteSet(
  spec: DummyBoxSpec,
  camera: IsoCamera,
  facings: Facing[],
  symmetric = true,
): SpriteSet {
  const cells: Partial<Record<Facing, SpriteCell>> = {};
  for (const facing of facings) {
    cells[facing] = renderBoxSprite(spec, facing, camera);
  }
  return { cells, symmetric };
}

export interface DummyRoom {
  url: string;
  size: { width: number; height: number };
  floor: FloorQuad;
}

/**
 * A placeholder room background with a known floor plane, so the app starts
 * correctly calibrated. Real rooms need the four-handle calibrator, since an
 * image model will not tell us what projection it invented.
 */
export function makeDummyRoom(
  camera: IsoCamera,
  widthMeters: number,
  depthMeters: number,
  wallHeightMeters: number,
): DummyRoom {
  const toWorld = (fx: number, fz: number, y = 0): Point3 => ({
    x: fx - widthMeters / 2,
    y,
    z: fz - depthMeters / 2,
  });

  const floorCorners: Vec2[] = [
    { x: 0, y: 0 },
    { x: widthMeters, y: 0 },
    { x: widthMeters, y: depthMeters },
    { x: 0, y: depthMeters },
  ];
  const projectedFloor = floorCorners.map((c) => project(toWorld(c.x, c.y), camera));
  const wallTops = [
    project(toWorld(0, 0, wallHeightMeters), camera),
    project(toWorld(widthMeters, 0, wallHeightMeters), camera),
    project(toWorld(0, depthMeters, wallHeightMeters), camera),
  ];

  const bounds = boundsOf([...projectedFloor, ...wallTops]);
  const margin = 40;
  const width = Math.ceil(bounds.maxX - bounds.minX) + margin * 2;
  const height = Math.ceil(bounds.maxY - bounds.minY) + margin * 2;
  const offsetX = margin - bounds.minX;
  const offsetY = margin - bounds.minY;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  ctx.fillStyle = '#1b1d24';
  ctx.fillRect(0, 0, width, height);

  const at = (fx: number, fz: number, y = 0) => {
    const p = project(toWorld(fx, fz, y), camera);
    return { x: p.x + offsetX, y: p.y + offsetY };
  };

  const polygon = (points: Vec2[], fill: string) => {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // Two walls meeting at the far corner, then the floor.
  polygon(
    [at(0, 0, wallHeightMeters), at(widthMeters, 0, wallHeightMeters), at(widthMeters, 0), at(0, 0)],
    '#2e3340',
  );
  polygon(
    [at(0, 0, wallHeightMeters), at(0, depthMeters, wallHeightMeters), at(0, depthMeters), at(0, 0)],
    '#262b36',
  );
  polygon(
    [at(0, 0), at(widthMeters, 0), at(widthMeters, depthMeters), at(0, depthMeters)],
    '#3c4150',
  );

  // Metre grid, so placement and depth scaling can be eyeballed against the floor.
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let fx = 0; fx <= widthMeters; fx += 1) {
    const a = at(fx, 0);
    const b = at(fx, depthMeters);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let fz = 0; fz <= depthMeters; fz += 1) {
    const a = at(0, fz);
    const b = at(widthMeters, fz);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  return {
    url: canvas.toDataURL('image/png'),
    size: { width, height },
    floor: {
      tl: at(0, 0),
      tr: at(widthMeters, 0),
      br: at(widthMeters, depthMeters),
      bl: at(0, depthMeters),
      widthMeters,
      depthMeters,
    },
  };
}
