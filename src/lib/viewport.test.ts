import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  fitToScreen,
  zoomByWheel,
  zoomTo,
} from './viewport';

describe('clampScale', () => {
  it('keeps values inside the min/max range', () => {
    expect(clampScale(0.001)).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(1)).toBe(1);
  });
});

describe('zoomTo', () => {
  const view = { scale: 1, x: 0, y: 0 };

  it('holds the anchor over the same content point after zooming in', () => {
    const anchor = { x: 300, y: 200 };
    const before = { x: (anchor.x - view.x) / view.scale, y: (anchor.y - view.y) / view.scale };

    const next = zoomTo(view, anchor, 2);
    const after = { x: (anchor.x - next.x) / next.scale, y: (anchor.y - next.y) / next.scale };

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.scale).toBe(2);
  });

  it('holds the anchor fixed when zooming out too', () => {
    const anchor = { x: 50, y: 900 };
    const start = { scale: 2.4, x: -120, y: 340 };
    const before = {
      x: (anchor.x - start.x) / start.scale,
      y: (anchor.y - start.y) / start.scale,
    };

    const next = zoomTo(start, anchor, 0.6);
    const after = { x: (anchor.x - next.x) / next.scale, y: (anchor.y - next.y) / next.scale };

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps the target scale', () => {
    expect(zoomTo(view, { x: 0, y: 0 }, 999).scale).toBe(MAX_SCALE);
    expect(zoomTo(view, { x: 0, y: 0 }, 0.0001).scale).toBe(MIN_SCALE);
  });

  it('is a no-op reference when the clamped scale does not change', () => {
    const atMax = { scale: MAX_SCALE, x: 5, y: 5 };
    expect(zoomTo(atMax, { x: 10, y: 10 }, 999)).toBe(atMax);
  });
});

describe('zoomByWheel', () => {
  it('zooms in on negative deltaY and out on positive deltaY', () => {
    const view = { scale: 1, x: 0, y: 0 };
    const anchor = { x: 100, y: 100 };
    expect(zoomByWheel(view, anchor, -100).scale).toBeGreaterThan(1);
    expect(zoomByWheel(view, anchor, 100).scale).toBeLessThan(1);
  });

  it('keeps the anchor fixed, same as zoomTo', () => {
    const view = { scale: 1.5, x: 40, y: -30 };
    const anchor = { x: 250, y: 180 };
    const before = { x: (anchor.x - view.x) / view.scale, y: (anchor.y - view.y) / view.scale };

    const next = zoomByWheel(view, anchor, -240);
    const after = { x: (anchor.x - next.x) / next.scale, y: (anchor.y - next.y) / next.scale };

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('accumulates consistently over many small deltas vs one large one', () => {
    // A trackpad reports many small deltaY events per gesture; a mouse wheel
    // reports fewer, larger ones. The exponential response should make a
    // sequence of small steps converge to roughly the same scale as one step
    // of the same total delta.
    const anchor = { x: 0, y: 0 };
    let stepped = { scale: 1, x: 0, y: 0 };
    for (let i = 0; i < 24; i++) stepped = zoomByWheel(stepped, anchor, -10);
    const single = zoomByWheel({ scale: 1, x: 0, y: 0 }, anchor, -240);
    expect(stepped.scale).toBeCloseTo(single.scale, 4);
  });
});

describe('fitToScreen', () => {
  it('fits by the limiting axis and centres the content', () => {
    const view = fitToScreen({ width: 1000, height: 500 }, { width: 2000, height: 500 }, 0)!;
    // Width is the binding constraint: 1000/2000 = 0.5 vs height 500/500 = 1.
    expect(view.scale).toBeCloseTo(0.5, 6);
    expect(view.x).toBeCloseTo(0, 6);
    expect(view.y).toBeCloseTo((500 - 500 * 0.5) / 2, 6);
  });

  it('respects padding', () => {
    const view = fitToScreen({ width: 1000, height: 1000 }, { width: 500, height: 500 }, 100)!;
    expect(view.scale).toBeCloseTo(1.6, 6); // (1000 - 200) / 500
  });

  it('returns null for a degenerate viewport or content size', () => {
    expect(fitToScreen({ width: 0, height: 500 }, { width: 100, height: 100 })).toBeNull();
    expect(fitToScreen({ width: 500, height: 500 }, { width: 0, height: 100 })).toBeNull();
  });

  it('never exceeds the max scale on tiny content', () => {
    const view = fitToScreen({ width: 2000, height: 2000 }, { width: 1, height: 1 })!;
    expect(view.scale).toBe(MAX_SCALE);
  });
});
