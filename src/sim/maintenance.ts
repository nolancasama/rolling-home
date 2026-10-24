import { MECHANICS } from '../data/content';
import { FUEL, WEAR } from '../data/config';
import type { ComponentId } from '../data/types';
import { charge, deleteItem, difficulty, fail, money, note, ok, price, type Result } from './core';
import { clamp } from './geo';
import { addMood, restore } from './needs';
import type { GameState, VehicleState } from './types';
import { appliancesCondition, defOf, hasTool, installedItems, itemsInVehicle, vdef, vehicleById } from './vehicle';
import { computeWeight } from './weight';

// Mechanical condition, how it changes driving, and repairs.

export interface Performance {
  /** Engine power multiplier. */
  power: number;
  topSpeed: number;
  brake: number;
  grip: number;
  /** Steering response multiplier (lower = laggier). */
  steerResponse: number;
  /** Constant steering pull (rad at the wheel). */
  drift: number;
  /** Random wander amplitude. */
  wander: number;
  /** Body vibration 0..1. */
  vibration: number;
  /** Engine roughness for audio 0..1. */
  roughness: number;
  fuelMul: number;
  wearMul: number;
  limp: boolean;
  loadRatio: number;
  overloaded: boolean;
  /** Top-heavy roof load (handling). */
  roofPenalty: number;
}

export function performance(s: GameState, vid: string): Performance {
  const v = vehicleById(s, vid);
  const def = vdef(v);
  const e = v.condition.engine;
  const st = v.condition.steering;
  const br = v.condition.brakes;
  const w = computeWeight(s, vid);
  const ref = def.shellMass + 300;
  const loadRatio = w.total / ref;
  const over = Math.max(w.overGvwr / def.gvwr, 0);
  const axleOver = Math.max(w.overFront / def.frontGawr, w.overRear / def.rearGawr, 0);
  const frontLight = w.front / w.total < 0.36 ? (0.36 - w.front / w.total) * 3 : 0;
  const roofPenalty = clamp(w.roofKg / 120, 0, 0.5);
  const limp = e < WEAR.limpModeBelow;
  return {
    power: (0.62 + 0.38 * Math.pow(e, 0.8)) / Math.max(1, loadRatio * 0.92),
    topSpeed: limp ? 0.42 : 0.86 + 0.14 * e,
    brake: (0.58 + 0.42 * br) / (1 + over * 2.2 + Math.max(0, loadRatio - 1) * 0.35),
    grip: clamp(1 - over * 1.6 - axleOver * 1.2 - frontLight * 0.6 - roofPenalty * 0.25 - (1 - st) * 0.12, 0.55, 1),
    steerResponse: clamp((0.55 + 0.45 * st) * (1 - frontLight * 0.8) * (1 - axleOver * 0.8), 0.35, 1),
    drift: (1 - st) * 0.035,
    wander: Math.max(0, 0.7 - st) * 0.05 + axleOver * 0.05,
    vibration: clamp((1 - st) * 0.6 + (1 - e) * 0.35, 0, 1),
    roughness: clamp(Math.pow(1 - e, 1.3) * 1.25, 0, 1),
    fuelMul: (1 + FUEL.wearFactor * (1 - e)) * (1 + FUEL.loadFactor * Math.max(0, loadRatio - 1)),
    wearMul: 1 + over * 3 + axleOver * 3,
    limp,
    loadRatio,
    overloaded: w.worstFraction > 0,
    roofPenalty,
  };
}

/** Fuel liters for driving fictional km at a speed (m/s). */
export function fuelForKm(s: GameState, vid: string, km: number, speed: number, perf = performance(s, vid)): number {
  const def = vdef(vehicleById(s, vid));
  const speedMul = 1 + Math.max(0, speed - 22) * 0.03;
  return (def.fuelLPer100 / 100) * km * perf.fuelMul * speedMul;
}

export interface WearInput {
  km: number;
  /** 0..1 roughness of the surface. */
  rough: number;
  /** Hard braking energy this step (m²/s², 0 for none). */
  brakeEnergy: number;
  /** Throttle-heavy driving 0..1. */
  harsh: number;
}

export function applyDrivingWear(s: GameState, v: VehicleState, inp: WearInput, perf: Performance): void {
  const mul = difficulty(s).wearMul * perf.wearMul;
  const age = 1 + (2026 - vdef(v).year) * 0.006;
  const before = { ...v.condition };
  v.condition.engine = clamp(v.condition.engine - WEAR.enginePerKm * inp.km * mul * age * (1 + inp.harsh * 0.8), 0, 1);
  v.condition.steering = clamp(
    v.condition.steering - WEAR.steeringPerKm * inp.km * mul * age * (1 + inp.rough * WEAR.roughSurfaceMul),
    0, 1,
  );
  v.condition.brakes = clamp(
    v.condition.brakes - (WEAR.brakesPerKm * inp.km + WEAR.brakesPerBrake * inp.brakeEnergy) * mul,
    0, 1,
  );
  v.dirt = clamp(v.dirt + inp.km * (0.002 + inp.rough * 0.01), 0, 1);
  v.odometerKm += inp.km;
  warnCrossings(s, before, v);
}

function warnCrossings(s: GameState, before: Record<string, number>, v: VehicleState) {
  const names: Record<string, string> = { engine: 'Engine', steering: 'Steering & suspension', brakes: 'Brakes' };
  for (const k of ['engine', 'steering', 'brakes'] as const) {
    for (const th of [0.5, 0.35, 0.2]) {
      if (before[k] >= th && v.condition[k] < th) {
        note(s, `${names[k]} condition is down to ${Math.round(v.condition[k] * 100)}%. ${th <= 0.2 ? 'Get it serviced soon.' : 'You can feel it.'}`, th <= 0.35 ? 'bad' : 'warn');
      }
    }
  }
}

