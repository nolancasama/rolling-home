import { describe, expect, it } from 'vitest';
import { POWER } from '../src/data/config';
import { REMOTE_GIGS } from '../src/data/content';
import type { VehicleId, WindowTreatment } from '../src/data/types';
import { packUp, pretrip } from '../src/sim/camping';
import { bill, charge, newItem } from '../src/sim/core';
import { setItemState } from '../src/sim/furnish';
import { cook, microwaveCheck, prepareSleep, setCovering, sleepPlan } from '../src/sim/living';
import { newGame } from '../src/sim/newgame';
import { Sim } from '../src/sim/sim';
import { fixtureLit, fixtureLoad, powerStatus, setAllLights, setLight } from '../src/sim/utilities';
import { activeVehicle, capacities, defOf, vdef } from '../src/sim/vehicle';

const LOOK = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };
function game(vehicle: VehicleId = 'van') {
  return newGame({ name: 'Designer', look: LOOK, vehicle, difficulty: 'balanced', seed: 27 });
}
function treatment(type: WindowTreatment['type'], mat = 'win_blackout'): WindowTreatment {
  return { type, fabric: { mat }, hardware: 'black', mount: 'inside', open: 1 };
}

describe('Design Mode fixture power', () => {
  it('shares exact auto boundaries, occupancy, sleeping and explicit modes', () => {
    for (const hour of [0, 6.49, 18.5, 23]) expect(fixtureLit(undefined, { hour, occupied: true })).toBe(true);
    for (const hour of [6.5, 12, 18.49]) expect(fixtureLit(undefined, { hour, occupied: true })).toBe(false);
    expect(fixtureLit(undefined, { hour: 20, occupied: false })).toBe(false);
    expect(fixtureLit(undefined, { hour: 20, occupied: true, sleeping: true })).toBe(false);
    expect(fixtureLit({ mode: 'on' }, { hour: 12, sleeping: true })).toBe(true);
    expect(fixtureLit({ mode: 'off' }, { hour: 20, occupied: true })).toBe(false);
    expect(fixtureLit(undefined, { hour: 20, exterior: true, awning: true })).toBe(true);
    expect(fixtureLit(undefined, { hour: 20, exterior: true, awning: false })).toBe(false);
  });

  it.each([['van', 10], ['classc', 15]] as const)('%s keeps its factory night lighting load at %i W', (vid, watts) => {
    const s = game(vid), v = activeVehicle(s);
    s.time.minutes = 20 * 60;
    expect(fixtureLoad(s, v, { occupied: true })).toBe(watts);
    const occupied = powerStatus(s, v, { occupied: true });
    const away = powerStatus(s, v, { occupied: false });
    expect(occupied.loadW - away.loadW).toBeCloseTo(watts);
    setAllLights(s, v.id, 'on');
    expect(fixtureLoad(s, v, { occupied: false, sleeping: true })).toBe(watts);
    setAllLights(s, v.id, 'off');
    expect(fixtureLoad(s, v, { occupied: true })).toBe(0);
  });

  it('resolved strip length, dimming and light settings determine draw', () => {
    const s = game(), v = activeVehicle(s);
    s.items = {};
    const strip = newItem(s, 'light_undercab', { kind: 'floor', vehicle: v.id, x: 0, z: -1, rot: 0 }, { config: { length: 1.2 } });
    expect(setLight(s, v.id, strip.uid, { mode: 'on', dim: 0.5, kelvin: 10000 }).ok).toBe(true);
    expect(strip.light?.kelvin).toBe(6000);
    expect(fixtureLoad(s, v)).toBeCloseTo(4 * 1.2 * 0.5);
    expect(setLight(s, v.id, strip.uid, { dim: Number.NaN }).ok).toBe(false);
  });

  it('120 V fridges require AC supply or a sufficient inverter', () => {
    const s = game('classc'), v = activeVehicle(s);
    s.items = {};
    newItem(s, 'fridge_residential', { kind: 'floor', vehicle: v.id, x: 0, z: -1, rot: 0 });
    v.batteryWh = 500;
    expect(powerStatus(s, v).fridgeOn).toBe(false);
    newItem(s, 'inverter_1000', { kind: 'slot', vehicle: v.id, slot: 'electronics' });
    expect(powerStatus(s, v).fridgeOn).toBe(true);
    expect(powerStatus(s, v).loadW).toBeCloseTo(POWER.parasiticW + 75 / 0.88 + 6);
    v.batteryWh = 0;
    expect(powerStatus(s, v).fridgeOn).toBe(false);
    v.hookups.power = true;
    expect(powerStatus(s, v).fridgeOn).toBe(true);
    expect(powerStatus(s, v).loadW).toBe(0);
  });

  it('charger and MPPT upgrades replace the base rates', () => {
    const s = game(), v = activeVehicle(s);
    s.time.minutes = 12 * 60;
    newItem(s, 'solar_200', { kind: 'slot', vehicle: v.id, slot: 'roof' });
    const before = powerStatus(s, v).solarW;
    expect(before).toBeGreaterThan(0);
    newItem(s, 'mppt', { kind: 'slot', vehicle: v.id, slot: 'electronics' });
    expect(powerStatus(s, v).solarW).toBeCloseTo(before * 0.92 / POWER.solarEfficiency);
    newItem(s, 'inverter_charger', { kind: 'slot', vehicle: v.id, slot: 'electronics' });
    v.hookups.power = true;
    const ps = powerStatus(s, v);
    expect(ps.chargeW - ps.solarW).toBe(1400);
    expect(capacities(s, v.id).inverterW).toBe(3000);
  });
});

