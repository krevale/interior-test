import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Image as KonvaImage, Layer, Stage } from 'react-konva';
import type Konva from 'konva';
import type { FloorQuad } from '../types/scene';
import type { Unit } from '../lib/units';
import type { FloorTransform } from '../lib/homography';
import { clampToFloor, floorToScreen, screenToFloor, snapToGrid } from '../lib/homography';
import { layoutScene } from '../lib/layout';
import { footprintRadii, shadowFor } from '../lib/shadow';
import { moveObject, setFloorQuad, type SceneStore } from '../lib/sceneStore';
import { useImage } from '../lib/useImage';
import { fitToScreen, zoomByWheel, zoomTo, type Viewport } from '../lib/viewport';
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

const DEFAULT_VIEW: Viewport = { scale: 1, x: 0, y: 0 };
const ZOOM_BUTTON_FACTOR = 1.3;

/** Resize-aware element size, so the Stage always matches its container exactly. */
function useElementSize(): [RefObject<HTMLDivElement>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize?.[0];
      setSize(
        box
          ? { width: box.inlineSize, height: box.blockSize }
          : { width: entry.contentRect.width, height: entry.contentRect.height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/**
 * Whether the spacebar is currently held, the trigger for hand-tool panning.
 * Tracked globally (not per-element) so panning starts the instant space goes
 * down without first requiring the canvas to have focus, matching the
 * convention from Figma/Photoshop/etc.
 */
function useSpaceHeld(): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const tag = (target as HTMLElement | null)?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;
      // Space's default action is to scroll the page or activate a focused
      // button; the canvas needs it exclusively for the pan gesture.
      event.preventDefault();
      setHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      setHeld(false);
    };
    // Also release on blur - otherwise alt-tabbing away mid-hold leaves the
    // hand cursor stuck on with no keyup ever arriving to clear it.
    const onBlur = () => setHeld(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return held;
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

  const [containerRef, viewportSize] = useElementSize();
  const [view, setView] = useState<Viewport>(DEFAULT_VIEW);
  const [isPanningNow, setIsPanningNow] = useState(false);
  const spaceHeld = useSpaceHeld();
  const panMode = spaceHeld;

  // Re-fit whenever the viewport first gets a real size, or a different
  // background image loads. Re-fitting on every resize would yank the view
  // out from under someone mid-edit, so a plain window resize leaves pan/zoom
  // alone - only a genuinely new room image resets it.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
    const key = scene.room.backgroundImageUrl;
    if (fittedFor.current === key) return;
    const fitted = fitToScreen(viewportSize, scene.room.backgroundSize);
    if (!fitted) return;
    fittedFor.current = key;
    setView(fitted);
  }, [viewportSize, scene.room.backgroundImageUrl, scene.room.backgroundSize]);

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

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    setView((current) => zoomByWheel(current, pointer, event.evt.deltaY));
  };

  const zoomButton = (factor: number) => {
    const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
    setView((current) => zoomTo(current, center, current.scale * factor));
  };

  const resetView = () => {
    const fitted = fitToScreen(viewportSize, scene.room.backgroundSize);
    if (fitted) setView(fitted);
  };

  // Dev-only test seam, additive to the one App.tsx installs. Content-space
  // coordinates (what floorToScreen/window.__rd.ground return) stopped being
  // screen pixels once the Stage gained its own pan/zoom transform, so an
  // automated check now needs this to convert between the two.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const target = window as unknown as { __rd?: Record<string, unknown> };
    target.__rd = {
      ...target.__rd,
      view,
      contentToScreen: (x: number, y: number) => ({
        x: x * view.scale + view.x,
        y: y * view.scale + view.y,
      }),
    };
  }, [view]);

  const cursorClass = panMode ? (isPanningNow ? 'panning' : 'pannable') : '';

  return (
    <div ref={containerRef} className={`canvas-viewport ${cursorClass}`}>
      {viewportSize.width > 0 && viewportSize.height > 0 && (
        <Stage
          width={viewportSize.width}
          height={viewportSize.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={panMode}
          onDragStart={() => setIsPanningNow(true)}
          onDragEnd={(event) => {
            setIsPanningNow(false);
            setView((current) => ({
              ...current,
              x: event.target.x(),
              y: event.target.y(),
            }));
          }}
          onWheel={handleWheel}
          onMouseDown={(event) => {
            if (!panMode && event.target === event.target.getStage()) onSelect(null);
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
                draggable={!panMode}
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
                draggable={!panMode}
                onPreview={previewQuad}
                onCommit={commitQuad}
              />
            </Layer>
          )}
        </Stage>
      )}

      <div className="zoom-controls">
        <button onClick={() => zoomButton(1 / ZOOM_BUTTON_FACTOR)} title="Zoom out">
          &minus;
        </button>
        <button onClick={resetView} className="zoom-readout" title="Fit to screen">
          {Math.round(view.scale * 100)}%
        </button>
        <button onClick={() => zoomButton(ZOOM_BUTTON_FACTOR)} title="Zoom in">
          +
        </button>
      </div>
    </div>
  );
}
