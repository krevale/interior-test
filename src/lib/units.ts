/**
 * Display units.
 *
 * The data model stays metric everywhere — one unit internally means no
 * conversion bugs hiding in the geometry, and the homography, snapping and
 * sizing maths never has to care. Conversion happens only where a number meets
 * a human: input fields, labels, and the dimensions quoted in a prompt.
 */

export type Unit = 'm' | 'ft';

const FEET_PER_METER = 3.280839895013123;

export function toDisplay(meters: number, unit: Unit): number {
  return unit === 'ft' ? meters * FEET_PER_METER : meters;
}

export function toMeters(value: number, unit: Unit): number {
  return unit === 'ft' ? value / FEET_PER_METER : value;
}

export function unitLabel(unit: Unit): string {
  return unit === 'ft' ? 'ft' : 'm';
}

/** Rounded for display: centimetres are meaningless precision on a sofa. */
export function formatLength(meters: number, unit: Unit, digits = 2): string {
  const value = toDisplay(meters, unit);
  const rounded = Number(value.toFixed(digits));
  return `${rounded} ${unitLabel(unit)}`;
}

/** Sensible step for a numeric input in the given unit. */
export function stepFor(unit: Unit): number {
  return unit === 'ft' ? 0.5 : 0.1;
}

/**
 * Snap steps offered per unit, in metres.
 *
 * A continuous slider in metres reads as nonsense once converted — nobody wants
 * to snap to 0.82 ft. Presets keep the choices round in whichever unit is on
 * screen, while the stored value stays metric like everything else.
 */
export function snapPresets(unit: Unit): { meters: number; label: string }[] {
  if (unit === 'ft') {
    return [
      { meters: 0, label: 'off' },
      { meters: toMeters(0.25, 'ft'), label: '3 in' },
      { meters: toMeters(0.5, 'ft'), label: '6 in' },
      { meters: toMeters(1, 'ft'), label: '1 ft' },
      { meters: toMeters(2, 'ft'), label: '2 ft' },
      { meters: toMeters(3, 'ft'), label: '3 ft' },
    ];
  }
  return [
    { meters: 0, label: 'off' },
    { meters: 0.05, label: '5 cm' },
    { meters: 0.1, label: '10 cm' },
    { meters: 0.25, label: '25 cm' },
    { meters: 0.5, label: '50 cm' },
    { meters: 1, label: '1 m' },
  ];
}

/** Nearest available preset to a stored value, so switching units never strands it. */
export function nearestSnapPreset(meters: number, unit: Unit): number {
  const presets = snapPresets(unit);
  return presets.reduce((best, p) =>
    Math.abs(p.meters - meters) < Math.abs(best.meters - meters) ? p : best,
  ).meters;
}
