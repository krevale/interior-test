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

  // Pass one: measure every cell against what the camera contract predicts.
  const cellData = facings.map((facing, index) => {
    const measured = silhouetteBounds(keyed, cells[index]);
    const projected = projectBoxVertices(box, facing, referenceCamera);
    const expected = boundsOf(projected);
    const expectedWidth = expected.maxX - expected.minX;
    const expectedHeight = expected.maxY - expected.minY;
    const usable = !!measured && expectedWidth > 0 && expectedHeight > 0;

    // Estimate scale from BOTH axes. Width alone is not enough: a bed is much
    // wider seen broadside than end-on, so a width-only estimate reads that
    // honest change in silhouette as a change in size.
    const byWidth = usable ? measured!.width / expectedWidth : 0;
    const byHeight = usable ? measured!.height / expectedHeight : 0;
    const cellScale = usable ? Math.sqrt(byWidth * byHeight) : 0;

    const expectedAspect = expectedHeight / expectedWidth;
    const actualAspect = usable ? measured!.height / measured!.width : 0;
    const aspectError = usable
      ? Math.abs(actualAspect - expectedAspect) / expectedAspect
      : Infinity;

    return {
      facing,
      measured,
      ground: projectGroundPoint(facing, referenceCamera),
      expected,
      expectedWidth,
      expectedHeight,
      byWidth,
      byHeight,
      cellScale,
      aspectError,
      usable,
    };
  });

  // One scale for the whole sheet, not one per cell.
  //
  // This is the same rigid object photographed from a fixed camera, so there is
  // exactly one pixels-per-metre for the sheet. Deriving it per cell let each
  // facing disagree, and the object visibly changed size as it rotated. A
  // median over the per-cell estimates also means one badly drawn cell cannot
  // drag the others off scale.
  const sheetScale = median(cellData.filter((c) => c.usable).map((c) => c.cellScale));

  const sprites: Partial<Record<Facing, SpriteCell>> = {};
  const diagnostics: SliceDiagnostics[] = [];

  for (const cell of cellData) {
    if (!cell.usable || !cell.measured || sheetScale <= 0) {
      diagnostics.push({
        facing: cell.facing,
        measured: cell.measured,
        scale: 0,
        aspectError: cell.aspectError,
        withinTolerance: false,
      });
      continue;
    }

    const { measured, expected, ground } = cell;
    const cutout = cropImage(keyed, {
      x: measured.x - padding,
      y: measured.y - padding,
      width: measured.width + padding * 2,
      height: measured.height + padding * 2,
    });

    sprites[cell.facing] = {
      url: encode(cutout),
      width: cutout.width,
      height: cutout.height,
      // The anchor locates a point inside THIS bitmap, so it uses this cell's
      // own per-axis ratios. Physical size uses the sheet scale. Splitting the
      // two keeps a slightly off cell correctly anchored without letting it
      // change how big the object is in the room.
      anchor: {
        x: (ground.x - expected.minX) * cell.byWidth + padding,
        y: (ground.y - expected.minY) * cell.byHeight + padding,
      },
      renderedPxPerMeter: REFERENCE_PX_PER_METER * sheetScale,
    };

    diagnostics.push({
      facing: cell.facing,
      measured,
      scale: cell.cellScale,
      aspectError: cell.aspectError,
      withinTolerance: cell.aspectError <= ASPECT_TOLERANCE,
    });
  }

  const scales = cellData.filter((c) => c.usable).map((c) => c.cellScale);

  return {
    sprites: { cells: sprites, symmetric },
    diagnostics,
    scaleSpread: spread(scales),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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
