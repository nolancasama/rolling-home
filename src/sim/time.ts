import { ECONOMY, TIME } from '../data/config';
import { checkoutTick } from './camping';
import { bill, dayOf, difficulty, hourOf, journal, money, note, weekdayOf } from './core';
import { deadlineTick } from './jobs';
import { dailyApplianceWear } from './maintenance';
import { decayNeeds, updateMood, type NeedsContext } from './needs';
import type { GameState } from './types';
import { utilitiesTick, type PowerContext } from './utilities';
import { activeVehicle, overallCondition, vdef } from './vehicle';

// The single time integrator. Everything that depends on time (needs, power,
// propane, spoilage, fees, deadlines, check-outs) advances here, so no time
// skip can avoid its costs.

export interface AdvanceCtx extends NeedsContext, PowerContext {}

export function advance(s: GameState, minutes: number, ctx: AdvanceCtx): void {
  if (!(minutes > 0)) return;
  let left = minutes;
  const v = activeVehicle(s);
  while (left > 1e-9) {
    const dt = Math.min(left, TIME.stepMinutes);
    const t0 = s.time.minutes;
    s.time.minutes = t0 + dt;
    decayNeeds(s, dt, ctx);
    utilitiesTick(s, v, dt, ctx);
    updateMood(s, dt, ctx);
    boundaries(s, t0, s.time.minutes);
    left -= dt;
  }
}

function crossed(t0: number, t1: number, minuteOfDay: number): boolean {
  const a = Math.floor((t0 - minuteOfDay) / 1440);
  const b = Math.floor((t1 - minuteOfDay) / 1440);
  return b > a;
}

function boundaries(s: GameState, t0: number, t1: number): void {
  if (crossed(t0, t1, 0)) newDay(s);
  if (crossed(t0, t1, TIME.checkoutHour * 60)) checkoutTick(s);
  if (s.jobs.active.length) deadlineTick(s);
  if (s.locker && s.locker.paidUntilMin <= t1) {
    const cost = ECONOMY.lockerWeekly * difficulty(s).recurringMul;
    bill(s, cost, 'recurring', 'Storage locker rent');
    s.locker.paidUntilMin += 7 * 1440;
    note(s, `Storage locker rent: -${money(cost)}`, 'money');
  }
  if (crossed(t0, t1, 18 * 60) && dayOf(t1) === 30 && s.objectives.goalResult === 'pending') evaluateGoal(s);
}

function newDay(s: GameState): void {
  const day = dayOf(s.time.minutes);
  const v = activeVehicle(s);
  dailyApplianceWear(s, v.id);
  if (weekdayOf(s.time.minutes) === 0 && day > 1) {
    const m = difficulty(s).recurringMul;
    const ins = vdef(v).weeklyCost * m;
    const phone = ECONOMY.phoneWeekly * m;
    bill(s, ins, 'recurring', `Insurance & registration (${vdef(v).shortName})`);
    bill(s, phone, 'recurring', 'Phone plan');
    note(s, `Weekly bills: insurance & registration ${money(ins)}, phone ${money(phone)}.`, 'money');
  }
}

export function weekNet(s: GameState, endMin = s.time.minutes): number {
  const start = endMin - 7 * 1440;
  return s.tx.filter((t) => t.t > start && t.t <= endMin).reduce((a, t) => a + t.amount, 0);
}

export function evaluateGoal(s: GameState): void {
  const d = difficulty(s);
  const v = activeVehicle(s);
  const checks = [
    s.cash >= d.goalCash,
    weekNet(s) >= 0,
    s.player.needs.mood >= 50,
    overallCondition(s, v.id) >= 0.5,
  ];
  const met = checks.every(Boolean);
  s.objectives.goalResult = met ? 'met' : 'missed';
  const text = met
    ? 'Day 30: you have built a sustainable life on the road. The journey continues, wherever you want it to go.'
    : 'Day 30: not quite sustainable yet, but the road goes on. Keep earning, keep exploring.';
  journal(s, 'goal', text);
  note(s, text, met ? 'good' : 'info');
  void hourOf;
}

export function goalChecks(s: GameState): { label: string; met: boolean }[] {
  const d = difficulty(s);
  const v = activeVehicle(s);
  return [
    { label: `Savings of ${money(d.goalCash)} (now ${money(s.cash)})`, met: s.cash >= d.goalCash },
    { label: `A positive 7-day balance (now ${money(weekNet(s))})`, met: weekNet(s) >= 0 },
    { label: `Mood 50+ (now ${Math.round(s.player.needs.mood)})`, met: s.player.needs.mood >= 50 },
    { label: `RV in decent shape: 50%+ (now ${Math.round(overallCondition(s, v.id) * 100)}%)`, met: overallCondition(s, v.id) >= 0.5 },
  ];
}
