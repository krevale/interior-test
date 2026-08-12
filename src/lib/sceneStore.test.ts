import { describe, expect, it } from 'vitest';
import type { PlacedObject, Scene } from '../types/scene';
import {
  historyReducer,
  initialHistory,
  moveObject,
  removeObject,
  type History,
} from './sceneStore';

const object: PlacedObject = {
  id: 'obj-1',
  roomId: 'room-1',
  assetId: 'asset-1',
  fx: 1,
  fz: 1,
  facing: 0,
  scaleMultiplier: 1,
  zOffset: 0,
  status: 'ready',
};

const scene = { objects: [object] } as unknown as Scene;

const at = (state: History) => {
  const found = state.present.objects[0];
  return { fx: found.fx, fz: found.fz };
};

/** Replay a drag: several previews, then one commit on release. */
function drag(state: History, path: [number, number][]): History {
  let next = state;
  for (const [fx, fz] of path.slice(0, -1)) {
    next = historyReducer(next, {
      type: 'preview',
      update: (s) => moveObject(s, 'obj-1', fx, fz),
    });
  }
  const [fx, fz] = path[path.length - 1];
  return historyReducer(next, {
    type: 'commit',
    update: (s) => moveObject(s, 'obj-1', fx, fz),
  });
}

describe('history', () => {
  it('undoes a whole drag back to where it started', () => {
    // The regression this guards: previews overwrite `present`, so a commit
    // that pushed the current value would record the already-dragged position
    // and undo would visibly do nothing.
    let state = initialHistory(scene);
    state = drag(state, [
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 3],
    ]);
    expect(at(state)).toEqual({ fx: 5, fz: 3 });

    state = historyReducer(state, { type: 'undo' });
    expect(at(state)).toEqual({ fx: 1, fz: 1 });
  });

  it('records one history entry per drag, not one per pointer move', () => {
    let state = initialHistory(scene);
    state = drag(state, [
      [2, 1],
      [3, 1],
      [4, 2],
    ]);
    expect(state.past).toHaveLength(1);
  });

  it('redoes a drag', () => {
    let state = initialHistory(scene);
    state = drag(state, [
      [2, 2],
      [3, 3],
    ]);
    state = historyReducer(state, { type: 'undo' });
    state = historyReducer(state, { type: 'redo' });
    expect(at(state)).toEqual({ fx: 3, fz: 3 });
  });

  it('records nothing for a drag that never leaves its snap cell', () => {
    // Every preview resolves to the position the object already holds, so no
    // gesture ever starts and the commit is a no-op.
    let state = initialHistory(scene);
    state = drag(state, [
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    expect(state.past).toHaveLength(0);
    expect(state.gestureBase).toBeNull();
  });

  it('undoes discrete commits independently', () => {
    let state = initialHistory(scene);
    state = historyReducer(state, {
      type: 'commit',
      update: (s) => moveObject(s, 'obj-1', 2, 2),
    });
    state = historyReducer(state, {
      type: 'commit',
      update: (s) => removeObject(s, 'obj-1'),
    });
    expect(state.present.objects).toHaveLength(0);

    state = historyReducer(state, { type: 'undo' });
    expect(at(state)).toEqual({ fx: 2, fz: 2 });

    state = historyReducer(state, { type: 'undo' });
    expect(at(state)).toEqual({ fx: 1, fz: 1 });
    expect(state.past).toHaveLength(0);
  });

  it('drops the redo stack once a new change lands', () => {
    let state = initialHistory(scene);
    state = historyReducer(state, {
      type: 'commit',
      update: (s) => moveObject(s, 'obj-1', 2, 2),
    });
    state = historyReducer(state, { type: 'undo' });
    expect(state.future).toHaveLength(1);

    state = historyReducer(state, {
      type: 'commit',
      update: (s) => moveObject(s, 'obj-1', 9, 9),
    });
    expect(state.future).toHaveLength(0);
  });

  it('is a no-op at the ends of the stack', () => {
    const state = initialHistory(scene);
    expect(historyReducer(state, { type: 'undo' })).toBe(state);
    expect(historyReducer(state, { type: 'redo' })).toBe(state);
  });
});
