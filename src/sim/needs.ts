import { NEEDS } from '../data/config';
import { clamp } from './geo';
import { difficulty, note } from './core';
import { sceneryAt } from './places';
import { looseUnsecured, storageSummary } from './storage';
import type { Activity, GameState } from './types';
import { activeVehicle, capacities, overallCondition, compartmentUse } from './vehicle';
import { computeWeight } from './weight';

// Sims-style needs. Hunger, energy and hygiene drain slowly; mood drifts
// toward a target built from needs, comfort, scenery and recent events.

export type NeedId = 'hunger' | 'energy' | 'hygiene';

export interface NeedsContext {
  activity: Activity;
  /** Sleep quality (0..1.3) when activity === 'sleep'. */
  sleepQuality?: number;
  inVehicle?: boolean;
  driving?: boolean;
}

export function decayNeeds(s: GameState, dtMin: number, ctx: NeedsContext): void {
  const n = s.player.needs;
  const h = dtMin / 60;
  const mul = difficulty(s).needsMul;
  const act = NEEDS.activity[ctx.activity] ?? NEEDS.activity.idle;
  const before = { ...n };
  n.hunger = clamp(n.hunger - (NEEDS.hungerPerHour + act.hunger) * mul * h, 0, 100);
  n.hygiene = clamp(n.hygiene - (NEEDS.hygienePerHour + act.hygiene) * mul * h, 0, 100);
  if (ctx.activity === 'sleep') {
    n.energy = clamp(n.energy + NEEDS.sleepPerHour * (ctx.sleepQuality ?? 0.7) * h, 0, 100);
  } else {
    let drain = (NEEDS.energyPerHour + act.energy) * mul;
    if (n.hunger < NEEDS.critical) drain *= 1.25;
    n.energy = clamp(n.energy - drain * h, 0, 100);
  }
  for (const k of ['hunger', 'energy', 'hygiene'] as NeedId[]) {
    if (before[k] >= NEEDS.low && n[k] < NEEDS.low) note(s, lowText(k), 'warn');
    else if (before[k] >= NEEDS.critical && n[k] < NEEDS.critical) note(s, criticalText(k), 'bad');
  }
}

function lowText(k: NeedId): string {
  return k === 'hunger' ? 'You are getting hungry.' : k === 'energy' ? 'You are getting tired.' : 'You could use a shower.';
}

function criticalText(k: NeedId): string {
  return k === 'hunger' ? 'You are starving. Eat something soon.' : k === 'energy' ? 'You are exhausted. Find somewhere to sleep.' : 'You really need a shower.';
}

export function restore(s: GameState, k: NeedId, amount: number): void {
  s.player.needs[k] = clamp(s.player.needs[k] + amount, 0, 100);
}

export function addMood(s: GameState, id: string, label: string, amount: number, hours: number): void {
  const mods = s.player.moodMods;
  const until = s.time.minutes + hours * 60;
  const ex = mods.find((m) => m.id === id);
  if (ex) {
    ex.amount = amount;
    ex.untilMin = until;
    ex.label = label;
  } else mods.push({ id, label, amount, untilMin: until });
}

export interface MoodFactor {
  label: string;
  value: number;
}

export function moodFactors(s: GameState, ctx: NeedsContext): MoodFactor[] {
  const f: MoodFactor[] = [];
  const n = s.player.needs;
  for (const k of ['hunger', 'energy', 'hygiene'] as NeedId[]) {
    if (n[k] < 50) f.push({ label: k === 'hunger' ? 'Hungry' : k === 'energy' ? 'Tired' : 'Grubby', value: -(50 - n[k]) * 0.35 });
  }
  if (n.hunger > 75 && n.energy > 75 && n.hygiene > 75) f.push({ label: 'Well looked after', value: 4 });
  const v = activeVehicle(s);
  const c = capacities(s, v.id);
  if (ctx.inVehicle) {
    const comfort = clamp((c.comfort - 3) * 1.4, -6, 12);
    if (Math.abs(comfort) >= 0.5) f.push({ label: comfort > 0 ? 'Cozy home' : 'Bare interior', value: comfort });
    const floor = compartmentUse(s, v.id, 'floor');
    const st = storageSummary(s, v.id);
    const crowd = (floor.liters > 250 ? -3 : 0) + (st.used / Math.max(1, st.liters) > 0.9 ? -3 : 0);
    if (crowd) f.push({ label: 'Cluttered', value: crowd });
  }
  if (!ctx.driving) {
    const scen = sceneryAt(s.player.mode === 'explore' ? s.player.pos.x : v.pose.x, s.player.mode === 'explore' ? s.player.pos.z : v.pose.z);
    if (scen >= 2) f.push({ label: 'Beautiful surroundings', value: (scen - 1) * 2.5 });
  }
  const cond = overallCondition(s, v.id);
  if (cond < 0.4) f.push({ label: 'Worried about the RV', value: -4 });
  if (v.dirt > 0.75) f.push({ label: 'Filthy RV', value: -2 });
  if (ctx.driving) {
    const w = computeWeight(s, v.id);
    if (w.status === 'over' || w.status === 'refuse') f.push({ label: 'Driving overloaded', value: -5 });
    if (looseUnsecured(s, v.id).length) f.push({ label: 'Things rattling around', value: -2 });
  }
  if (s.cash < 0) f.push({ label: 'In debt', value: -12 });
  else if (s.cash < 60) f.push({ label: 'Money worries', value: -6 });
  if (c.black > 0 && v.black >= c.black - 0.5) f.push({ label: 'Toilet tank full', value: -3 });
  if (v.gray >= c.gray - 0.5) f.push({ label: 'Gray tank full', value: -2 });
  if (v.batteryWh <= 1 && !v.hookups.power) f.push({ label: 'No power', value: -3 });
  for (const m of s.player.moodMods) f.push({ label: m.label, value: m.amount });
  return f;
}

export function moodTarget(s: GameState, ctx: NeedsContext): number {
  let t = 58;
  for (const f of moodFactors(s, ctx)) t += f.value;
  return clamp(t, 3, 100);
}

export function updateMood(s: GameState, dtMin: number, ctx: NeedsContext): void {
  const n = s.player.needs;
  const target = moodTarget(s, ctx);
  const step = (NEEDS.moodRate * dtMin) / 60;
  if (n.mood < target) n.mood = Math.min(target, n.mood + step);
  else n.mood = Math.max(target, n.mood - step);
  s.player.moodMods = s.player.moodMods.filter((m) => m.untilMin > s.time.minutes);
}

/** Work efficiency from energy and mood (remote work, odd jobs). */
export function workEfficiency(s: GameState): number {
  const n = s.player.needs;
  let e = 1;
  if (n.energy < 25) e *= 0.75;
  if (n.mood < 30) e *= 0.85;
  if (n.hunger < 15) e *= 0.85;
  return e;
}
