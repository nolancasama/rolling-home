import { ECONOMY, TIME } from '../data/config';
import { DIFFICULTIES, type DifficultyId } from '../data/difficulty';
import { PARKING } from '../data/map';
import { VEHICLES } from '../data/vehicles';
import type { VehicleId } from '../data/types';
import { newItem } from './core';
import { localToWorld } from './geo';
import { bestCompartment } from './storage';
import type { GameState, Look, VehicleState } from './types';
import { capacities } from './vehicle';

export const SAVE_VERSION = 1;

export interface NewGameOptions {
  name: string;
  look: Look;
  vehicle: VehicleId;
  difficulty: DifficultyId;
  seed: number;
}

/** Creates a vehicle with its factory equipment installed. */
export function setupNewVehicle(s: GameState, defId: VehicleId, pose: { x: number; z: number; heading: number }): VehicleState {
  const def = VEHICLES[defId];
  const id = `v${++s.uidCounter}`;
  const v: VehicleState = {
    id, def: defId, pose: { ...pose },
    fuel: def.tanks.fuel.liters * ECONOMY.startFuel,
    fresh: def.tanks.fresh.liters * ECONOMY.startFresh,
    gray: def.id === 'van' ? 6 : 10,
    black: def.id === 'van' ? 3 : 8,
    propane: def.tanks.propane?.kg ?? 0,
    batteryWh: 0,
    condition: { engine: def.startCondition.engine, steering: def.startCondition.steering, brakes: def.startCondition.brakes },
    body: def.startCondition.body,
    dirt: 0.35,
    odometerKm: def.id === 'van' ? 241_300 : 128_700,
    hookups: { power: false, water: false, sewer: false },
    awning: false, levelled: false, engineOn: false, generatorOn: false, parkingBrake: true,
  };
  s.vehicles.push(v);
  for (const d of def.defaults) {
    if ('slot' in d) newItem(s, d.item, { kind: 'slot', vehicle: id, slot: d.slot }, { condition: def.startCondition.appliances });
    else {
      const bed = newItem(s, d.item, { kind: 'floor', vehicle: id, x: d.x, z: d.z, rot: d.rot }, { condition: def.startCondition.appliances });
      if (d.mattress) newItem(s, d.mattress, { kind: 'mattress', vehicle: id, bed: bed.uid }, { condition: 0.7 });
    }
  }
  v.batteryWh = capacities(s, id).batteryWh * 0.85;
  return v;
}

const START_BELONGINGS = [
  'clothes', 'kitchenware', 'bedding', 'books', 'guitar', 'laptop', 'water_hose', 'sewer_kit', 'power_cord',
  'cargo_straps', 'camp_chair', 'pasta_kit', 'canned_chili', 'snack_bars',
];

export function newGame(opts: NewGameOptions): GameState {
  const diff = DIFFICULTIES[opts.difficulty];
  const s: GameState = {
    version: SAVE_VERSION,
    seed: opts.seed >>> 0,
    difficulty: opts.difficulty,
    time: { minutes: TIME.startMinutes },
    uidCounter: 0,
    player: {
      name: opts.name || 'Traveler',
      look: opts.look,
      mode: 'explore',
      pos: { x: 0, z: 0, yaw: 0 },
      inside: { x: 0, z: 0, yaw: Math.PI },
      needs: { hunger: 72, energy: 86, hygiene: 82, mood: 62 },
      moodMods: [],
      carrying: null,
    },
    vehicles: [],
    vehicleId: '',
    items: {},
    cash: diff.startCash,
    tx: [],
    jobs: { boards: {}, active: [], completed: 0, failed: 0, history: [], remoteHoursToday: 0, remoteDay: 1, hankWeek: -1 },
    reservation: null,
    freeNights: {},
    lastNightPlace: null,
    procedures: {},
    discovered: {},
    revealed: {},
    explored: {},
    npcs: {},
    objectives: { done: {}, goalResult: 'pending' },
    stats: { kmTotal: 0, today: { day: 1, earned: 0, spent: 0, km: 0, discoveries: [] }, history: [], nights: 0 },
    journal: [{ t: TIME.startMinutes, kind: 'event', text: 'Day 1. Everything you own fits in this RV. Time to make it a home.' }],
    locker: null,
    usedSold: {},
    eventsVisited: {},
    flags: { 'visited:dusty': true },
  };
  const lot = PARKING.find((p) => p.id === 'dj_lot')!;
  const v = setupNewVehicle(s, opts.vehicle, { x: lot.x, z: lot.z + 4, heading: Math.PI });
  s.vehicleId = v.id;
  const extra = opts.vehicle === 'van' ? ['butane'] : [];
  for (const id of [...START_BELONGINGS, ...extra]) {
    const inst = newItem(s, id, { kind: 'carried' });
    const comp = bestCompartment(s, v.id, inst) ?? 'floor';
    inst.where = { kind: 'stored', vehicle: v.id, comp };
    if (comp === 'floor') inst.secured = true;
  }
  const def = VEHICLES[opts.vehicle];
  const [px, pz] = localToWorld(def.interior.door.outside.x - 0.6, def.interior.door.outside.z + 1.2, v.pose.x, v.pose.z, v.pose.heading);
  s.player.pos = { x: px, z: pz, yaw: v.pose.heading + Math.PI / 2 };
  return s;
}
