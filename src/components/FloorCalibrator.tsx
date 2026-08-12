import { Circle, Line } from 'react-konva';
import type Konva from 'konva';
import type { FloorQuad } from '../types/scene';

type CornerKey = 'tl' | 'tr' | 'br' | 'bl';
const CORNERS: CornerKey[] = ['tl', 'tr', 'br', 'bl'];

interface Props {
  quad: FloorQuad;
  onPreview: (quad: FloorQuad) => void;
  onCommit: (quad: FloorQuad) => void;
}

/**
 * Four draggable handles defining the floor plane.
 *
 * An image model will not tell us what projection it invented for a generated
 * room, and inferring one is guesswork. Dragging four corners onto the floor
 * takes a couple of seconds and gives an exact homography, which everything
 * downstream - snapping, depth scaling, shadow shape - depends on.
 */
export function FloorCalibrator({ quad, onPreview, onCommit }: Props) {
  const points = CORNERS.flatMap((key) => [quad[key].x, quad[key].y]);

  const move =
    (key: CornerKey, report: (quad: FloorQuad) => void) =>
    (event: Konva.KonvaEventObject<DragEvent>) => {
      report({ ...quad, [key]: { x: event.target.x(), y: event.target.y() } });
    };

  return (
    <>
      <Line points={points} closed stroke="#7dd3fc" strokeWidth={1.5} dash={[8, 6]} />
      {CORNERS.map((key) => (
        <Circle
          key={key}
          x={quad[key].x}
          y={quad[key].y}
          radius={9}
          fill="#0ea5e9"
          stroke="#f8fafc"
          strokeWidth={2}
          draggable
          onDragMove={move(key, onPreview)}
          onDragEnd={move(key, onCommit)}
        />
      ))}
    </>
  );
}
