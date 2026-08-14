import { useMemo } from 'react';
import { Image as KonvaImage, Layer, Stage } from 'react-konva';
import type { FloorQuad } from '../types/scene';
import type { Unit } from '../lib/units';
import type { FloorTransform } from '../lib/homography';
import { clampToFloor, floorToScreen, screenToFloor, snapToGrid } from '../lib/homography';
import { layoutScene } from '../lib/layout';
import { footprintRadii, shadowFor } from '../lib/shadow';
import { moveObject, setFloorQuad, type SceneStore } from '../lib/sceneStore';
import { useImage } from '../lib/useImage';
import { ObjectSprite } from './ObjectSprite';
import { FloorCalibrator } from './FloorCalibrator';
import { FloorGrid } from './FloorGrid';

export interface CanvasSettings {
  snapMeters: number;
  showGrid: boolean;
  showShadows: boolean;
  showAnchors: boolean;
  calibrating: boolean;
}

interface Props {
  store: SceneStore;
  transform: FloorTransform;
  settings: CanvasSettings;
  unit: Unit;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function RoomCanvas({
  store,
  transform,
  settings,
  unit,
  selectedId,
  onSelect,
}: Props) {
  const { scene } = store;
  const background = useImage(scene.room.backgroundImageUrl);

  // Back-to-front order, recomputed whenever anything moves. Sorting by ground
  // contact rather than bounding-box centre is what keeps the bookshelf behind
  // the sofa that stands in front of it.
  const layouts = useMemo(() => layoutScene(scene, transform), [scene, transform]);

  const groundToFloor = (groundX: number, groundY: number) => {
    const floor = screenToFloor(transform, groundX, groundY);
    const clamped = clampToFloor(transform, floor.x, floor.y);
    return snapToGrid(clamped.x, clamped.y, settings.snapMeters);
  };

  const handleDragMove = (id: string, groundX: number, groundY: number) => {
    const { x, y } = groundToFloor(groundX, groundY);
    // Preview only: a drag must not push a history entry per pointer move.
    store.preview((scene) => moveObject(scene, id, x, y));
    return floorToScreen(transform, x, y);
  };

  const handleDragEnd = (id: string, groundX: number, groundY: number) => {
    const { x, y } = groundToFloor(groundX, groundY);
    store.commit((scene) => moveObject(scene, id, x, y));
    return floorToScreen(transform, x, y);
  };

  const previewQuad = (quad: FloorQuad) => store.preview((s) => setFloorQuad(s, quad));
  const commitQuad = (quad: FloorQuad) => store.commit((s) => setFloorQuad(s, quad));

  return (
    <Stage
      width={scene.room.backgroundSize.width}
      height={scene.room.backgroundSize.height}
      onMouseDown={(event) => {
        if (event.target === event.target.getStage()) onSelect(null);
      }}
    >
      <Layer listening={false}>
        {background && <KonvaImage image={background} />}
        {settings.showGrid && <FloorGrid transform={transform} unit={unit} />}
      </Layer>

      <Layer>
        {layouts.map((layout) => (
          <ObjectSprite
            key={layout.object.id}
            layout={layout}
            shadow={settings.showShadows ? shadowFor(layout, transform, scene.style) : null}
            footprint={footprintRadii(layout, transform)}
            selected={layout.object.id === selectedId}
            showAnchors={settings.showAnchors}
            onSelect={onSelect}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        ))}
      </Layer>

      {settings.calibrating && (
        <Layer>
          <FloorCalibrator
            quad={scene.room.floor}
            onPreview={previewQuad}
            onCommit={commitQuad}
          />
        </Layer>
      )}
    </Stage>
  );
}
