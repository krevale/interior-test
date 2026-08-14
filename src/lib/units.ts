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
