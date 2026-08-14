import { describe, expect, it } from 'vitest';
import type { Facing } from '../../types/scene';
import {
  boundsOf,
  projectBoxVertices,
  projectGroundPoint,
  type IsoCamera,
} from '../isoCamera';
import type { RasterImage } from './chroma';
import { sliceSheet } from './sheet';

const CAMERA = { elevationDeg: 34, azimuthDeg: 45 };
const BOX = { widthMeters: 2.1, heightMeters: 0.78, depthMeters: 0.92 };
const FACINGS: Facing[] = [0, 1, 2, 3, 4];
const LAYOUT = { cols: 5, rows: 1 };
const CELL = 600;
const REFERENCE: IsoCamera = { ...CAMERA, pxPerMeter: 100 };

/** What the slicer should measure for a facing, at reference scale. */
function expectedBox(facing: Facing) {
  const bounds = boundsOf(projectBoxVertices(BOX, facing, REFERENCE));
  return {
    minX: bounds.minX,
    minY: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    ground: projectGroundPoint(facing, REFERENCE),
  };
}

/**
 * Build a synthetic sheet: chroma everywhere, with each cell holding an opaque
 * rectangle matching what the camera contract predicts for that facing, scaled
 * by `scale` and nudged around inside its cell. The slicer only ever measures a
 * silhouette's bounding box, so a filled rectangle exercises exactly the maths
 * under test.
 */
function makeSheet(scale: number, distortCell?: { index: number; heightFactor: number }) {
  const width = CELL * LAYOUT.cols;
  const height = CELL;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0;
    data[i + 1] = 177;
    data[i + 2] = 64;
    data[i + 3] = 255;
  }
  const image: RasterImage = { width, height, data };

  const placements = FACINGS.map((facing, index) => {
    const expected = expectedBox(facing);
    const w = Math.round(expected.width * scale);
    const h = Math.round(
      expected.height * scale * (distortCell?.index === index ? distortCell.heightFactor : 1),
    );
    // Deliberately off-centre, to prove placement inside the cell is irrelevant.
    const x = index * CELL + 30 + index * 7;
    const y = 40 + index * 5;

    // A rectangle spilling past its cell would be silently clipped by the
    // slicer's per-cell search, quietly weakening every assertion below.
    if (x + w > (index + 1) * CELL || y + h > height) {
      throw new Error(
        `fixture cell ${index} overflows: ${w}x${h} at (${x},${y}), cell width ${CELL}`,
      );
    }

    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const i = (py * width + px) * 4;
        data[i] = 150;
        data[i + 1] = 120;
        data[i + 2] = 110;
        data[i + 3] = 255;
      }
    }
    return { facing, x, y, w, h, expected };
  });

  return { image, placements };
}

const options = {
  box: BOX,
  camera: CAMERA,
  facings: FACINGS,
  layout: LAYOUT,
  padding: 4,
};

const stubEncode = (image: RasterImage) => `raster:${image.width}x${image.height}`;

