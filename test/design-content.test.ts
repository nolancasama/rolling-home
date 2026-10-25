import { describe, expect, it } from 'vitest';
import { COVERINGS, MATERIAL_LIST, MATERIALS, PALETTE, materialDef } from '../src/data/materials';
import { ITEMS, ITEM_LIST, itemDef } from '../src/data/items';
import { SHOPS } from '../src/data/content';
import { VEHICLES } from '../src/data/vehicles';

describe('Design Mode content contract', () => {
  it('exports unique material ids, 48 distinct palette colors and all covering types', () => {
    expect(new Set(MATERIAL_LIST.map(d => d.id)).size).toBe(MATERIAL_LIST.length);
    expect(PALETTE).toHaveLength(48);
    expect(new Set(PALETTE).size).toBe(48);
    expect(Object.keys(COVERINGS)).toHaveLength(10);
    for (const material of MATERIAL_LIST) {
      expect(materialDef(material.id)).toBe(material);
      expect(material.surfaces.length).toBeGreaterThan(0);
      expect(material.repeat.every(n => n > 0)).toBe(true);
      expect(material.kgPerM2).toBeGreaterThanOrEqual(0);
      expect(material.appeal).toBeGreaterThanOrEqual(0);
      expect(material.appeal).toBeLessThanOrEqual(1);
    }
    for (const spec of Object.values(COVERINGS)) {
      if (spec.type !== 'none') expect(MATERIALS[spec.defaultFabric]).toBeDefined();
      if (spec.defaultFabric2) expect(MATERIALS[spec.defaultFabric2]).toBeDefined();
    }
  });

  it('provides valid factory surface and covering assignments and stable opening ids', () => {
    for (const vehicle of Object.values(VEHICLES)) {
      const interior = vehicle.interior;
      expect(new Set(interior.surfaces.map(s => s.id)).size).toBe(interior.surfaces.length);
      expect(new Set(interior.windows.map(w => w.id)).size).toBe(interior.windows.length);
      for (const surface of interior.surfaces) expect(materialDef(surface.factory.mat).surfaces).toContain(surface.kind);
      for (const window of interior.windows) {
        if (window.door) expect(window.factory).toBeUndefined();
        else {
          expect(window.factory?.open).toBe(1);
          expect(materialDef(window.factory!.fabric.mat).surfaces).toContain('window');
        }
      }
      for (const install of vehicle.defaults) {
        expect(ITEMS[install.item]).toBeDefined();
        if ('finish' in install) for (const finish of Object.values(install.finish ?? {})) expect(MATERIALS[finish.mat]).toBeDefined();
      }
    }
    expect(VEHICLES.classc.compartments.some(c => c.id === 'overhead')).toBe(false);
    expect(VEHICLES.van.interior.gas).toEqual([]);
    expect(VEHICLES.classc.defaults.filter(d => d.item === 'cab_upper')).toHaveLength(3);
  });

  it('replaces legacy cabinet catalog ids and stocks all new items at RV suppliers', () => {
    for (const id of ['small_cabinet','tall_cabinet','wardrobe']) expect(ITEMS[id]).toBeUndefined();
    for (const shop of Object.values(SHOPS)) for (const entry of shop.stock) expect(ITEMS[entry.item]).toBeDefined();
    for (const id of ['cab_base','cab_upper','cab_tall','cab_wardrobe','cab_drawers','cab_open_shelf',
      'sofa_lounge','sofa_jackknife','murphy_bed','bunk_beds','table_telescoping','recliner','theater_seats',
      'ottoman','storage_bench','wall_art','fridge_drawer','fridge_12v_10cf','fridge_residential','microwave',
      'range_hood','wet_bath_deluxe','light_dome','light_flush','light_puck','light_pendant','light_sconce',
      'light_reading','light_undercab','light_accent','light_awning','lithium_200','lithium_300','inverter_1000',
      'inverter_charger','mppt','solar_400']) {
      expect(SHOPS.dj_rvsupply.stock.some(s => s.item === id)).toBe(true);
      expect(SHOPS.mc_dealer.stock.some(s => s.item === id)).toBe(true);
    }
    for (const item of ITEM_LIST) for (const slot of item.slots ?? []) {
      expect(slot.surfaces.some(kind => materialDef(slot.default.mat).surfaces.includes(kind))).toBe(true);
    }
    expect(itemDef('plant').slots).toBeUndefined();
  });
});
