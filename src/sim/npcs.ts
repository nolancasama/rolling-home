import { NPCS, type NpcStop } from '../data/content';
import { charge, dayOf, journal, money, newItem, note, weekdayOf } from './core';
import { dist } from './geo';
import { acceptDirect } from './jobs';
import { bestCompartment, whyNoRoom } from './storage';
import type { DeliveryOffer, GameState, NpcState, OddOffer } from './types';
import { activeVehicle, vdef } from './vehicle';
import { deliveryPay, dockDistanceKm } from './jobs';

// Recurring travelers: deterministic weekly schedules and simple dialog.

export function npcStop(s: GameState, id: string): NpcStop | null {
  return NPCS[id].week[weekdayOf(s.time.minutes)];
}

export function npcState(s: GameState, id: string): NpcState {
  return (s.npcs[id] ??= { met: false, tips: 0, soldItem: false, jobWeek: -1 });
}

export interface DialogOption {
  id: string;
  label: string;
}

export interface Dialog {
  npc: string;
  name: string;
  lines: string[];
  options: DialogOption[];
}

const TIPS: Record<string, string[]> = {
  marge: [
    'Water weighs a kilo a liter, honey. Fill up near where you plan to camp, not three towns early.',
    'There is an old logging track off Lakeview Road in Pine Lake. Leads to a free spot right on the water, but nothing wider than a van gets through.',
    'Black tank first, then gray. The gray rinses the hose. You only make that mistake once!',
    'The Mesa Vista resort has free hot showers for guests. Worth it after a few days off-grid.',
    'Friday nights there is a campfire at Pine Lake Campground. Come say hi to Biscuit.',
  ],
  dex: [
    'Signal is everything for remote work. Mesa City has the best. A cell booster saved my career.',
    'Red Rock Flats gets full sun all day. Free camping and my panels love it.',
    'There is a weird little shop on Highway 60, a giant snake out front. Rick sells used solar cheap.',
    'Lithium batteries weigh half as much as the old lead ones. Your axles will thank you.',
  ],
  hank: [
    'Know your axle weights. Heavy stuff goes between the axles, not hanging off the back.',
    'Coyote Flats has the cheapest fuel between here and the state line.',
    'Overloaded rigs brake like a shopping cart on ice. Do not be that guy.',
    'Drive easy on the mountain road. Engines and brakes wear out fast hauling uphill and riding the pedal down.',
  ],
};

function revealFromTip(s: GameState, id: string, tipIndex: number): string | null {
  if (id === 'marge' && tipIndex === 1 && !s.revealed.hidden_shore) {
    s.revealed.hidden_shore = true;
    return 'Hidden Lakeshore marked on your map.';
  }
  if (id === 'dex' && tipIndex === 2 && !s.revealed.rattlesnake) {
    s.revealed.rattlesnake = true;
    return "Rattlesnake Rick's marked on your map.";
  }
  return null;
}

export function npcDialog(s: GameState, id: string): Dialog {
  const n = NPCS[id];
  const st = npcState(s, id);
  const lines: string[] = [];
  if (!st.met) lines.push(`${n.intro}`, greeting(id));
  else lines.push(again(id));
  const options: DialogOption[] = [{ id: 'tip', label: 'Any advice for the road?' }];
  const week = Math.floor((dayOf(s.time.minutes) - 1) / 7);
  if (id === 'marge' && !st.soldItem) options.push({ id: 'sell', label: 'Selling anything?' });
  if ((id === 'dex' || id === 'hank') && st.jobWeek !== week) options.push({ id: 'job', label: 'Need a hand with anything?' });
  options.push({ id: 'bye', label: 'See you down the road.' });
  return { npc: id, name: n.name, lines, options };
}

function greeting(id: string): string {
  if (id === 'marge') return '"Well hello! New to the road? Biscuit approves of you already."';
  if (id === 'dex') return '"Hey! Nice rig. You working on the road too, or just wandering?"';
  return '"Howdy. That your camper? Hope you checked your weight before climbing Route 89."';
}

function again(id: string): string {
  if (id === 'marge') return '"There you are again! Biscuit, look who it is."';
  if (id === 'dex') return '"Yo! Good to see you. Find any good sunsets?"';
  return '"Back again. The road is a small world."';
}

export interface ChoiceResult {
  lines: string[];
  close?: boolean;
}

