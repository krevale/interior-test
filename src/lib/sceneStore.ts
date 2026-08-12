import { useCallback, useMemo, useReducer } from 'react';
import type { Facing, PlacedObject, Scene, SpriteSet } from '../types/scene';

/**
 * Undo/redo is here from the start rather than bolted on later. Retrofitting
 * history onto mutable state is painful, and the cost of doing it now is one
 * immutable update per commit.
 *
 * The subtlety is gestures. A drag emits a stream of previews and one commit,
 * and history must record the state from BEFORE the first preview - not the
 * state as it stood when the pointer was released, which is already the moved
 * one. So the first preview of a gesture stashes a baseline, every later
 * preview leaves it alone, and the commit pushes that baseline rather than the
 * current value. Without this, undo after a drag appears to do nothing.
 */
export interface History {
  past: Scene[];
  present: Scene;
  future: Scene[];
  /** State from before the current gesture began, if one is in flight. */
  gestureBase: Scene | null;
}

const HISTORY_LIMIT = 100;

export type HistoryAction =
  | { type: 'preview'; update: (scene: Scene) => Scene }
  | { type: 'commit'; update: (scene: Scene) => Scene }
  | { type: 'undo' }
  | { type: 'redo' };

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case 'preview': {
      const next = action.update(state.present);
      if (next === state.present) return state;
      return {
        ...state,
        present: next,
        gestureBase: state.gestureBase ?? state.present,
      };
    }

    case 'commit': {
      const next = action.update(state.present);
      const base = state.gestureBase ?? state.present;
      if (next === base) {
        // The gesture ended where it started; nothing worth remembering.
        return { ...state, present: next, gestureBase: null };
      }
      return {
        past: [...state.past, base].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        gestureBase: null,
      };
    }

    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        gestureBase: null,
      };
    }

    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
        gestureBase: null,
      };
    }
  }
}

export function initialHistory(scene: Scene): History {
  return { past: [], present: scene, future: [], gestureBase: null };
}

export interface SceneStore {
  scene: Scene;
  canUndo: boolean;
  canRedo: boolean;
  /** Apply a change and push a history entry. */
  commit: (update: (scene: Scene) => Scene) => void;
  /** Apply a change without pushing history, for in-flight gestures. */
  preview: (update: (scene: Scene) => Scene) => void;
  undo: () => void;
  redo: () => void;
}

export function useSceneStore(initial: Scene): SceneStore {
  const [history, dispatch] = useReducer(historyReducer, initial, initialHistory);

  const commit = useCallback(
    (update: (scene: Scene) => Scene) => dispatch({ type: 'commit', update }),
    [],
  );
  const preview = useCallback(
    (update: (scene: Scene) => Scene) => dispatch({ type: 'preview', update }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  return useMemo(
    () => ({
      scene: history.present,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      commit,
      preview,
      undo,
      redo,
    }),
    [history, commit, preview, undo, redo],
  );
}

/* ---------- scene updates ---------- */

/**
 * Returns the same scene when the patch changes nothing. That reference
 * stability matters more than it looks: with snapping on, most pointer moves
 * during a drag resolve to the position the object already holds, and without
 * this check each one would allocate a new scene and re-render the canvas.
 */
export function updateObject(
  scene: Scene,
  id: string,
  patch: Partial<PlacedObject>,
): Scene {
  let changed = false;
  const objects = scene.objects.map((object) => {
    if (object.id !== id) return object;
    const differs = (Object.keys(patch) as (keyof PlacedObject)[]).some(
      (key) => object[key] !== patch[key],
    );
    if (!differs) return object;
    changed = true;
    return { ...object, ...patch };
  });
  return changed ? { ...scene, objects } : scene;
}

export function moveObject(scene: Scene, id: string, fx: number, fz: number): Scene {
  return updateObject(scene, id, { fx, fz });
}

export function setFacing(scene: Scene, id: string, facing: Facing): Scene {
  return updateObject(scene, id, { facing });
}

export function removeObject(scene: Scene, id: string): Scene {
  const objects = scene.objects.filter((object) => object.id !== id);
  return objects.length === scene.objects.length ? scene : { ...scene, objects };
}

export function addObject(scene: Scene, object: PlacedObject): Scene {
  return { ...scene, objects: [...scene.objects, object] };
}

export function setFloorQuad(scene: Scene, quad: Scene['room']['floor']): Scene {
  return { ...scene, room: { ...scene.room, floor: quad } };
}

/** Merge a freshly generated sprite set into an asset, for one style. */
export function setAssetSprites(
  scene: Scene,
  assetId: string,
  styleId: string,
  sprites: SpriteSet,
): Scene {
  const asset = scene.assets[assetId];
  if (!asset) return scene;
  return {
    ...scene,
    assets: {
      ...scene.assets,
      [assetId]: {
        ...asset,
        spritesByStyle: {
          ...asset.spritesByStyle,
          [styleId]: {
            symmetric: sprites.symmetric,
            cells: { ...asset.spritesByStyle[styleId]?.cells, ...sprites.cells },
          },
        },
      },
    },
  };
}
