import { useMemo, useRef, useState } from 'react';
import type { Facing, FurnitureAsset, SpriteSet, Style } from '../types/scene';
import { ALL_FACINGS, CANONICAL_FACINGS, DIAGONAL_FACINGS } from '../lib/facing';
import {
  ingestSheet,
  prepareSingleViewJob,
  prepareSpriteJob,
} from '../lib/generation/provider';
import { describeSlice, type SliceDiagnostics } from '../lib/generation/sheet';
import { stepFor, toDisplay, toMeters, unitLabel, type Unit } from '../lib/units';
import { PromptBlock } from './PromptBlock';

type Coverage = 'diagonal' | 'canonical' | 'all';

const COVERAGE: Record<Coverage, { facings: Facing[]; label: string }> = {
  diagonal: { facings: DIAGONAL_FACINGS, label: '2 views → 4 facings' },
  canonical: { facings: CANONICAL_FACINGS, label: '5 views → 8 facings' },
  all: { facings: ALL_FACINGS, label: '8 views (asymmetric piece)' },
};

interface Props {
  assets: FurnitureAsset[];
  style: Style;
  unit: Unit;
  onSprites: (assetId: string, sprites: SpriteSet) => void;
  onCreate: (asset: FurnitureAsset) => void;
}

const BLANK = { name: '', category: 'sofa', width: 1, depth: 1, height: 1 };

/**
 * Furniture assets: a movable object that needs one or more views of itself.
 *
 * Kept separate from the room because the two are different in kind. A room is
 * a single fixed rendering; a piece of furniture rotates, so it may need a whole
 * sheet of views — or just one, if you already have a usable product shot.
 */
export function AssetPanel({ assets, style, unit, onSprites, onCreate }: Props) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [mode, setMode] = useState<'sheet' | 'single'>('sheet');
  const [coverage, setCoverage] = useState<Coverage>('canonical');
  const [facing, setFacing] = useState<Facing>(1);
  const [status, setStatus] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<SliceDiagnostics[]>([]);
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const asset = assets.find((a) => a.id === assetId) ?? assets[0];

  const job = useMemo(() => {
    if (!asset) return null;
    return mode === 'sheet'
      ? prepareSpriteJob(asset, style, COVERAGE[coverage].facings, unit)
      : prepareSingleViewJob(asset, style, facing, unit);
  }, [asset, style, mode, coverage, facing, unit]);

  const ingest = async (file: File) => {
    if (!job) return;
    setStatus('Slicing…');
    try {
      const result = await ingestSheet(job, file);
      setDiagnostics(result.diagnostics);
      onSprites(job.asset.id, result.sprites);
      setStatus(describeSlice(result));
    } catch (error) {
      setDiagnostics([]);
      setStatus(`Failed: ${(error as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const create = () => {
    if (!draft || !draft.name.trim()) return;
    const id = `asset-${Date.now().toString(36)}`;
    onCreate({
      id,
      name: draft.name.trim(),
      category: draft.category.trim() || 'furniture',
      widthMeters: toMeters(draft.width, unit),
      depthMeters: toMeters(draft.depth, unit),
      heightMeters: toMeters(draft.height, unit),
      spritesByStyle: {},
    });
    setAssetId(id);
    setDraft(null);
    setStatus('Asset created. Generate or upload its views next.');
  };

  const size = (key: 'width' | 'depth' | 'height', label: string) => (
    <label className="stacked">
      {label} ({unitLabel(unit)})
      <input
        type="number"
        min={0.1}
        step={stepFor(unit)}
        value={draft ? draft[key] : 1}
        onChange={(e) =>
          setDraft((d) => (d ? { ...d, [key]: Number(e.target.value) || 0.1 } : d))
        }
      />
    </label>
  );

  return (
    <section>
      <h2>Furniture assets</h2>

      {draft ? (
        <>
          <p className="muted">
            Real-world size drives on-screen scale and depth, so approximate
            values still beat guessing with a slider.
          </p>
          <label className="stacked">
            Name
            <input
              type="text"
              value={draft.name}
              placeholder="Walnut sideboard"
              onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            />
          </label>
          <label className="stacked">
            Category
            <input
              type="text"
              value={draft.category}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, category: e.target.value } : d))
              }
            />
          </label>
          <div className="fields">
            {size('width', 'W')}
            {size('depth', 'D')}
            {size('height', 'H')}
          </div>
          <div className="row">
            <button onClick={create} disabled={!draft.name.trim()}>
              Create
            </button>
            <button onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <label className="stacked">
            Asset
            <select value={asset?.id ?? ''} onChange={(e) => setAssetId(e.target.value)}>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setDraft({ ...BLANK })}>New asset…</button>
        </>
      )}

      {asset && !draft && (
        <>
          <p className="muted small">
            {toDisplay(asset.widthMeters, unit).toFixed(2)} &times;{' '}
            {toDisplay(asset.depthMeters, unit).toFixed(2)} &times;{' '}
            {toDisplay(asset.heightMeters, unit).toFixed(2)} {unitLabel(unit)}
          </p>

          <label className="stacked">
            Views
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'sheet' | 'single')}
            >
              <option value="sheet">Rotation sheet</option>
              <option value="single">Single view</option>
            </select>
          </label>

          {mode === 'sheet' ? (
            <label className="stacked">
              Coverage
              <select
                value={coverage}
                onChange={(e) => setCoverage(e.target.value as Coverage)}
              >
                {(Object.keys(COVERAGE) as Coverage[]).map((key) => (
                  <option key={key} value={key}>
                    {COVERAGE[key].label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="stacked">
              Facing
              <select
                value={facing}
                onChange={(e) => setFacing(Number(e.target.value) as Facing)}
              >
                {ALL_FACINGS.map((f) => (
                  <option key={f} value={f}>
                    {f * 45}&deg;
                  </option>
                ))}
              </select>
            </label>
          )}

          {job && (
            <>
              <p className="muted small">
                {mode === 'sheet'
                  ? `${job.layout.cols}×${job.layout.rows} sheet, ${job.facings.length} cells`
                  : 'One image, one facing'}
              </p>
              <PromptBlock prompt={job.prompt} rows={12} />
            </>
          )}

          <label className="stacked">
            {mode === 'sheet' ? 'Sheet image' : 'View image'}
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
                    <td>
                      {d.measured ? `${d.measured.width}×${d.measured.height}` : 'empty'}
                    </td>
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
        </>
      )}
    </section>
  );
}
