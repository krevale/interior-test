import { describe, expect, it } from 'vitest';
import type { Facing } from '../types/scene';
import { BOTTOM_FACE_INDEX, visibleFaces } from './dummyAssets';
import { projectBoxVertices, type IsoCamera } from './isoCamera';

const camera: IsoCamera = { elevationDeg: 34, azimuthDeg: 45, pxPerMeter: 110 };
const box = { widthMeters: 2.1, heightMeters: 0.78, depthMeters: 0.92 };
const ALL: Facing[] = [0, 1, 2, 3, 4, 5, 6, 7];

describe('visibleFaces', () => {
  it('never shows the underside of a box standing on the floor', () => {
    for (const facing of ALL) {
      const visible = visibleFaces(projectBoxVertices(box, facing, camera));
      expect(visible, `facing ${facing}`).not.toContain(BOTTOM_FACE_INDEX);
    }
  });

  it('always shows the top face', () => {
    for (const facing of ALL) {
      const visible = visibleFaces(projectBoxVertices(box, facing, camera));
      expect(visible, `facing ${facing}`).toContain(0);
    }
  });

  it('shows at most three faces of a convex box', () => {
    for (const facing of ALL) {
      const visible = visibleFaces(projectBoxVertices(box, facing, camera));
      expect(visible.length).toBeGreaterThanOrEqual(2);
      expect(visible.length).toBeLessThanOrEqual(3);
    }
  });
});
