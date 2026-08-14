import type {
  FurnitureAsset,
  PlacedObject,
  Room,
  SpriteSet,
  Style,
} from '../types/scene';
import type { CanvasSettings } from './RoomCanvas';
import { AssetPanel } from './AssetPanel';
import { RoomPanel } from './RoomPanel';
import { formatLength, type Unit } from '../lib/units';

interface Props {
  assets: FurnitureAsset[];
  room: Room;
  style: Style;
  unit: Unit;
  onUnit: (unit: Unit) => void;
  onSprites: (assetId: string, sprites: SpriteSet) => void;
  onCreateAsset: (asset: FurnitureAsset) => void;
  onBackground: (background: {
    url: string;
    size: { width: number; height: number };
  }) => void;
  onDimensions: (widthMeters: number, depthMeters: number) => void;
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
}

export function Toolbar({
  assets,
  room,
  style,
  unit,
  onUnit,
  onSprites,
  onCreateAsset,
  onBackground,
  onDimensions,
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
        <div className="row units">
          <button
            className={unit === 'm' ? 'active' : ''}
            onClick={() => onUnit('m')}
          >
            Metres
          </button>
          <button
            className={unit === 'ft' ? 'active' : ''}
            onClick={() => onUnit('ft')}
          >
            Feet
          </button>
        </div>
      </section>

      <section>
        <h2>Selection</h2>
        {selected ? (
          <>
            <p className="muted">
              {selectedName} &middot; facing {selected.facing} ({selected.facing * 45}
              &deg;)
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
        <h2>Place</h2>
        <div className="stack">
          {assets.map((asset) => (
            <button key={asset.id} onClick={() => onAdd(asset.id)}>
              {asset.name}
            </button>
          ))}
        </div>
      </section>

      <RoomPanel
        room={room}
        style={style}
        unit={unit}
        calibrating={settings.calibrating}
        onBackground={onBackground}
        onDimensions={onDimensions}
        onCalibrate={(on) => onSettings({ calibrating: on })}
      />

      <AssetPanel
        assets={assets}
        style={style}
        unit={unit}
        onSprites={onSprites}
        onCreate={onCreateAsset}
      />

      <section>
        <h2>Canvas</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showShadows}
            onChange={(e) => onSettings({ showShadows: e.target.checked })}
          />
          Procedural shadows
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showAnchors}
            onChange={(e) => onSettings({ showAnchors: e.target.checked })}
          />
          Show ground anchors
        </label>
        <label className="stacked">
          Snap:{' '}
          {settings.snapMeters === 0 ? 'off' : formatLength(settings.snapMeters, unit)}
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
