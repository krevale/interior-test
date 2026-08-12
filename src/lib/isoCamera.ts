/**
 * A minimal axonometric camera, used only to generate the placeholder assets
 * that stand in for image-model output while the interaction layer is built.
 *
 * It is deliberately the same camera contract that the style carries, so the
 * dummy sprites obey the exact projection real generated sprites will be asked
 * to match. That makes this a genuine test harness for depth sorting, anchors
 * and facing rather than a set of coloured rectangles.
 */
export interface IsoCamera {
  elevationDeg: number;
  azimuthDeg: number;
  pxPerMeter: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Camera-space depth; larger is further away. Used for painter ordering. */
  depth: number;
}

export function project(p: Point3, camera: IsoCamera): Projected {
  const azimuth = (camera.azimuthDeg * Math.PI) / 180;
  const elevation = (camera.elevationDeg * Math.PI) / 180;

  const xr = p.x * Math.cos(azimuth) + p.z * Math.sin(azimuth);
  const zr = -p.x * Math.sin(azimuth) + p.z * Math.cos(azimuth);

  return {
    x: xr * camera.pxPerMeter,
    // Screen y grows downward, so both height and distance move a point up.
    y: (-p.y * Math.cos(elevation) - zr * Math.sin(elevation)) * camera.pxPerMeter,
    depth: zr,
  };
}

export function rotateY(p: Point3, degrees: number): Point3 {
  const a = (degrees * Math.PI) / 180;
  return {
    x: p.x * Math.cos(a) + p.z * Math.sin(a),
    y: p.y,
    z: -p.x * Math.sin(a) + p.z * Math.cos(a),
  };
}

/**
 * Corners of an axis-aligned box standing on the floor, ordered 0-3 along the
 * bottom (y=0) and 4-7 along the top, each running (-x,-z) -> (x,-z) -> (x,z)
 * -> (-x,z).
 */
export function boxVertices(width: number, height: number, depth: number): Point3[] {
  const x = width / 2;
  const z = depth / 2;
  return [
    { x: -x, y: 0, z: -z },
    { x: x, y: 0, z: -z },
    { x: x, y: 0, z: z },
    { x: -x, y: 0, z: z },
    { x: -x, y: height, z: -z },
    { x: x, y: height, z: -z },
    { x: x, y: height, z: z },
    { x: -x, y: height, z: z },
  ];
}

export interface BoxDimensions {
  widthMeters: number;
  heightMeters: number;
  depthMeters: number;
}

/** The box's corners as they land on screen at a given facing. */
export function projectBoxVertices(
  box: BoxDimensions,
  facingIndex: number,
  camera: IsoCamera,
): Projected[] {
  return boxVertices(box.widthMeters, box.heightMeters, box.depthMeters)
    .map((v) => rotateY(v, facingIndex * 45))
    .map((v) => project(v, camera));
}

/** Where the box meets the floor: its footprint centre, projected at y = 0. */
export function projectGroundPoint(facingIndex: number, camera: IsoCamera): Projected {
  return project(rotateY({ x: 0, y: 0, z: 0 }, facingIndex * 45), camera);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: { x: number; y: number }[]): Bounds {
  return points.reduce<Bounds>(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      minY: Math.min(b.minY, p.y),
      maxX: Math.max(b.maxX, p.x),
      maxY: Math.max(b.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}
