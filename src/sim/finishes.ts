import { COVERINGS, materialDef } from '../data/materials';
import type { SurfaceDef, VehicleDef, WindowDef, WindowTreatment } from '../data/types';
import { dFromZ } from '../data/vehicles';
import type { VehicleState } from './types';

/** Windows use ground-relative Y, while furniture uses height above the floor. */
export function windowArea(w: WindowDef): number {
  return (w.a1 - w.a0) * (w.y1 - w.y0);
}

export function factoryCustom(def: VehicleDef): VehicleState['custom'] {
  return {
    surfaces: Object.fromEntries(def.interior.surfaces.map(s => [s.id, { ...s.factory }])),
    windows: Object.fromEntries(def.interior.windows.filter(w => !w.door && w.factory).map(w => [w.id, structuredClone(w.factory!)])),
  };
}

export function surfaceGeometry(def: VehicleDef, surface: SurfaceDef): { area: number; d: number } {
  const i = def.interior;
  if (surface.rect) {
    const r = surface.rect;
    return { area: (r.x1 - r.x0) * (r.z1 - r.z0), d: dFromZ(def, (r.z0 + r.z1) / 2) };
  }
  if (surface.wall) {
    const w = surface.wall;
    const height = i.ceilingY - (surface.id === 'wall.bulkhead' ? i.cabCeilingY : i.floorY);
    let area = (w.a1 - w.a0) * height;
    for (const win of i.windows) {
      if (win.side === w.side && win.a0 >= w.a0 && win.a1 <= w.a1 && !win.door) area -= windowArea(win);
    }
    if (w.side === i.door.side) {
      const span = Math.max(0, Math.min(w.a1, i.door.z1) - Math.max(w.a0, i.door.z0));
      area -= span * Math.min(height, def.interior.openings[0]?.h ?? height);
    }
    const z = w.side === 'left' || w.side === 'right' ? (w.a0 + w.a1) / 2 : w.side === 'rear' ? i.living.z0 : i.living.z1;
    return { area: Math.max(0, area), d: dFromZ(def, z) };
  }
  const width = i.living.x1 - i.living.x0, length = i.living.z1 - i.living.z0;
  const perimeter = 2 * (width + length);
  const windows = i.windows.reduce((sum, w) => sum + 2 * (w.a1 - w.a0 + w.y1 - w.y0), 0);
  const door = 2 * (i.door.z1 - i.door.z0) + 2 * (i.openings[0]?.h ?? 0);
  return { area: (2 * perimeter + windows + door) * 0.08, d: def.shellD };
}

export function windowD(def: VehicleDef, w: WindowDef): number {
  return dFromZ(def, w.side === 'left' || w.side === 'right' ? (w.a0 + w.a1) / 2 : w.side === 'rear' ? def.interior.living.z0 : def.interior.living.z1);
}

export function coveringArea(w: WindowDef, treatment: WindowTreatment): number {
  const margin = treatment.mount === 'outside' ? 0.1 : 0;
  return (w.a1 - w.a0 + margin) * (w.y1 - w.y0 + margin);
}

export function coveringMass(w: WindowDef, treatment?: WindowTreatment): number {
  if (!treatment || treatment.type === 'none') return 0;
  return COVERINGS[treatment.type].kgPerM2 * coveringArea(w, treatment) + (treatment.valance ? 0.6 * (w.a1 - w.a0) : 0);
}

export function closedTransmission(t: WindowTreatment | undefined): number {
  if (!t || t.type === 'none') return 1;
  const fabric = t.type === 'day_night' && t.layer === 'night' ? t.fabric2 ?? t.fabric : t.fabric;
  return materialDef(fabric.mat).transmission ?? 0.3;
}

export function coveringTransmission(t: WindowTreatment | undefined): number {
  return !t ? 1 : t.open + (1 - t.open) * closedTransmission(t);
}
