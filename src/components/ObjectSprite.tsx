import { Circle, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { ObjectLayout } from '../lib/layout';
import type { ShadowSpec } from '../lib/shadow';
import type { Vec2 } from '../types/scene';
import { useImage } from '../lib/useImage';

interface Props {
  layout: ObjectLayout;
  shadow: ShadowSpec | null;
  /** Real footprint on the floor, used for the selection ring. */
  footprint: { radiusX: number; radiusY: number };
  selected: boolean;
  showAnchors: boolean;
  /** False while the canvas itself is being panned, so a drag pans instead of moving the object. */
  draggable: boolean;
  onSelect: (id: string) => void;
  /** Both return the corrected ground point after clamping and snapping. */
  onDragMove: (id: string, groundX: number, groundY: number) => Vec2;
  onDragEnd: (id: string, groundX: number, groundY: number) => Vec2;
}

const SELECT_TINT = '#7dd3fc';

export function ObjectSprite({
  layout,
  shadow,
  footprint,
  selected,
  showAnchors,
  draggable,
  onSelect,
  onDragMove,
  onDragEnd,
}: Props) {
  const cell = layout.sprite?.cell;
  const image = useImage(cell?.url);

  const handleDrag =
    (report: (id: string, x: number, y: number) => Vec2) =>
    (event: Konva.KonvaEventObject<DragEvent>) => {
      // The node's offset is the sprite's ground-contact point, so the node's
      // position is the contact point directly - no conversion needed here.
      const corrected = report(layout.object.id, event.target.x(), event.target.y());

      // Konva drives the node's position during a drag, and React only writes
      // x/y back when the prop value changes. Snapping usually maps many
      // consecutive pointer positions onto the SAME floor cell, so the prop
      // doesn't change, no re-render lands, and the sprite quietly keeps
      // following the cursor un-snapped. Writing the corrected position onto
      // the node directly is what makes snapping and clamping actually hold.
      event.target.position(corrected);
    };

  return (
    <>
      {shadow && (
        <Circle
          x={shadow.center.x}
          y={shadow.center.y}
          radius={shadow.radiusX}
          scaleY={shadow.radiusY / shadow.radiusX}
          listening={false}
          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
          fillRadialGradientStartRadius={shadow.radiusX * 0.25}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
          fillRadialGradientEndRadius={shadow.radiusX}
          fillRadialGradientColorStops={[
            0,
            `rgba(0,0,0,${shadow.opacity})`,
            0.65,
            `rgba(0,0,0,${shadow.opacity * 0.45})`,
            1,
            'rgba(0,0,0,0)',
          ]}
        />
      )}

      {cell && image && (
        <KonvaImage
          image={image}
          x={layout.ground.x}
          y={layout.ground.y}
          // Offsetting by the anchor makes the node's position the ground
          // contact point, which also means a horizontal mirror pivots about
          // that point - exactly the behaviour a mirrored facing needs.
          offsetX={cell.anchor.x}
          offsetY={cell.anchor.y}
          scaleX={layout.sprite?.mirrored ? -layout.scale : layout.scale}
          scaleY={layout.scale}
          // And on the sprite itself, a soft halo. Canvas shadows respect the
          // image's alpha, so this traces the actual silhouette exactly, at any
          // facing, for free - no outline extraction needed.
          shadowColor={selected ? SELECT_TINT : undefined}
          shadowBlur={selected ? 18 : 0}
          shadowOpacity={selected ? 0.9 : 0}
          shadowForStrokeEnabled={false}
          draggable={draggable}
          onMouseDown={() => onSelect(layout.object.id)}
          onTouchStart={() => onSelect(layout.object.id)}
          onDragMove={handleDrag(onDragMove)}
          onDragEnd={handleDrag(onDragEnd)}
        />
      )}

      {/* An asset with no sprites yet still needs to be visible and selectable. */}
      {!cell && (
        <Circle
          x={layout.ground.x}
          y={layout.ground.y}
          radius={Math.max(footprint.radiusX, 6)}
          scaleY={footprint.radiusY / Math.max(footprint.radiusX, 6)}
          fill="rgba(125,211,252,0.10)"
          stroke={SELECT_TINT}
          strokeWidth={1.5}
          strokeScaleEnabled={false}
          dash={[6, 4]}
          opacity={selected ? 1 : 0.6}
          onMouseDown={() => onSelect(layout.object.id)}
          onTouchStart={() => onSelect(layout.object.id)}
        />
      )}

      {showAnchors && (
        <Circle
          x={layout.ground.x}
          y={layout.ground.y}
          radius={4}
          fill="#f472b6"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={1}
          listening={false}
        />
      )}
    </>
  );
}
