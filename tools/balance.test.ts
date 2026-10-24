// 30-day economy report: a scripted player lives through 30 days in the pure
// simulation. Run explicitly (not part of `npm test`):
//   npx vitest run --config vitest.tools.config.ts
import { it } from 'vitest';
import { ANCHOR_BY_ID, PARKING, PLACES } from '../src/data/map';
import { BOARDS, DOCKS } from '../src/data/content';
import type { DifficultyId } from '../src/data/difficulty';
import type { VehicleId } from '../src/data/types';
import { newItem } from '../src/sim/core';
import { boardOffers, previewLoad } from '../src/sim/jobs';
import { edibleFoods, sleepPlan } from '../src/sim/living';
import { newGame } from '../src/sim/newgame';
import { placeAt } from '../src/sim/places';
import { Sim } from '../src/sim/sim';
import { canStoreIn, rankCompartments } from '../src/sim/storage';
import { weekNet } from '../src/sim/time';
import { moodFactors } from '../src/sim/needs';
import type { DeliveryOffer } from '../src/sim/types';
import { activeVehicle, capacities, defOf, overallCondition } from '../src/sim/vehicle';
import { EDGES } from '../src/world/roads';

const LOOK = { skin: '#e0b090', hair: '#3a2a1a', hairStyle: 0, shirt: '#3a7a9a', pants: '#2a2a3a' };
const TOWN_NODE: Record<string, string> = { dusty: 'dj_c', pinelake: 'pl_c', mesa: 'mc_c', coyote: 'ts' };
const TOWN_BOARD: Record<string, string> = { dusty: 'dj_board', pinelake: 'pl_board', mesa: 'mc_board' };
const GROCER: Record<string, string> = { dusty: 'dj_grocery', pinelake: 'pl_store', mesa: 'mc_grocers', coyote: 'ts_store' };
const FUEL: Record<string, string> = { dusty: 'dj_pump_a', pinelake: 'pl_pump', mesa: 'mc_pump_a', coyote: 'ts_pump_a' };
const DUMP: Record<string, string> = { dusty: 'dj_dump', mesa: 'mc_dump', coyote: 'ts_dump', pinelake: 'pl_cg_dump' };
const WATER: Record<string, string> = { dusty: 'dj_water', mesa: 'mc_water', coyote: 'ts_water' };

function parkAt(sim: Sim, anchorId: string) {
  const a = ANCHOR_BY_ID[anchorId];
  sim.v.pose = { x: a.x, z: a.z + 2, heading: 0 };
}

function townOf(sim: Sim): string {
  const p = placeAt(sim.v.pose.x, sim.v.pose.z);
  const id = p?.id ?? 'dusty';
  return ({ pl_camp: 'pinelake', mesa_resort: 'mesa' } as Record<string, string>)[id] ?? id;
}

function autoAssign(sim: Sim, offer: DeliveryOffer): string[] {
  const s = sim.s;
  const v = activeVehicle(s);
  const counter = s.uidCounter;
  const placed: string[] = [];
  const assign: string[] = [];
  for (const c of offer.crates) {
    const inst = newItem(s, 'cargo', { kind: 'carried' }, { cargo: { ...c, jobId: offer.id, damage: 0 } });
    const comp = rankCompartments(s, v.id, inst).find((cp) => canStoreIn(s, v.id, cp, inst).ok);
    assign.push(comp?.id ?? 'floor');
    if (comp) inst.where = { kind: 'stored', vehicle: v.id, comp: comp.id };
    placed.push(inst.uid);
  }
  for (const u of placed) delete s.items[u];
  s.uidCounter = counter;
  return assign;
}

