import { fail, ok, type Result } from './core';
import { dayOf, fmtClock } from './core';
import { placeName } from './places';
import { SAVE_VERSION } from './newgame';
import type { GameState } from './types';
import { activeVehicle, vdef } from './vehicle';

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
  // v1 is the first format; future migrations go here.
  void from;
  state.flags ??= {};
  state.revealed ??= {};
  state.explored ??= {};
  state.eventsVisited ??= {};
  state.usedSold ??= {};
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
  const st = migrate(file.state, file.version);
  if (!Array.isArray(st.vehicles) || !st.vehicles.length || !st.items || !st.player) return fail('Save data is incomplete.');
  if (!st.vehicles.some((v) => v.id === st.vehicleId)) return fail('Save data refers to a missing vehicle.');
  return ok({ file, state: st });
}
