import { useMemo, useRef, useState } from 'react';
import type { Facing, FurnitureAsset, SpriteSet, Style } from '../types/scene';
import { ALL_FACINGS, CANONICAL_FACINGS, DIAGONAL_FACINGS } from '../lib/facing';
import { ingestSheet, prepareSpriteJob } from '../lib/generation/provider';
import { describeSlice, type SliceDiagnostics } from '../lib/generation/sheet';

type Coverage = 'diagonal' | 'canonical' | 'all';

const COVERAGE: Record<Coverage, { facings: Facing[]; label: string }> = {
  diagonal: { facings: DIAGONAL_FACINGS, label: '2 sprites → 4 facings' },
  canonical: { facings: CANONICAL_FACINGS, label: '5 sprites → 8 facings' },
  all: { facings: ALL_FACINGS, label: '8 sprites (asymmetric)' },
};

interface Props {
  assets: FurnitureAsset[];
  style: Style;
  selectedAssetId: string | null;
  onSprites: (assetId: string, sprites: SpriteSet) => void;
}

/**
 * The manual generation loop: copy a prompt, run it wherever your subscription
 * already works, drop the resulting sheet back in. No credentials, no API
 * spend, and the sliced result lands in exactly the shape the canvas consumes.
 */
export function GeneratePanel({ assets, style, selectedAssetId, onSprites }: Props) {
  const [assetId, setAssetId] = useState(selectedAssetId ?? assets[0]?.id ?? '');
  const [coverage, setCoverage] = useState<Coverage>('canonical');
  const [status, setStatus] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<SliceDiagnostics[]>([]);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const asset = assets.find((a) => a.id === (selectedAssetId ?? assetId)) ?? assets[0];

  const job = useMemo(
    () => (asset ? prepareSpriteJob(asset, style, COVERAGE[coverage].facings) : null),
    [asset, style, coverage],
  );

  if (!asset || !job) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(job.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const ingest = async (file: File) => {
    setStatus('Slicing…');
    try {
      const result = await ingestSheet(job, file);
      setDiagnostics(result.diagnostics);
      onSprites(asset.id, result.sprites);
      setStatus(describeSlice(result));
    } catch (error) {
      setDiagnostics([]);
      setStatus(`Failed: ${(error as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section>
      <h2>Generate sprites</h2>

      <label className="stacked">
        Asset
        <select value={asset.id} onChange={(e) => setAssetId(e.target.value)}>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="stacked">
        Coverage
        <select value={coverage} onChange={(e) => setCoverage(e.target.value as Coverage)}>
          {(Object.keys(COVERAGE) as Coverage[]).map((key) => (
            <option key={key} value={key}>
              {COVERAGE[key].label}
            </option>
          ))}
        </select>
      </label>

      <p className="muted">
        {job.layout.cols}&times;{job.layout.rows} sheet, {job.facings.length} cells
      </p>

      <button onClick={copy}>{copied ? 'Copied' : 'Copy prompt'}</button>

      <label className="stacked">
        Sheet image
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void ingest(file);
          }}
        />
      </label>

      {status && <p className="muted">{status}</p>}

      {diagnostics.length > 0 && (
        <table className="diagnostics">
          <tbody>
            {diagnostics.map((d) => (
              <tr key={d.facing} className={d.withinTolerance ? '' : 'warn'}>
                <td>{d.facing * 45}&deg;</td>
                <td>{d.measured ? `${d.measured.width}×${d.measured.height}` : 'empty'}</td>
                <td>
                  {Number.isFinite(d.aspectError)
                    ? `${(d.aspectError * 100).toFixed(0)}%`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
