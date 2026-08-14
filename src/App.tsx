import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildDummyScene } from './data/dummyScene';
import { buildFloorTransform, floorToScreen } from './lib/homography';
import { rotateFacing } from './lib/facing';
import {
  addAsset,
  addObject,
  defaultFloorQuad,
  removeObject,
  setAssetSprites,
  setFacing,
  setFloorDimensions,
  setRoomBackground,
  updateObject,
  useSceneStore,
} from './lib/sceneStore';
import type { Unit } from './lib/units';
import { RoomCanvas, type CanvasSettings } from './components/RoomCanvas';
import { Toolbar } from './components/Toolbar';
import type { FurnitureAsset, PlacedObject } from './types/scene';

export default function App() {
  // Placeholder assets are rendered once on mount; they need a DOM canvas, so
  // this cannot be module-level state.
  const [initialScene] = useState(buildDummyScene);
  const store = useSceneStore(initialScene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>('m');
  const [settings, setSettings] = useState<CanvasSettings>({
    snapMeters: 0.25,
    showGrid: false,
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

  // Dev-only test seam. Lets an automated check read scene state and locate an
  // object on screen, so behaviour like snapping can be asserted numerically
  // instead of guessed at from a screenshot. Stripped from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__rd = {
      scene: store.scene,
      ground: (id: string) => {
        const object = store.scene.objects.find((o) => o.id === id);
        return object && transform
          ? floorToScreen(transform, object.fx, object.fz)
          : null;
      },
    };
  }, [store.scene, transform]);

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
        room={store.scene.room}
        style={store.scene.style}
        unit={unit}
        onUnit={setUnit}
        onSprites={(assetId, sprites) =>
          store.commit((scene) =>
            setAssetSprites(scene, assetId, scene.style.id, sprites),
          )
        }
        onCreateAsset={(asset: FurnitureAsset) =>
          store.commit((scene) => addAsset(scene, asset))
        }
        onBackground={(background) => {
          // A fresh background needs its floor re-marked, and the grid is how
          // you can tell whether the marks landed in the right place.
          setSettings((s) => ({ ...s, calibrating: true, showGrid: true }));
          store.commit((scene) =>
            setRoomBackground(
              scene,
              background,
              defaultFloorQuad(
                background.size.width,
                background.size.height,
                scene.room.floor.widthMeters,
                scene.room.floor.depthMeters,
              ),
            ),
          );
        }}
        onDimensions={(w, d) => store.commit((scene) => setFloorDimensions(scene, w, d))}
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
      />
      <main className="stage-wrap">
        <RoomCanvas
          store={store}
          transform={transform}
          settings={settings}
          unit={unit}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </main>
    </div>
  );
}
