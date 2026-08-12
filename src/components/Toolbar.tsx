import type { FurnitureAsset, PlacedObject, SpriteSet, Style } from '../types/scene';
import type { CanvasSettings } from './RoomCanvas';
import { GeneratePanel } from './GeneratePanel';

interface Props {
  assets: FurnitureAsset[];
  style: Style;
  onSprites: (assetId: string, sprites: SpriteSet) => void;
  settings: CanvasSettings;
  onSettings: (patch: Partial<CanvasSettings>) => void;
  selected: PlacedObject | null;
  selectedName: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRotate: (steps: number) => void;
  onDelete: () => void;
  onAdd: (assetId: string) => void;
  catalog: { id: string; name: string }[];
}

export function Toolbar({
  assets,
  style,
  onSprites,
  settings,
  onSettings,
  selected,
  selectedName,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRotate,
  onDelete,
  onAdd,
  catalog,
}: Props) {
  return (
    <aside className="toolbar">
      <section>
        <h2>Scene</h2>
        <div className="row">
          <button onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button onClick={onRedo} disabled={!canRedo}>
            Redo
          </button>
        </div>
      </section>

      <section>
        <h2>Selection</h2>
        {selected ? (
          <>
            <p className="muted">
              {selectedName} &middot; facing {selected.facing} ({selected.facing * 45}&deg;)
            </p>
            <div className="row">
              <button onClick={() => onRotate(-1)}>&#8630; Rotate</button>
              <button onClick={() => onRotate(1)}>Rotate &#8631;</button>
            </div>
            <button className="danger" onClick={onDelete}>
              Delete
            </button>
          </>
        ) : (
          <p className="muted">Nothing selected. Click an object on the canvas.</p>
        )}
      </section>

      <section>
        <h2>Add</h2>
        <div className="stack">
          {catalog.map((asset) => (
            <button key={asset.id} onClick={() => onAdd(asset.id)}>
              {asset.name}
            </button>
          ))}
        </div>
      </section>

      <GeneratePanel
        assets={assets}
        style={style}
        selectedAssetId={selected?.assetId ?? null}
        onSprites={onSprites}
      />

      <section>
        <h2>Canvas</h2>
        <label>
          <input
            type="checkbox"
            checked={settings.showShadows}
            onChange={(e) => onSettings({ showShadows: e.target.checked })}
          />
          Procedural shadows
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.showAnchors}
            onChange={(e) => onSettings({ showAnchors: e.target.checked })}
          />
          Show ground anchors
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.calibrating}
            onChange={(e) => onSettings({ calibrating: e.target.checked })}
          />
          Calibrate floor plane
        </label>
        <label className="stacked">
          Snap: {settings.snapMeters === 0 ? 'off' : `${settings.snapMeters} m`}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.snapMeters}
            onChange={(e) => onSettings({ snapMeters: Number(e.target.value) })}
          />
        </label>
      </section>

      <section>
        <h2>Keys</h2>
        <p className="muted">
          Drag to move &middot; <kbd>Q</kbd>/<kbd>E</kbd> rotate &middot;{' '}
          <kbd>Del</kbd> remove &middot; <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
        </p>
      </section>
    </aside>
  );
}