export function npcChoose(s: GameState, id: string, option: string): ChoiceResult {
  const st = npcState(s, id);
  st.met = true;
  const week = Math.floor((dayOf(s.time.minutes) - 1) / 7);
  if (option === 'bye') return { lines: ['"Safe travels!"'], close: true };
  if (option === 'tip') {
    const list = TIPS[id];
    const i = st.tips % list.length;
    st.tips++;
    const reveal = revealFromTip(s, id, i);
    journal(s, 'tip', `${NPCS[id].name}: ${list[i]}`);
    const out = [`"${list[i]}"`];
    if (reveal) {
      out.push(reveal);
      note(s, reveal, 'discovery');
    }
    return { lines: out };
  }
  if (option === 'sell' && id === 'marge') {
    if (st.soldItem) return { lines: ['"That was my only spare, sorry!"'] };
    const cost = 320;
    const v = activeVehicle(s);
    const inst = newItem(s, 'lithium_battery', { kind: 'carried' }, { condition: 0.88 });
    const comp = bestCompartment(s, v.id, inst);
    if (!comp) {
      delete s.items[inst.uid];
      return { lines: [`"I have a spare lithium battery, ${money(cost)}. But where would you even put it?" (${whyNoRoom(s, v.id, inst)})`] };
    }
    const paid = charge(s, cost, 'equipment', 'Used lithium battery (from Marge)');
    if (!paid.ok) {
      delete s.items[inst.uid];
      return { lines: [`"A spare lithium battery, ${money(cost)}. Half price! Come back when you have the cash."`] };
    }
    inst.where = { kind: 'stored', vehicle: v.id, comp };
    st.soldItem = true;
    note(s, 'Bought a used lithium battery. Install it in furnishing mode (Systems tab).', 'money');
    return { lines: [`"Sold! ${money(cost)}, and it is still got lots of life in it. Install it in your battery bay."`] };
  }
  if (option === 'job' && id === 'dex') {
    if (st.jobWeek === week) return { lines: ['"All good for now, thanks!"'] };
    const stop = npcStop(s, id);
    if (!stop) return { lines: ['"I am about to hit the road."'] };
    const pts: [number, number][] = [
      [stop.x + Math.cos(stop.heading) * 2.2, stop.z - Math.sin(stop.heading) * 2.2],
      [stop.x + Math.sin(stop.heading) * 3.2, stop.z + Math.cos(stop.heading) * 3.2],
      [stop.x - Math.cos(stop.heading) * 2.2, stop.z + Math.sin(stop.heading) * 2.2],
    ];
    const offer: OddOffer = {
      id: `dex_${week}`, kind: 'odd', board: 'npc', title: "Help Dex fix his solar wiring",
      description: 'Check three connections around Dex’s van.', odd: 'dex_solar', pay: 50, postedDay: dayOf(s.time.minutes),
      npc: 'dex', points: pts,
    };
    const r = acceptDirect(s, offer);
    if (!r.ok) return { lines: [`"Ah, looks like you have your hands full." (${r.reason})`] };
    st.jobWeek = week;
    return { lines: ['"Would you? My panels keep cutting out. Check the three connectors marked around the van. Fifty bucks?"'] };
  }
  if (option === 'job' && id === 'hank') {
    if (st.jobWeek === week) return { lines: ['"Nothing this week, friend."'] };
    const crates = [0, 1, 2].map(() => ({ name: 'Diesel engine parts', dims: [0.5, 0.4, 0.35] as [number, number, number], mass: 46 }));
    const km = dockDistanceKm('ts_dock', 'mc_dock');
    const offer: DeliveryOffer = {
      id: `hank_${week}`, kind: 'delivery', board: 'npc', title: "Hank's overflow load to Mesa City", client: 'Hank',
      description: 'Three crates of engine parts that did not fit on Hank’s rig. Pick up at the Coyote Flats receiving door.',
      pickup: 'ts_dock', dropoff: 'mc_dock', crates, distanceKm: km, pay: Math.max(240, deliveryPay(s, km, crates, 1.6)),
      deadlineMin: s.time.minutes + 30 * 60, postedDay: dayOf(s.time.minutes), special: 'hank',
    };
    const r = acceptDirect(s, offer);
    if (!r.ok) return { lines: [`"Looks like you are booked up." (${r.reason})`] };
    st.jobWeek = week;
    const v = activeVehicle(s);
    const heavy = vdef(v).id === 'van' ? ' Watch your rear axle in that van.' : '';
    return { lines: [`"Pays good. 138 kilos, keep it between the axles.${heavy}"`] };
  }
  return { lines: ['"Hm?"'] };
}

export function npcsNear(s: GameState, x: number, z: number, r: number): string[] {
  const out: string[] = [];
  for (const id in NPCS) {
    const stop = npcStop(s, id);
    if (stop && dist(x, z, stop.x, stop.z) < r) out.push(id);
  }
  return out;
}