export function applyImpact(s: GameState, v: VehicleState, speed: number): void {
  if (speed < 2) return;
  v.body = clamp(v.body - (speed - 2) * WEAR.bodyPerImpact, 0, 1);
  if (speed > 6) v.condition.steering = clamp(v.condition.steering - (speed - 6) * 0.004, 0, 1);
  addMood(s, 'bump', 'Scraped the RV', -3, 2);
}

export function dailyApplianceWear(s: GameState, vid: string): void {
  const mul = difficulty(s).wearMul;
  for (const it of installedItems(s, vid)) {
    const c = defOf(it).category;
    if (c === 'appliance' || c === 'system') it.condition = clamp(it.condition - WEAR.appliancesPerDay * mul, 0, 1);
  }
}

// ── repairs ──

export type RepairTarget = ComponentId | 'body';

export function componentValue(s: GameState, v: VehicleState, comp: RepairTarget): number {
  if (comp === 'appliances') return appliancesCondition(s, v.id);
  if (comp === 'body') return v.body;
  return v.condition[comp];
}

export interface RepairQuote {
  comp: RepairTarget;
  from: number;
  to: number;
  cost: number;
  minutes: number;
  available: boolean;
}

export function repairQuote(s: GameState, vid: string, mechanicId: string, comp: RepairTarget): RepairQuote {
  const v = vehicleById(s, vid);
  const m = MECHANICS[mechanicId];
  const cap = m.repairs[comp];
  const from = componentValue(s, v, comp);
  if (cap == null) return { comp, from, to: from, cost: 0, minutes: 0, available: false };
  const to = Math.max(from, cap);
  const pct = Math.max(0, (to - from) * 100);
  const sizeMul = v.def === 'classc' ? 1.45 : 1;
  const cost = Math.round(price(s, pct * (m.rate[comp] ?? 5) * sizeMul) / 5) * 5;
  return { comp, from, to, cost, minutes: Math.round(30 + pct * m.minutesPerPct), available: pct >= 1 };
}

export function applyRepair(s: GameState, v: VehicleState, comp: RepairTarget, to: number): void {
  if (comp === 'body') {
    v.body = Math.max(v.body, to);
    v.dirt = 0;
  } else if (comp === 'appliances') {
    for (const it of installedItems(s, v.id)) {
      const c = defOf(it).category;
      if (c === 'appliance' || c === 'system') it.condition = Math.max(it.condition, to);
    }
  } else v.condition[comp] = Math.max(v.condition[comp], to);
}

export interface RepairResult {
  minutes: number;
  cost: number;
}

/** Pay a mechanic for the chosen components. The caller advances time by `minutes`. */
export function payRepair(s: GameState, vid: string, mechanicId: string, comps: RepairTarget[]): Result<RepairResult> {
  const v = vehicleById(s, vid);
  const quotes = comps.map((c) => repairQuote(s, vid, mechanicId, c)).filter((q) => q.available);
  if (!quotes.length) return fail('Nothing to repair.');
  const cost = quotes.reduce((a, q) => a + q.cost, 0);
  const minutes = quotes.reduce((a, q) => a + q.minutes, 0);
  const paid = charge(s, cost, 'repairs', `${MECHANICS[mechanicId].name}: ${quotes.map((q) => q.comp).join(', ')}`);
  if (!paid.ok) return paid;
  for (const q of quotes) applyRepair(s, v, q.comp, q.to);
  note(s, `Repairs done for ${money(cost)}. The RV feels much better.`, 'good');
  return ok({ minutes, cost });
}

export const DIY_MINUTES = 90;

export function diyCheck(s: GameState, vid: string, partUid: string): Result {
  const part = s.items[partUid];
  if (!part) return fail('Part not found.');
  const spec = defOf(part).features?.part;
  if (!spec) return fail('That is not a repair part.');
  if (!hasTool(s, vid, 'toolkit')) return fail('You need a basic tool kit in the RV to do this yourself.');
  const v = vehicleById(s, vid);
  const cur = componentValue(s, v, spec.component);
  if (cur >= spec.cap - 0.005) return fail(`DIY can only bring ${spec.component} to ${Math.round(spec.cap * 100)}%. Visit a professional for more.`);
  if (s.player.needs.energy < 15) return fail('You are too tired to work on the RV.');
  return ok();
}

/** Do a DIY job (the caller advances time by DIY_MINUTES as labor). */
export function diyRepair(s: GameState, vid: string, partUid: string): Result<{ from: number; to: number }> {
  const chk = diyCheck(s, vid, partUid);
  if (!chk.ok) return chk;
  const part = s.items[partUid];
  const spec = defOf(part).features!.part!;
  const v = vehicleById(s, vid);
  const from = componentValue(s, v, spec.component);
  const to = Math.min(spec.cap, from + spec.amount);
  applyRepair(s, v, spec.component, to);
  deleteItem(s, partUid);
  restore(s, 'hygiene', -12);
  addMood(s, 'diy', 'Fixed it myself', 5, 6);
  note(s, `${spec.component[0].toUpperCase() + spec.component.slice(1)} improved from ${Math.round(from * 100)}% to ${Math.round(to * 100)}%.`, 'good');
  return ok({ from, to });
}

export function partsInVehicle(s: GameState, vid: string) {
  return itemsInVehicle(s, vid).filter((i) => i.where.kind === 'stored' && defOf(i).features?.part);
}
