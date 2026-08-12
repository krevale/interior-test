import { describe, expect, it } from 'vitest';
import type { FloorQuad } from '../types/scene';
import {
  buildFloorTransform,
  clampToFloor,
  floorToScreen,
  pxPerMeterAt,
  screenToFloor,
  snapToGrid,
} from './homography';

// A trapezoid: near edge wider than far edge, as a floor seen in perspective.
const quad: FloorQuad = {
  tl: { x: 200, y: 100 },
  tr: { x: 400, y: 100 },
  br: { x: 500, y: 300 },
  bl: { x: 100, y: 300 },
  widthMeters: 6,
  depthMeters: 5,
};

const transform = buildFloorTransform(quad)!;

describe('buildFloorTransform', () => {
  it('maps the four floor corners onto the calibrated quad', () => {
    const corners: [number, number, { x: number; y: number }][] = [
      [0, 0, quad.tl],
      [6, 0, quad.tr],
      [6, 5, quad.br],
      [0, 5, quad.bl],
    ];
    for (const [fx, fz, expected] of corners) {
      const screen = floorToScreen(transform, fx, fz);
      expect(screen.x).toBeCloseTo(expected.x, 6);
      expect(screen.y).toBeCloseTo(expected.y, 6);
    }
  });

  it('round-trips floor -> screen -> floor', () => {
    for (const [fx, fz] of [
      [1, 1],
      [3.5, 2.25],
      [5.9, 4.8],
    ]) {
      const screen = floorToScreen(transform, fx, fz);
      const back = screenToFloor(transform, screen.x, screen.y);
      expect(back.x).toBeCloseTo(fx, 6);
      expect(back.y).toBeCloseTo(fz, 6);
    }
  });

  it('rejects a degenerate quad', () => {
    expect(
      buildFloorTransform({ ...quad, tr: quad.tl, br: quad.bl }),
    ).toBeNull();
  });
});

describe('pxPerMeterAt', () => {
  it('gives more pixels per metre nearer the camera', () => {
    // The near edge of the trapezoid is wider, so a metre there covers more
    // screen. This is what makes distant objects render smaller for free.
    const near = pxPerMeterAt(transform, 3, 5);
    const far = pxPerMeterAt(transform, 3, 0);
    expect(near).toBeGreaterThan(far);
  });
});

describe('clampToFloor', () => {
  it('keeps positions inside the calibrated floor', () => {
    expect(clampToFloor(transform, -2, 9)).toEqual({ x: 0, y: 5 });
    expect(clampToFloor(transform, 2, 2)).toEqual({ x: 2, y: 2 });
  });
});

describe('snapToGrid', () => {
  it('rounds to the nearest grid step', () => {
    expect(snapToGrid(1.13, 2.44, 0.25)).toEqual({ x: 1.25, y: 2.5 });
  });

  it('is a no-op when snapping is off', () => {
    expect(snapToGrid(1.13, 2.44, 0)).toEqual({ x: 1.13, y: 2.44 });
  });
});
