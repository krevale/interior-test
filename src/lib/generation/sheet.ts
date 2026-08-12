import type { Facing, SpriteCell, SpriteSet } from '../../types/scene';
import {
  boundsOf,
  projectBoxVertices,
  projectGroundPoint,
  type BoxDimensions,
  type IsoCamera,
} from '../isoCamera';
import {
  cropImage,
  gridCells,
  keyChroma,
  silhouetteBounds,
  DEFAULT_CHROMA,
  type ChromaOptions,
  type RasterImage,
  type Rect,
} from './chroma';
import { defaultSheetLayout, type SheetLayout } from './prompt';

/**
 * Turning a generated contact sheet into a SpriteSet.
 *
 * The interesting part is the anchor. The ground-contact point could be guessed
 * from pixels — bottom-centre of the silhouette, say — but we already know the
 * asset's real dimensions and the camera the sheet was generated against, so
 * the anchor can be computed geometrically instead: project the object's
 * bounding box at that facing, take where its footprint centre lands relative
 * to the projected silhouette, and rescale into measured sprite pixels. That is
 * exact where a pixel heuristic is approximate, and it yields the metric scale
 * (`renderedPxPerMeter`) as a by-product.
 *
 * The same comparison doubles as a measurement of whether the model actually
 * held the camera contract, which is the single riskiest assumption in the
 * pipeline. See `SliceDiagnostics`.
 */

/** Arbitrary; only ratios derived from it are used. */
const REFERENCE_PX_PER_METER = 100;

export interface SliceOptions {
  box: BoxDimensions;
  camera: { elevationDeg: number; azimuthDeg: number };
  facings: Facing[];
  layout?: SheetLayout;
  chroma?: ChromaOptions;
  /** Transparent margin kept around each cutout, in sprite pixels. */
  padding?: number;
  symmetric?: boolean;
}

export interface SliceDiagnostics {
  facing: Facing;
  /** Measured silhouette box within the sheet. */
  measured: Rect | null;
  /** Sprite pixels per metre implied by the silhouette's width. */
  scale: number;
  /**
   * How far the cell's aspect ratio departs from what the camera contract
   * predicts, as a fraction. Large values mean the model changed the viewing
   * angle or the object's proportions for this facing.
   */
  aspectError: number;
  withinTolerance: boolean;
}

export interface SliceResult {
  sprites: SpriteSet;
  diagnostics: SliceDiagnostics[];
  /**
   * Spread of implied scale across cells, as a fraction of the mean. The prompt
   * asks for identical framing in every cell, so a large spread means the sheet
   * is not internally consistent and the sprites will jump size as they rotate.
   */
  scaleSpread: number;
}

export type EncodeRaster = (image: RasterImage) => string;

/** Aspect deviation beyond this is worth a second look rather than a re-run. */
const ASPECT_TOLERANCE = 0.12;

export function sliceSheet(
  sheet: RasterImage,
  options: SliceOptions,
  encode: EncodeRaster,
): SliceResult {
  const {
    box,
    facings,
    chroma = DEFAULT_CHROMA,
    padding = 4,
    symmetric = true,
  } = options;
  const layout = options.layout ?? defaultSheetLayout(facings.length);

  const keyed = keyChroma(sheet, chroma);
  const cells = gridCells(
    keyed.width,
    keyed.height,
    layout.cols,
    layout.rows,
    facings.length,
  );

  const referenceCamera: IsoCamera = {
    ...options.camera,
    pxPerMeter: REFERENCE_PX_PER_METER,
  };

  const sprites: Partial<Record<Facing, SpriteCell>> = {};
  const diagnostics: SliceDiagnostics[] = [];
  const scales: number[] = [];

  facings.forEach((facing, index) => {
    const measured = silhouetteBounds(keyed, cells[index]);

    // What this facing should look like if the camera contract was honoured.
    const projected = projectBoxVertices(box, facing, referenceCamera);
    const ground = projectGroundPoint(facing, referenceCamera);
    const expected = boundsOf(projected);
    const expectedWidth = expected.maxX - expected.minX;
    const expectedHeight = expected.maxY - expected.minY;

    if (!measured || expectedWidth <= 0 || expectedHeight <= 0) {
      diagnostics.push({
        facing,
        measured,
        scale: 0,
        aspectError: Infinity,
        withinTolerance: false,
      });
      return;
    }

    const scale = measured.width / expectedWidth;
    const expectedAspect = expectedHeight / expectedWidth;
    const actualAspect = measured.height / measured.width;
    const aspectError = Math.abs(actualAspect - expectedAspect) / expectedAspect;

    const cutout = cropImage(keyed, {
      x: measured.x - padding,
      y: measured.y - padding,
      width: measured.width + padding * 2,
      height: measured.height + padding * 2,
    });

    sprites[facing] = {
      url: encode(cutout),
      width: cutout.width,
      height: cutout.height,
      anchor: {
        x: (ground.x - expected.minX) * scale + padding,
        y: (ground.y - expected.minY) * scale + padding,
      },
      renderedPxPerMeter: REFERENCE_PX_PER_METER * scale,
    };

    scales.push(scale);
    diagnostics.push({
      facing,
      measured,
      scale,
      aspectError,
      withinTolerance: aspectError <= ASPECT_TOLERANCE,
    });
  });

  return {
    sprites: { cells: sprites, symmetric },
    diagnostics,
    scaleSpread: spread(scales),
  };
}

function spread(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return Infinity;
  return (Math.max(...values) - Math.min(...values)) / mean;
}

/** One-line human summary of whether a sheet is usable. */
export function describeSlice(result: SliceResult): string {
  const missing = result.diagnostics.filter((d) => !d.measured).length;
  const offCamera = result.diagnostics.filter(
    (d) => d.measured && !d.withinTolerance,
  ).length;
  const parts = [`${result.diagnostics.length - missing} cells found`];
  if (missing) parts.push(`${missing} empty`);
  if (offCamera) parts.push(`${offCamera} off-camera`);
  parts.push(`scale spread ${(result.scaleSpread * 100).toFixed(0)}%`);
  return parts.join(', ');
}