describe('sliceSheet', () => {
  it('recovers a cell for every requested facing', () => {
    const { image } = makeSheet(1.5);
    const result = sliceSheet(image, options, stubEncode);
    for (const facing of FACINGS) {
      expect(result.sprites.cells[facing], `facing ${facing}`).toBeDefined();
    }
  });

  it('derives the metric scale from the silhouette', () => {
    const scale = 1.5;
    const { image } = makeSheet(scale);
    const result = sliceSheet(image, options, stubEncode);

    for (const facing of FACINGS) {
      // renderedPxPerMeter = reference (100) * measured/expected width ratio.
      expect(result.sprites.cells[facing]!.renderedPxPerMeter).toBeCloseTo(
        100 * scale,
        0,
      );
    }
  });

  it('places the ground anchor geometrically, not at the silhouette centre', () => {
    const scale = 2;
    const { image, placements } = makeSheet(scale);
    const result = sliceSheet(image, options, stubEncode);

    for (const { facing, expected, w } of placements) {
      const cell = result.sprites.cells[facing]!;
      const measuredScale = w / expected.width;
      expect(cell.anchor.x).toBeCloseTo(
        (expected.ground.x - expected.minX) * measuredScale + options.padding,
        0,
      );
      expect(cell.anchor.y).toBeCloseTo(
        (expected.ground.y - expected.minY) * measuredScale + options.padding,
        0,
      );
    }
  });

  it('is unaffected by where in its cell the model drew the object', () => {
    // Placements are already off-centre and differ per cell; a consistent scale
    // spread proves the slicer measures rather than assumes.
    const { image } = makeSheet(1.25);
    const result = sliceSheet(image, options, stubEncode);
    expect(result.scaleSpread).toBeLessThan(0.02);
  });

  it('pads the cutout around the silhouette', () => {
    const { image, placements } = makeSheet(1);
    const result = sliceSheet(image, options, stubEncode);
    const first = placements[0];
    expect(result.sprites.cells[0]!.width).toBe(first.w + options.padding * 2);
  });

  it('flags a cell whose aspect ratio breaks the camera contract', () => {
    // The instrument for the riskiest step in the pipeline: if the model
    // changed the viewing angle for one facing, the cell's proportions stop
    // matching what the projection predicts.
    const { image } = makeSheet(1.5, { index: 2, heightFactor: 1.6 });
    const result = sliceSheet(image, options, stubEncode);

    const flagged = result.diagnostics.filter((d) => !d.withinTolerance);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].facing).toBe(FACINGS[2]);
    expect(flagged[0].aspectError).toBeGreaterThan(0.4);
  });

  it('reports an empty cell instead of inventing a sprite', () => {
    const { image } = makeSheet(1.5);
    // Wipe the last cell back to chroma.
    for (let y = 0; y < image.height; y++) {
      for (let x = 4 * CELL; x < 5 * CELL; x++) {
        const i = (y * image.width + x) * 4;
        image.data[i] = 0;
        image.data[i + 1] = 177;
        image.data[i + 2] = 64;
      }
    }
    const result = sliceSheet(image, options, stubEncode);
    expect(result.sprites.cells[4]).toBeUndefined();
    expect(result.diagnostics[4].measured).toBeNull();
    expect(result.diagnostics[4].withinTolerance).toBe(false);
  });

  it('gives every facing the same metric scale', () => {
    // The reported bug: a bed changed size when rotated. Scale was derived per
    // cell from silhouette WIDTH, and a bed is far wider broadside than end-on,
    // so the honest change in silhouette was read as a change in size.
    const { image } = makeSheet(1.5);
    const result = sliceSheet(image, options, stubEncode);

    const perMeter = FACINGS.map((f) => result.sprites.cells[f]!.renderedPxPerMeter);
    for (const value of perMeter) {
      expect(value).toBeCloseTo(perMeter[0], 6);
    }
  });

  it('keeps the sheet scale when one cell is drawn badly', () => {
    // A median over per-cell estimates means a single distorted cell is
    // reported in diagnostics without dragging the other facings off scale.
    const clean = sliceSheet(makeSheet(1.5).image, options, stubEncode);
    const withBadCell = sliceSheet(
      makeSheet(1.5, { index: 2, heightFactor: 1.6 }).image,
      options,
      stubEncode,
    );

    // The bad cell is 60% too tall. Taken on its own it would drag the scale
    // by roughly a quarter; through the median it moves it by a fraction of a
    // percent, which pixel rounding alone would account for.
    const drift =
      Math.abs(
        withBadCell.sprites.cells[0]!.renderedPxPerMeter -
          clean.sprites.cells[0]!.renderedPxPerMeter,
      ) / clean.sprites.cells[0]!.renderedPxPerMeter;
    expect(drift).toBeLessThan(0.01);
    expect(withBadCell.diagnostics.filter((d) => !d.withinTolerance)).toHaveLength(1);
  });

  it('carries the symmetry flag through to the sprite set', () => {
    const { image } = makeSheet(1);
    const result = sliceSheet(image, { ...options, symmetric: false }, stubEncode);
    expect(result.sprites.symmetric).toBe(false);
  });
});
