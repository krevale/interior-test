import type { FloorQuad, Vec2 } from '../types/scene';

/** Row-major 3x3. */
export type Matrix3 = readonly number[];

export interface FloorTransform {
  /** Floor meters -> background-image pixels. */
  toScreen: Matrix3;
  /** Background-image pixels -> floor meters. */
  toFloor: Matrix3;
  quad: FloorQuad;
}

/** Solve A x = b for square A by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }
  // Full Gauss-Jordan leaves each row with a single non-zero coefficient.
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Four-point homography via DLT. Each correspondence contributes two rows;
 * h[8] is fixed at 1, leaving an 8x8 solve.
 */
export function computeHomography(src: Vec2[], dst: Vec2[]): Matrix3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solve(a, b);
  return h ? [...h, 1] : null;
}

export function applyHomography(h: Matrix3, p: Vec2): Vec2 {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  if (Math.abs(w) < 1e-12) return { x: NaN, y: NaN };
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

export function invert(h: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, i, j] = h;
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (Math.abs(det) < 1e-12) return null;
  return [
    (e * j - f * i) / det,
    (c * i - b * j) / det,
    (b * f - c * e) / det,
    (f * g - d * j) / det,
    (a * j - c * g) / det,
    (c * d - a * f) / det,
    (d * i - e * g) / det,
    (b * g - a * i) / det,
    (a * e - b * d) / det,
  ];
}

/**
 * Build the floor transform from a calibrated quad. The quad's corners are
 * screen points; its real-world extent sets the metric scale.
 */
export function buildFloorTransform(quad: FloorQuad): FloorTransform | null {
  const floorPoints: Vec2[] = [
    { x: 0, y: 0 },
    { x: quad.widthMeters, y: 0 },
    { x: quad.widthMeters, y: quad.depthMeters },
    { x: 0, y: quad.depthMeters },
  ];
  const screenPoints = [quad.tl, quad.tr, quad.br, quad.bl];

  const toScreen = computeHomography(floorPoints, screenPoints);
  if (!toScreen) return null;
  const toFloor = invert(toScreen);
  if (!toFloor) return null;

  return { toScreen, toFloor, quad };
}

export function floorToScreen(t: FloorTransform, fx: number, fz: number): Vec2 {
  return applyHomography(t.toScreen, { x: fx, y: fz });
}

export function screenToFloor(t: FloorTransform, x: number, y: number): Vec2 {
  return applyHomography(t.toFloor, { x, y });
}

/**
 * Screen pixels per floor metre at a given floor point.
 *
 * Under perspective this varies across the floor, which is exactly what gives
 * objects further from the camera their smaller on-screen size for free. We
 * average the two floor axes: a single scalar is a simplification (a sprite's
 * apparent width depends on which way it faces) but it is stable and good
 * enough for placement, and it keeps sizing physically anchored rather than
 * leaving `scale` as a number the user has to eyeball.
 */
export function pxPerMeterAt(t: FloorTransform, fx: number, fz: number): number {
  const eps = 0.01;
  const origin = floorToScreen(t, fx, fz);
  const alongX = floorToScreen(t, fx + eps, fz);
  const alongZ = floorToScreen(t, fx, fz + eps);

  const dx = Math.hypot(alongX.x - origin.x, alongX.y - origin.y) / eps;
  const dz = Math.hypot(alongZ.x - origin.x, alongZ.y - origin.y) / eps;
  return (dx + dz) / 2;
}

/** Clamp a floor position to the calibrated floor rectangle. */
export function clampToFloor(t: FloorTransform, fx: number, fz: number): Vec2 {
  return {
    x: Math.min(Math.max(fx, 0), t.quad.widthMeters),
    y: Math.min(Math.max(fz, 0), t.quad.depthMeters),
  };
}

/** Snap a floor position to a grid, in metres. */
export function snapToGrid(fx: number, fz: number, gridMeters: number): Vec2 {
  if (gridMeters <= 0) return { x: fx, y: fz };
  return {
    x: Math.round(fx / gridMeters) * gridMeters,
    y: Math.round(fz / gridMeters) * gridMeters,
  };
}
