import { describe, expect, it } from 'vitest';
import type { Facing, Style } from '../../types/scene';
import {
  CHROMA_HEX,
  buildRoomPrompt,
  buildSheetPrompt,
  buildSingleViewPrompt,
  defaultSheetLayout,
} from './prompt';

const style: Style = {
  id: 'style-1',
  name: 'Warm isometric',
  promptFragment: 'stylised isometric interior illustration',
  camera: { elevationDeg: 34, azimuthDeg: 45 },
  lightDirection: { azimuthDeg: 135, elevationDeg: 42 },
};

const asset = {
  name: 'Three-seat sofa',
  category: 'sofa',
  widthMeters: 2.1,
  depthMeters: 0.92,
  heightMeters: 0.78,
};

describe('defaultSheetLayout', () => {
  it('has room for every requested facing', () => {
    for (let count = 1; count <= 12; count++) {
      const { cols, rows } = defaultSheetLayout(count);
      expect(cols * rows, `count ${count}`).toBeGreaterThanOrEqual(count);
    }
  });

  it('keeps the common sets on a single row where they still slice well', () => {
    expect(defaultSheetLayout(2).rows).toBe(1);
    expect(defaultSheetLayout(5).rows).toBe(1);
    expect(defaultSheetLayout(8)).toEqual({ cols: 4, rows: 2 });
  });
});

describe('buildSheetPrompt', () => {
  const facings: Facing[] = [0, 1, 2, 3, 4];
  const built = buildSheetPrompt({ asset, style, facings });

  it('states the camera contract the slicer measures against', () => {
    expect(built.text).toContain('34°');
    expect(built.text).toContain('45° azimuth');
    expect(built.text).toContain('near-orthographic');
  });

  it('names every requested rotation', () => {
    for (const facing of facings) {
      expect(built.text).toContain(`turned ${facing * 45}°`);
    }
  });

  it('asks for the chroma background the keyer expects', () => {
    expect(built.text).toContain(CHROMA_HEX);
    expect(built.chromaHex).toBe(CHROMA_HEX);
  });

  it('rules out baked lighting, which mirroring would put on the wrong side', () => {
    expect(built.text).toMatch(/no key light/i);
    expect(built.text).toMatch(/no shadow/i);
  });

  it('leads with what must stay locked', () => {
    // Nano Banana holds an edit far better when the invariants come before the
    // change, so identity must be stated ahead of the rotation instruction.
    expect(built.text.indexOf('Lock the object')).toBeLessThan(
      built.text.indexOf('rotates'),
    );
  });

  it('quotes dimensions in the requested unit', () => {
    expect(buildSheetPrompt({ asset, style, facings, unit: 'm' }).text).toContain('2.1 m');
    expect(buildSheetPrompt({ asset, style, facings, unit: 'ft' }).text).toContain(
      '6.89 ft',
    );
  });

  it('reads as prose rather than a keyword list', () => {
    // Gemini reads a prompt as language; a bulleted spec sheet reads worse.
    expect(built.text).not.toMatch(/^\s*[-*]\s/m);
  });
});

describe('buildSingleViewPrompt', () => {
  it('asks for one facing on a one-cell layout', () => {
    const built = buildSingleViewPrompt({ asset, style, facing: 3 });
    expect(built.layout).toEqual({ cols: 1, rows: 1 });
    expect(built.facings).toEqual([3]);
    expect(built.text).toContain('Turn it 135°');
    expect(built.text).toContain('exactly one thing');
  });
});

describe('buildRoomPrompt', () => {
  const text = buildRoomPrompt({ style, widthMeters: 6, depthMeters: 5 });

  it('de-furnishes as well as restyles', () => {
    // Anything left in the background is baked in and can never be moved.
    expect(text).toMatch(/completely empty/i);
    expect(text).toMatch(/rebuilt underneath/i);
  });

  it('locks the architecture it must not invent', () => {
    expect(text).toMatch(/Invent no architecture/i);
    expect(text).toMatch(/every window and door/i);
  });

  it('asks for an unobstructed floor plane for calibration', () => {
    expect(text).toMatch(/entire floor/i);
    expect(text).toContain('34°');
  });

  it('quotes the footprint in the requested unit', () => {
    expect(buildRoomPrompt({ style, widthMeters: 6, depthMeters: 5, unit: 'ft' })).toContain(
      '19.69 ft',
    );
  });
});
