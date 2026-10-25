import { fail, ok, newItem, journal, type Result } from './core';
import { dayOf, fmtClock } from './core';
import { placeName } from './places';
import { SAVE_VERSION } from './newgame';
import type { GameState } from './types';
import { activeVehicle, vdef, installedItems, compartments, defOf } from './vehicle';
import { factoryCustom } from './finishes';
import { checkPlacement } from './furnish';
import { bestCompartment, canStoreIn } from './storage';

// Save files are plain JSON of the whole GameState plus a small header.

export interface SaveSummary {
  day: number;
  clock: string;
  cash: number;
  place: string;
  vehicle: string;
  name: string;
}

export interface SaveFile {
  format: 'rolling-home-save';
  version: number;
  savedAt: string;
  summary: SaveSummary;
  state: GameState;
}

export function summarize(s: GameState): SaveSummary {
  const v = activeVehicle(s);
  const x = s.player.mode === 'explore' ? s.player.pos.x : v.pose.x;
  const z = s.player.mode === 'explore' ? s.player.pos.z : v.pose.z;
  return {
    day: dayOf(s.time.minutes), clock: fmtClock(s.time.minutes), cash: s.cash, place: placeName(x, z),
    vehicle: vdef(v).shortName, name: s.player.name,
  };
}

export function serialize(s: GameState, savedAt: string): string {
  const file: SaveFile = { format: 'rolling-home-save', version: SAVE_VERSION, savedAt, summary: summarize(s), state: s };
  return JSON.stringify(file);
}

function migrate(state: GameState, from: number): GameState {
  state.gameType ??= 'life';
  state.flags ??= {};
  state.revealed ??= {};
  state.explored ??= {};
  state.eventsVisited ??= {};
  state.usedSold ??= {};
  for (const [uid, it] of Object.entries(state.items ?? {})) {
    if (it.where.kind === 'removed') delete state.items[uid];
  }
  for (const v of state.vehicles ?? []) v.custom ??= factoryCustom(vdef(v));
  if (from < 2) {
    const legacy = {
      small_cabinet: { id: 'cab_base', config: { w: 0.6, d: 0.4, h: 0.9 } },
      tall_cabinet: { id: 'cab_tall', config: { w: 0.6, d: 0.45, h: 1.8 } },
      wardrobe: { id: 'cab_wardrobe', config: { w: 0.6, d: 0.6, h: 1.9, style: 'louver' as const } },
    };
    for (const it of Object.values(state.items)) {
      const replacement = legacy[it.def as keyof typeof legacy];
      if (replacement) {
        it.def = replacement.id;
        it.config = { ...replacement.config, ...it.config };
      }
    }
    for (const [key, count] of Object.entries(state.usedSold)) {
      const separator = key.lastIndexOf(':');
      const replacement = legacy[key.slice(separator + 1) as keyof typeof legacy];
      if (replacement) {
        const next = `${key.slice(0, separator + 1)}${replacement.id}`;
        state.usedSold[next] = (state.usedSold[next] ?? 0) + count;
        delete state.usedSold[key];
      }
    }
    for (const v of state.vehicles) {
      const def = vdef(v);
      for (const it of installedItems(state, v.id)) {
        const factory = def.defaults.find(d => d.item === it.def && !('slot' in d));
        if (factory && !('slot' in factory) && factory.finish && !it.finish) it.finish = structuredClone(factory.finish);
      }
      // Snapshot the pre-migration installation set so repeated factory cabinets/lights are all added.
      const existingDefs = new Set(installedItems(state, v.id).map(it => it.def));
      for (const d of def.defaults) {
        if (d.since !== 2 || existingDefs.has(d.item)) continue;
        const opts = { condition: def.startCondition.appliances };
        if ('slot' in d) newItem(state, d.item, { kind: 'slot', vehicle: v.id, slot: d.slot }, opts);
        else {
          const uid = `i${state.uidCounter + 1}`;
          const issues = checkPlacement(state, v.id, { uid, def: d.item, x: d.x, z: d.z, rot: d.rot, y: d.y, config: d.config, state: d.state });
          if (issues.some(i => i.severity === 'block')) {
            journal(state, 'event', 'One overhead cabinet did not fit your custom layout');
            continue;
          }
          newItem(state, d.item, { kind: 'floor', vehicle: v.id, x: d.x, z: d.z, rot: d.rot, y: d.y }, {
            ...opts, config: d.config, finish: d.finish ? structuredClone(d.finish) : undefined, state: d.state,
          });
        }
      }
      for (const it of Object.values(state.items)) {
        if (it.where.kind !== 'stored' || it.where.vehicle !== v.id || it.where.comp !== 'overhead') continue;
        const upper = compartments(state, v.id).find(c => c.hostUid && defOf(state.items[c.hostUid]).family?.type === 'upper' && canStoreIn(state, v.id, c, it).ok);
        const comp = upper?.id ?? bestCompartment(state, v.id, it) ?? 'floor';
        it.where = { kind: 'stored', vehicle: v.id, comp };
        it.secured = compartments(state, v.id).find(c => c.id === comp)?.secure ? undefined : false;
      }
    }
  }
  state.version = SAVE_VERSION;
  return state;
}

export function deserialize(json: string): Result<{ file: SaveFile; state: GameState }> {
  let file: SaveFile;
  try {
    file = JSON.parse(json);
  } catch {
    return fail('Save data is corrupted (not valid JSON).');
  }
  if (!file || file.format !== 'rolling-home-save' || !file.state) return fail('Not a Rolling Home save file.');
  if (file.version > SAVE_VERSION) return fail('This save was made by a newer version of the game.');
  if (!Array.isArray(file.state.vehicles) || !file.state.vehicles.length || !file.state.items || !file.state.player) return fail('Save data is incomplete.');
  const st = migrate(file.state, file.version);
  if (!st.vehicles.some((v) => v.id === st.vehicleId)) return fail('Save data refers to a missing vehicle.');
  return ok({ file, state: st });
}
