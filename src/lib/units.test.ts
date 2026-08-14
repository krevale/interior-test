import { describe, expect, it } from 'vitest';
import {
  formatLength,
  nearestSnapPreset,
  snapPresets,
  stepFor,
  toDisplay,
  toMeters,
  unitLabel,
} from './units';

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

  it('offers round snap steps in whichever unit is on screen', () => {
    expect(snapPresets('m').map((p) => p.label)).toContain('25 cm');
    expect(snapPresets('ft').map((p) => p.label)).toContain('1 ft');
    // Stored values stay metric even when the label is imperial.
    const oneFoot = snapPresets('ft').find((p) => p.label === '1 ft')!.meters;
    expect(oneFoot).toBeCloseTo(0.3048, 4);
  });

  it('maps a stored value onto the nearest preset when units change', () => {
    // 0.25 m has no round imperial equivalent, so it lands on the closest one
    // (1 ft) rather than stranding the select with no matching option.
    expect(nearestSnapPreset(0.25, 'm')).toBe(0.25);
    expect(nearestSnapPreset(0.25, 'ft')).toBeCloseTo(toMeters(1, 'ft'), 4);
    expect(nearestSnapPreset(0, 'ft')).toBe(0);
  });
});