function runLife(vehicle: VehicleId, difficulty: DifficultyId, remoteHours: number) {
  const sim = new Sim(newGame({ name: 'Bot', look: LOOK, vehicle, difficulty, seed: 99 }));
  const s = sim.s;
  for (const e of EDGES) s.explored[e.def.id] = true;
  const log: string[] = [];
  let deliveries = 0, failed = 0;
  for (let day = 1; day <= 30; day++) {
    const town = townOf(sim);
    // food
    if (edibleFoods(s).reduce((a, f) => a + (f.servings ?? 0), 0) < 8 && GROCER[town]) {
      for (const id of ['pasta_kit', 'canned_chili', 'snack_bars', 'pasta_kit']) sim.buy(GROCER[town], id, { confirmOverweight: false });
      const cans = Object.values(s.items).filter((i) => i.def === 'butane').length;
      if (vehicle === 'van' && cans < 2) sim.buy(GROCER[town], 'butane');
    }
    const eatSomething = () => {
      const food = edibleFoods(s).find((f) => !f.spoiled && defOf(f).food!.kind === 'cook');
      if (food && sim.cook(food.uid).ok) return;
      const any = edibleFoods(s).find((f) => !f.spoiled);
      if (any) sim.eat(any.uid);
      else if (townOf(sim) === 'dusty') sim.diner('dj_diner_door');
    };
    eatSomething();
    // work: best delivery from this town's board
    const boardId = TOWN_BOARD[town];
    if (boardId) {
      const offers = boardOffers(s, boardId).filter((o): o is DeliveryOffer => o.kind === 'delivery').sort((a, b) => b.pay - a.pay);
      for (const o of offers) {
        sim.accept(o.id, boardId);
        parkAt(sim, DOCKS[o.pickup].anchor);
        const assign = autoAssign(sim, o);
        if (!previewLoad(s, o.id, assign).ok) {
          sim.abandon(o.id);
          failed++;
          continue;
        }
        sim.loadCargo(o.id, assign);
        for (const it of Object.values(s.items)) if (it.cargo) it.secured = true;
        sim.packUp();
        const destPlace = DOCKS[o.dropoff].place;
        const r = sim.assistedTravel(TOWN_NODE[destPlace]);
        if (!r.ok) {
          log.push(`day ${day}: travel failed: ${r.reason}`);
          sim.abandon(o.id);
          break;
        }
        parkAt(sim, DOCKS[o.dropoff].anchor);
        const d = sim.deliver(o.id);
        if (d.ok) deliveries++;
        break;
      }
    }
    // remote work in town
    if (remoteHours > 0) sim.remoteWork('support_chat', remoteHours, true);
    eatSomething();
    // services
    const here = townOf(sim);
    const c = capacities(s, sim.v.id);
    if (sim.v.fuel < c.fuel * 0.45 && FUEL[here]) {
      parkAt(sim, FUEL[here]);
      sim.refuel(FUEL[here], c.fuel);
    }
    if ((sim.v.gray > c.gray * 0.6 || sim.v.black > c.black * 0.6) && DUMP[here]) {
      parkAt(sim, DUMP[here]);
      sim.dump(DUMP[here]);
    }
    if (sim.v.fresh < c.fresh * 0.4 && WATER[here]) {
      parkAt(sim, WATER[here]);
      sim.fillWater(WATER[here], c.fresh);
    }
    if (s.player.needs.hygiene < 45 && c.shower) sim.rvShower();
    else if (s.player.needs.hygiene < 45 && here === 'coyote') sim.paidShower('ts_shower');
    // overnight: a campground with hookups where possible
    const hook = () => {
      sim.connect('power');
      sim.connect('water');
      if (s.player.needs.hygiene < 60) sim.paidShower(here === 'mesa' ? 'mc_resort_shower' : 'pl_cg_shower');
      sim.relax(true);
    };
    if (here === 'pinelake') {
      const site = ['P5', 'P6', 'P7', 'P8', 'P1', 'P2', 'P3', 'P4'].find((id) => sim.reserve('pine_cg', id, 1).ok);
      const st = site ? { P1: 116, P2: 116, P3: 116, P4: 116 }[site as 'P1'] ?? 144 : 0;
      if (site) {
        const z = { P1: -1192, P2: -1224, P3: -1256, P4: -1288, P5: -1192, P6: -1224, P7: -1256, P8: -1288 }[site as 'P1'];
        sim.v.pose = { x: st, z, heading: st === 116 ? -Math.PI / 2 : Math.PI / 2 };
        hook();
      }
    } else if (here === 'mesa' && s.cash > 300) {
      const r = sim.reserve('mesa_resort', 'M1', 1);
      if (r.ok) {
        sim.v.pose = { x: 1205, z: 528, heading: Math.PI / 2 };
        hook();
      }
    } else {
      const lot = PARKING.find((p) => p.place === here && p.rv) ?? PARKING[0];
      sim.v.pose = { x: lot.x, z: lot.z, heading: 0 };
    }
    // sleep at ~22:00
    const h = (s.time.minutes % 1440) / 60;
    if (h < 22) sim.advance((22 - h) * 60, sim.ctxFor('idle'));
    void sleepPlan;
    sim.sleep(false);
    if (day % 5 === 0 || day === 1) log.push(`day ${day}: cash $${s.cash.toFixed(0)}, mood ${s.player.needs.mood.toFixed(0)}, cond ${(overallCondition(s, sim.v.id) * 100).toFixed(0)}%, deliveries ${deliveries}`);
  }
  const factors = moodFactors(s, { activity: 'idle', inVehicle: true }).map((f) => `${f.label} ${f.value.toFixed(1)}`).join(', ');
  log.push(`needs: hunger ${s.player.needs.hunger.toFixed(0)} energy ${s.player.needs.energy.toFixed(0)} hygiene ${s.player.needs.hygiene.toFixed(0)} · mood factors: ${factors}`);
  return {
    vehicle, difficulty, remoteHours, cash: s.cash, weekNet: weekNet(s), mood: s.player.needs.mood,
    condition: overallCondition(s, sim.v.id), deliveries, failed, goal: s.objectives.goalResult, log,
  };
}

it('30-day economy report', () => {
  const rows: string[] = [];
  for (const vehicle of ['van', 'classc'] as VehicleId[]) {
    for (const difficulty of ['relaxed', 'balanced', 'hard'] as DifficultyId[]) {
      for (const remote of [0, 3]) {
        const r = runLife(vehicle, difficulty, remote);
        rows.push(`${vehicle.padEnd(6)} ${difficulty.padEnd(8)} remote ${remote}h  cash $${r.cash.toFixed(0).padStart(6)}  week ${r.weekNet.toFixed(0).padStart(5)}  mood ${r.mood.toFixed(0).padStart(3)}  cond ${(r.condition * 100).toFixed(0)}%  deliveries ${r.deliveries}  skipped ${r.failed}  goal ${r.goal}`);
        if (difficulty === 'balanced' && remote === 3) rows.push(...r.log.slice(-2).map((l) => '      ' + l));
      }
    }
  }
  console.log('\n' + rows.join('\n'));
  void BOARDS;
  void PLACES;
}, 120000);
