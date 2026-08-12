import { Circle, Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';
import type { ObjectLayout } from '../lib/layout';
import type { ShadowSpec } from '../lib/shadow';
import { useImage } from '../lib/useImage';

interface Props {
  layout: ObjectLayout;
  shadow: ShadowSpec | null;
  selected: boolean;
  showAnchors: boolean;
  onSelect: (id: string) => void;
  onDragMove: (id: string, groundX: number, groundY: number) => void;
  onDragEnd: (id: string, groundX: number, groundY: number) => void;
}

export function ObjectSprite({
  layout,
  shadow,
  selected,
  showAnchors,
  onSelect,
  onDragMove,
  onDragEnd,
}: Props) {
  const cell = layout.sprite?.cell;
  const image = useImage(cell?.url);

  const handleDrag =
    (report: (id: string, x: number, y: number) => void) =>
    (event: Konva.KonvaEventObject<DragEvent>) => {
      // The node's offset is the sprite's ground-contact point, so the node's
      // position is the contact point directly - no conversion needed here.
      report(layout.object.id, event.target.x(), event.target.y());
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
          draggable
          onMouseDown={() => onSelect(layout.object.id)}
          onTouchStart={() => onSelect(layout.object.id)}
          onDragMove={handleDrag(onDragMove)}
          onDragEnd={handleDrag(onDragEnd)}
        />
      )}

      {selected && (
        <Rect
          x={layout.origin.x}
          y={layout.origin.y}
          width={layout.size.width}
          height={layout.size.height}
          stroke="#7dd3fc"
          strokeWidth={1.5}
          dash={[6, 4]}
          listening={false}
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
