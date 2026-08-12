import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildDummyScene, DUMMY_CATALOG } from './data/dummyScene';
import { buildFloorTransform } from './lib/homography';
import { rotateFacing } from './lib/facing';
import {
  addObject,
  removeObject,
  setAssetSprites,
  setFacing,
  updateObject,
  useSceneStore,
} from './lib/sceneStore';
import { RoomCanvas, type CanvasSettings } from './components/RoomCanvas';
import { Toolbar } from './components/Toolbar';
import type { PlacedObject } from './types/scene';

export default function App() {
  // Placeholder assets are rendered once on mount; they need a DOM canvas, so
  // this cannot be module-level state.
  const [initialScene] = useState(buildDummyScene);
  const store = useSceneStore(initialScene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<CanvasSettings>({
    snapMeters: 0.25,
    showShadows: true,
    showAnchors: false,
    calibrating: false,
  });

  const transform = useMemo(
    () => buildFloorTransform(store.scene.room.floor),
    [store.scene.room.floor],
  );

  const selected = store.scene.objects.find((o) => o.id === selectedId) ?? null;

  const rotate = useCallback(
    (steps: number) => {
      if (!selectedId) return;
      store.commit((scene) => {
        const object = scene.objects.find((o) => o.id === selectedId);
        if (!object) return scene;
        return setFacing(scene, selectedId, rotateFacing(object.facing, steps));
      });
    },
    [selectedId, store],
  );

  const remove = useCallback(() => {
    if (!selectedId) return;
    store.commit((scene) => removeObject(scene, selectedId));
    setSelectedId(null);
  }, [selectedId, store]);

  const add = useCallback(
    (assetId: string) => {
      const id = `obj-${assetId}-${Date.now().toString(36)}`;
      const object: PlacedObject = {
        id,
        roomId: store.scene.room.id,
        assetId,
        fx: store.scene.room.floor.widthMeters / 2,
        fz: store.scene.room.floor.depthMeters / 2,
        facing: 0,
        scaleMultiplier: 1,
        zOffset: 0,
        status: 'ready',
      };
      store.commit((scene) => addObject(scene, object));
      setSelectedId(id);
    },
    [store],
  );

  const nudgeZOffset = useCallback(
    (delta: number) => {
      if (!selectedId) return;
      store.commit((scene) => {
        const object = scene.objects.find((o) => o.id === selectedId);
        if (!object) return scene;
        return updateObject(scene, selectedId, { zOffset: object.zOffset + delta });
      });
    },
    [selectedId, store],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      switch (event.key.toLowerCase()) {
        case 'q':
          rotate(-1);
          break;
        case 'e':
          rotate(1);
          break;
        case 'delete':
        case 'backspace':
          remove();
          break;
        case '[':
          nudgeZOffset(-10);
          break;
        case ']':
          nudgeZOffset(10);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotate, remove, nudgeZOffset, store]);

  if (!transform) {
    return (
      <div className="app error">
        Floor quad is degenerate - drag the calibration handles back into a
        convex shape.
      </div>
    );
  }

  return (
    <div className="app">
      <Toolbar
        assets={Object.values(store.scene.assets)}
        style={store.scene.style}
        onSprites={(assetId, sprites) =>
          store.commit((scene) =>
            setAssetSprites(scene, assetId, scene.style.id, sprites),
          )
        }
        settings={settings}
        onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        selected={selected}
        selectedName={selected ? store.scene.assets[selected.assetId]?.name ?? null : null}
        canUndo={store.canUndo}
        canRedo={store.canRedo}
        onUndo={store.undo}
        onRedo={store.redo}
        onRotate={rotate}
        onDelete={remove}
        onAdd={add}
        catalog={DUMMY_CATALOG.map(({ id, name }) => ({ id, name }))}
      />
      <main className="stage-wrap">
        <RoomCanvas
          store={store}
          transform={transform}
          settings={settings}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </main>
    </div>
  );
}
