import type { Facing, FurnitureAsset, SpriteSet, Style } from '../../types/scene';
import { buildSheetPrompt, defaultSheetLayout, type SheetLayout } from './prompt';
import { decodeImageFile, encodeRaster } from './raster';
import { sliceSheet, type SliceResult } from './sheet';

/**
 * Generation sits behind a provider interface with two implementations.
 *
 * `ManualProvider` hands you a prompt to run in whatever chat UI your
 * subscription already covers and takes the resulting sheet back as a file. It
 * costs nothing beyond what you already pay for and needs no credentials, which
 * also means the app stays fully developable and testable without any.
 *
 * An API-backed provider implements the same interface and becomes a
 * configuration change rather than a rewrite, for when the manual shuttling
 * gets tedious.
 */

export interface SpriteJob {
  asset: FurnitureAsset;
  style: Style;
  facings: Facing[];
  layout: SheetLayout;
  /** Prompt to run, and what the slicer will expect back. */
  prompt: string;
}

export interface GenerationProvider {
  readonly kind: 'manual' | 'api';
  /** Prepare a job. For manual providers this is where the human steps in. */
  prepareSpriteJob(
    asset: FurnitureAsset,
    style: Style,
    facings: Facing[],
  ): SpriteJob;
}

export function prepareSpriteJob(
  asset: FurnitureAsset,
  style: Style,
  facings: Facing[],
): SpriteJob {
  const layout = defaultSheetLayout(facings.length);
  const { text } = buildSheetPrompt({ asset, style, facings, layout });
  return { asset, style, facings, layout, prompt: text };
}

export interface IngestResult extends SliceResult {
  assetId: string;
  styleId: string;
}

/**
 * Take a generated sheet back in and turn it into sprites the canvas can use.
 * Also returns per-cell diagnostics, which are the actual instrument for
 * judging whether the model held the camera contract.
 */
export async function ingestSheet(
  job: SpriteJob,
  file: Blob,
): Promise<IngestResult> {
  const sheet = await decodeImageFile(file);
  const result = sliceSheet(
    sheet,
    {
      box: {
        widthMeters: job.asset.widthMeters,
        heightMeters: job.asset.heightMeters,
        depthMeters: job.asset.depthMeters,
      },
      camera: job.style.camera,
      facings: job.facings,
      layout: job.layout,
      symmetric: job.asset.spritesByStyle[job.style.id]?.symmetric ?? true,
    },
    encodeRaster,
  );

  return { ...result, assetId: job.asset.id, styleId: job.style.id };
}

export const manualProvider: GenerationProvider = {
  kind: 'manual',
  prepareSpriteJob,
};

/** Merge freshly sliced cells into an asset's sprite set for a style. */
export function applySprites(
  asset: FurnitureAsset,
  styleId: string,
  sprites: SpriteSet,
): FurnitureAsset {
  const existing = asset.spritesByStyle[styleId];
  return {
    ...asset,
    spritesByStyle: {
      ...asset.spritesByStyle,
      [styleId]: {
        symmetric: sprites.symmetric,
        cells: { ...existing?.cells, ...sprites.cells },
      },
    },
  };
}
