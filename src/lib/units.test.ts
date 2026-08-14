import { describe, expect, it } from 'vitest';
import { formatLength, stepFor, toDisplay, toMeters, unitLabel } from './units';

describe('units', () => {
  it('round-trips through both units without drift', () => {
    for (const meters of [0.35, 2.1, 6, 12.75]) {
      expect(toMeters(toDisplay(meters, 'ft'), 'ft')).toBeCloseTo(meters, 10);
      expect(toMeters(toDisplay(meters, 'm'), 'm')).toBe(meters);
    }
  });

  it('converts to feet at the standard ratio', () => {
    expect(toDisplay(1, 'ft')).toBeCloseTo(3.2808, 3);
    expect(toMeters(3.2808, 'ft')).toBeCloseTo(1, 4);
  });

  it('leaves metres untouched', () => {
    expect(toDisplay(2.4, 'm')).toBe(2.4);
    expect(toMeters(2.4, 'm')).toBe(2.4);
  });

  it('formats with a unit suffix and sane precision', () => {
    expect(formatLength(2.1, 'm')).toBe('2.1 m');
    expect(formatLength(2.1, 'ft')).toBe('6.89 ft');
  });

  it('uses a coarser step for feet', () => {
    expect(stepFor('ft')).toBeGreaterThan(stepFor('m'));
    expect(unitLabel('ft')).toBe('ft');
  });
});