describe('Design Mode living and Creative rules', () => {
  it('microwave meals use six minutes and 100 Wh without stove fuel', () => {
    const s = game(), v = activeVehicle(s);
    newItem(s, 'microwave', { kind: 'floor', vehicle: v.id, x: 0, z: -1, rot: 0, y: 1.35 });
    expect(microwaveCheck(s).ok).toBe(false);
    newItem(s, 'inverter_1000', { kind: 'slot', vehicle: v.id, slot: 'electronics' });
    v.batteryWh = 119;
    expect(microwaveCheck(s).ok).toBe(false);
    v.batteryWh = 300;
    const meal = newItem(s, 'pasta_kit', { kind: 'stored', vehicle: v.id, comp: 'floor' });
    const propane = v.propane;
    const canisters = Object.values(s.items).filter(i => defOf(i).features?.butane).map(i => i.uses);
    expect(cook(s, meal.uid, 'microwave')).toEqual({ ok: true, minutes: 6 });
    expect(v.batteryWh).toBeCloseTo(200 - 3 * POWER.pumpWhPerL);
    expect(v.propane).toBe(propane);
    expect(Object.values(s.items).filter(i => defOf(i).features?.butane).map(i => i.uses)).toEqual(canisters);
    v.hookups.power = true;
    const next = newItem(s, 'pasta_kit', { kind: 'stored', vehicle: v.id, comp: 'floor' });
    v.hookups.water = true;
    const wh = v.batteryWh;
    expect(cook(s, next.uid, 'microwave').ok).toBe(true);
    expect(v.batteryWh).toBe(wh);
  });

  it('sleep closes coverings to night layers and rewards blackout without changing naps', () => {
    const s = game(), v = activeVehicle(s);
    const windows = vdef(v).interior.windows.filter(w => !w.door);
    for (const w of windows) v.custom.windows[w.id] = treatment('none');
    const thin = sleepPlan(s, false), nap = sleepPlan(s, true);
    for (const w of windows) v.custom.windows[w.id] = { ...treatment('day_night', 'win_sheer'), fabric2: { mat: 'win_blackout' }, layer: 'day' };
    expect(sleepPlan(s, false).quality / thin.quality).toBeCloseTo(1.06 / 0.97);
    expect(sleepPlan(s, true).quality).toBe(nap.quality);
    expect(prepareSleep(s, true).ok).toBe(true);
    expect(v.custom.windows[windows[0].id].open).toBe(1);
    expect(prepareSleep(s, false).ok).toBe(true);
    for (const w of windows) expect(v.custom.windows[w.id]).toMatchObject({ open: 0, layer: 'night' });
    expect(setCovering(s, v.id, windows[0].id, 1.5, 'day').ok).toBe(true);
    expect(v.custom.windows[windows[0].id].open).toBe(1);
    expect(setCovering(s, v.id, 'missing', 0).ok).toBe(false);
  });

  it('Creative chosen charges and recurring bills do not alter cash or transactions', () => {
    const s = game();
    s.gameType = 'creative';
    s.cash = 0;
    const tx = s.tx.length, spent = s.stats.today.spent;
    expect(charge(s, 100000, 'equipment', 'Creative supplies').ok).toBe(true);
    bill(s, 100, 'recurring', 'Creative bill');
    expect(s.cash).toBe(0);
    expect(s.tx.length).toBe(tx);
    expect(s.stats.today.spent).toBe(spent);
    s.gameType = 'life';
    expect(charge(s, 1, 'equipment', 'Life supply').ok).toBe(false);
  });

  it('nontravel furniture states appear in pre-trip and pack-up stows them', () => {
    const s = game(), v = activeVehicle(s);
    s.items = {};
    const table = newItem(s, 'folding_table', { kind: 'floor', vehicle: v.id, x: 0, z: -1, rot: 0 });
    expect(setItemState(s, v.id, table.uid, 'open').ok).toBe(true);
    expect(pretrip(s).issues.find(i => i.id === `stow:${table.uid}`)).toMatchObject({ minutes: 1, fixable: true });
    expect(packUp(s).minutes).toBe(1);
    expect(table.state).toBe('folded');
    expect(pretrip(s).issues.some(i => i.id.startsWith('stow:'))).toBe(false);
  });

  it('pack-up restores the mounting edge of an unfolded wall table', () => {
    const s = game(), v = activeVehicle(s);
    s.items = {};
    const table = newItem(s, 'folding_table', { kind: 'floor', vehicle: v.id, x: -0.89, z: -1, rot: 1 });
    expect(setItemState(s, v.id, table.uid, 'open').ok).toBe(true);
    expect(table.where).toMatchObject({ x: -0.64 });
    expect(packUp(s).left).toEqual([]);
    expect(table.where).toMatchObject({ x: -0.89 });
    expect(table.state).toBe('folded');
  });

  it('sleep refuses a blocked convertible bed without advancing or closing coverings', () => {
    const s = game(), v = activeVehicle(s);
    s.items = {};
    const sofa = newItem(s, 'sofa_jackknife', { kind: 'floor', vehicle: v.id, x: 0, z: -1, rot: 0 });
    newItem(s, 'plant', { kind: 'floor', vehicle: v.id, x: 0, z: -0.45, rot: 0 });
    const sim = new Sim(s), before = s.time.minutes;
    const coverings = JSON.stringify(v.custom.windows);
    const result = sim.sleep(false);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/hit|overlap/i);
    expect(s.time.minutes).toBe(before);
    expect(sofa.state).toBeUndefined();
    expect(JSON.stringify(v.custom.windows)).toBe(coverings);
    sim.dispose();
  });

  it('a clear convertible bed deploys before sleeping and becomes a pre-trip stow issue', () => {
    const s = game(), v = activeVehicle(s);
    s.items = {};
    const sofa = newItem(s, 'sofa_jackknife', { kind: 'floor', vehicle: v.id, x: 0, z: -1, rot: 0 });
    expect(capacities(s, v.id).bestBed.uid).toBe(sofa.uid);
    expect(prepareSleep(s, false)).toEqual({ ok: true, minutes: 2 });
    expect(sofa.state).toBe('bed');
    expect(pretrip(s).issues.some(i => i.id === `stow:${sofa.uid}`)).toBe(true);
  });

  it('remote work unfolds the folding table and the facade charges a minute for the transition', () => {
    const s = game(), v = activeVehicle(s);
    const table = newItem(s, 'folding_table', { kind: 'floor', vehicle: v.id, x: 0, z: -1, rot: 0 });
    const sim = new Sim(s), before = s.time.minutes;
    const result = sim.remoteWork(REMOTE_GIGS[0].id, 0.5, true);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(table.state).toBe('open');
    expect(s.time.minutes - before).toBeCloseTo(31);
    sim.dispose();
  });
});
