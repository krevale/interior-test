import { Line } from 'react-konva';
import { floorToScreen, type FloorTransform } from '../lib/homography';
import { toDisplay, type Unit } from '../lib/units';

interface Props {
  transform: FloorTransform;
  unit: Unit;
}

/**
 * A grid drawn on the calibrated floor plane.
 *
 * Lines are spaced one display unit apart — a metre or a foot — and projected
 * through the homography, so they follow the room's real perspective rather
 * than sitting flat on the screen. That makes it a check on the calibration as
 * much as a placement aid: if the grid doesn't lie along the floorboards, the
 * corner handles are in the wrong place and everything derived from them
 * (sizing, depth scaling, snapping) is off by the same amount.
 *
 * A projective transform maps straight lines to straight lines, so two
 * projected endpoints per line are enough.
 */
export function FloorGrid({ transform, unit }: Props) {
  const { widthMeters, depthMeters } = transform.quad;

  // One metre, or one foot expressed in metres.
  const step = unit === 'ft' ? 1 / 3.280839895013123 : 1;
  const lines: { points: number[]; edge: boolean }[] = [];

  const addLine = (from: [number, number], to: [number, number], edge: boolean) => {
    const a = floorToScreen(transform, from[0], from[1]);
    const b = floorToScreen(transform, to[0], to[1]);
    if ([a.x, a.y, b.x, b.y].some(Number.isNaN)) return;
    lines.push({ points: [a.x, a.y, b.x, b.y], edge });
  };

  // Cap the count so a mis-set dimension can't try to draw thousands of lines.
  const maxLines = 200;
  const acrossCount = Math.min(Math.floor(widthMeters / step), maxLines);
  const downCount = Math.min(Math.floor(depthMeters / step), maxLines);

  for (let i = 1; i <= acrossCount; i++) {
    const fx = i * step;
    if (fx >= widthMeters) break;
    addLine([fx, 0], [fx, depthMeters], false);
  }
  for (let i = 1; i <= downCount; i++) {
    const fz = i * step;
    if (fz >= depthMeters) break;
    addLine([0, fz], [widthMeters, fz], false);
  }

  // The boundary last, brighter, so the calibrated extent reads clearly.
  addLine([0, 0], [widthMeters, 0], true);
  addLine([widthMeters, 0], [widthMeters, depthMeters], true);
  addLine([widthMeters, depthMeters], [0, depthMeters], true);
  addLine([0, depthMeters], [0, 0], true);

  const label = `${Math.round(toDisplay(step, unit))} ${unit}`;

  return (
    <>
      {lines.map((line, index) => (
        <Line
          key={`${index}-${label}`}
          points={line.points}
          stroke={line.edge ? 'rgba(125,211,252,0.55)' : 'rgba(255,255,255,0.18)'}
          strokeWidth={line.edge ? 1.5 : 1}
          listening={false}
        />
      ))}
    </>
  );
}
