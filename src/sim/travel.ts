import { PARKING, PLACES } from '../data/map';
import { routeTo, type Route } from '../world/roads';
import { fail, note, ok, type Result } from './core';
import { applyDrivingWear, fuelForKm, performance } from './maintenance';
import { pretrip } from './camping';
import { advance } from './time';
import type { GameState } from './types';
import { activeVehicle, vdef } from './vehicle';
import { computeWeight } from './weight';

// Assisted travel: skip a known route while paying exactly what the drive
// would cost in time, fuel, wear and needs.

export interface TravelPlan {
  ok: boolean;
  reason?: string;
  route: Route | null;
  km: number;
  minutes: number;
  fuel: number;
  unexplored: string[];
}

export function planRoute(s: GameState, destNode: string): Route | null {
  const v = activeVehicle(s);
  return routeTo(v.pose.x, v.pose.z, destNode, { vehicleWidth: vdef(v).dims.width, revealed: s.revealed });
}

export function fuelForRoute(s: GameState, route: Route): number {
  const v = activeVehicle(s);
  const perf = performance(s, v.id);
  let fuel = 0;
  for (const st of route.steps) {
    const len = Math.abs(st.to - st.from);
    fuel += fuelForKm(s, v.id, (len * st.edge.def.compression) / 1000, st.edge.def.speed, perf);
  }
  return fuel;
}

export function planAssisted(s: GameState, destNode: string): TravelPlan {
  const route = planRoute(s, destNode);
  if (!route) return { ok: false, reason: 'No road route for your vehicle to that destination.', route: null, km: 0, minutes: 0, fuel: 0, unexplored: [] };
  const fuel = fuelForRoute(s, route);
  const unexplored = route.majorEdges.filter((e) => !s.explored[e]);
  const base = { route, km: route.km, minutes: route.minutes, fuel, unexplored };
  const v = activeVehicle(s);
  if (!route.majorEdges.length) return { ...base, ok: false, reason: 'Assisted travel is for highway routes. This trip is short: just drive it.' };
  if (unexplored.length) return { ...base, ok: false, reason: 'Drive this route yourself once to unlock assisted travel on it.' };
  if (fuel > v.fuel - 2) return { ...base, ok: false, reason: `Not enough fuel: about ${fuel.toFixed(0)} L needed, ${v.fuel.toFixed(0)} L in the tank.` };
  if (computeWeight(s, v.id).status === 'refuse') return { ...base, ok: false, reason: 'Too overloaded to drive. Remove weight first.' };
  if (pretrip(s).issues.some((i) => i.fixable)) return { ...base, ok: false, reason: 'Pack up first (hookups, awning, loose items...).' };
  return { ...base, ok: true };
}

const ARRIVAL: Record<string, string> = {
  dj_c: 'dj_lot', pl_c: 'pl_lot', mc_c: 'mc_lot', ts: 'ts_lot', pl_cg: 'pl_cg_yard', mc_resort: 'mc_resort_pad',
};

export function runAssisted(s: GameState, destNode: string): Result<{ minutes: number; km: number; fuel: number }> {
  const plan = planAssisted(s, destNode);
  if (!plan.ok || !plan.route) return fail(plan.reason ?? 'Cannot travel.');
  const v = activeVehicle(s);
  const fuelBefore = v.fuel;
  let minutes = 0;
  v.engineOn = true;
  for (const st of plan.route.steps) {
    const len = Math.abs(st.to - st.from);
    const km = (len * st.edge.def.compression) / 1000;
    const speed = st.edge.def.speed;
    const stepMin = (km * 1000) / speed / 60;
    const perf = performance(s, v.id);
    v.fuel = Math.max(0, v.fuel - fuelForKm(s, v.id, km, speed, perf));
    const rough = st.edge.def.kind === 'dirt' || st.edge.def.kind === 'track' ? 0.6 : 0.05;
    applyDrivingWear(s, v, { km, rough, brakeEnergy: km * 40, harsh: 0.15 }, perf);
    s.stats.kmTotal += km;
    s.stats.today.km += km;
    advance(s, stepMin, { activity: 'drive', driving: true, inVehicle: true, occupied: true });
    minutes += stepMin;
  }
  v.engineOn = false;
  // Arrive at the destination's RV parking (or the road end).
  const lotId = ARRIVAL[destNode];
  const lot = lotId ? PARKING.find((p) => p.id === lotId) : undefined;
  const pts = plan.route.points;
  const [ex, ez] = pts[pts.length - 1];
  const [px, pz] = pts[Math.max(0, pts.length - 4)];
  if (lot) v.pose = { x: lot.x, z: lot.z, heading: lot.rot + Math.PI };
  else v.pose = { x: ex, z: ez, heading: Math.atan2(ex - px, ez - pz) };
  const place = PLACES.find((p) => p.node === destNode);
  note(s, `Arrived${place ? ` at ${place.name}` : ''} after ${Math.round(minutes)} minutes on the road.`, 'info');
  return ok({ minutes, km: plan.km, fuel: fuelBefore - v.fuel });
}
