import { describe, expect, it } from 'vitest';
import { ITEM_LIST } from '../src/data/items';
import { COVERINGS, MATERIAL_LIST, PALETTE } from '../src/data/materials';
import { VEHICLES } from '../src/data/vehicles';

// Guards the content files against accidental changes during refactors: any
// difference in the resolved catalog data fails here. Update the snapshot only
// when a content change is intended.

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]));
  }
  return value;
}

describe('content snapshot', () => {
  it('items', () => expect(stable(ITEM_LIST)).toMatchSnapshot());
  it('materials, palette and coverings', () => expect(stable({ MATERIAL_LIST, PALETTE, COVERINGS })).toMatchSnapshot());
  it('vehicles', () => expect(stable(VEHICLES)).toMatchSnapshot());
});
