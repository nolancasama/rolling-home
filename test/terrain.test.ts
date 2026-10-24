import { describe, expect, it } from 'vitest';
import { LAKE, NODE_BY_ID, PLACES } from '../src/data/map';
import { EDGES, nearestRoad, routeTo } from '../src/world/roads';
import { buildHeights, groundAt, profileAt, roadProfile, terrainHeight } from '../src/world/terrain';

describe('terrain model', () => {
  it('builds the height grid in reasonable time', () => {
    const t0 = performance.now();
    buildHeights();
    const ms = performance.now() - t0;
    console.log(`height grid built in ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(15000);
  });

  it('places towns at sensible elevations', () => {
    const report: string[] = [];
    for (const p of PLACES) report.push(`${p.id}: ${terrainHeight(p.x, p.z).toFixed(1)}`);
    console.log(report.join('  '));
    const pl = PLACES.find((p) => p.id === 'pinelake')!;
    expect(terrainHeight(pl.x, pl.z)).toBeGreaterThan(LAKE.level + 0.5);
    expect(terrainHeight(LAKE.x, LAKE.z)).toBeLessThan(LAKE.level - 3);
  });

  it('keeps road grades within limits and joins nodes', () => {
    for (const e of EDGES) {
      const hs = roadProfile(e);
      const lim = e.def.kind === 'highway' ? 0.06 : e.def.kind === 'mountain' ? 0.085 : 0.1;
      let worst = 0;
      for (let i = 1; i < hs.length; i++) {
        const g = Math.abs(hs[i] - hs[i - 1]) / Math.max(0.01, e.cum[i] - e.cum[i - 1]);
        worst = Math.max(worst, g);
      }
      expect(worst, e.def.id).toBeLessThanOrEqual(lim + 0.02);
      const a = NODE_BY_ID[e.def.from];
      expect(Math.abs(e.xs[0] - a.x) + Math.abs(e.zs[0] - a.z)).toBeLessThan(0.01);
    }
  });

  it('reports the road surface on roads and terrain below it', () => {
    const e = EDGES.find((x) => x.def.id === 'hwy60_w')!;
    const mid = e.length / 2;
    const i = e.cum.findIndex((c) => c >= mid);
    const g = groundAt(e.xs[i], e.zs[i]);
    expect(g.road?.def.id).toBe('hwy60_w');
    expect(Math.abs(g.y - profileAt(e, e.cum[i]))).toBeLessThan(0.05);
    expect(terrainHeight(e.xs[i], e.zs[i])).toBeLessThan(g.y);
    const hit = nearestRoad(e.xs[i] + 0.5, e.zs[i], 10);
    expect(hit?.edge.def.id).toBe('hwy60_w');
  });

  it('routes between towns, respecting narrow tracks', () => {
    const dj = NODE_BY_ID.dj_c;
    const toPine = routeTo(dj.x, dj.z, 'pl_c', { vehicleWidth: 2.0 });
    const toMesa = routeTo(dj.x, dj.z, 'mc_c', { vehicleWidth: 2.4 });
    expect(toPine).not.toBeNull();
    expect(toMesa).not.toBeNull();
    console.log(`DJ→Pine Lake ${toPine!.km.toFixed(1)} km (${toPine!.worldLength.toFixed(0)} m world, ${toPine!.minutes.toFixed(0)} min)`);
    console.log(`DJ→Mesa City ${toMesa!.km.toFixed(1)} km (${toMesa!.worldLength.toFixed(0)} m world, ${toMesa!.minutes.toFixed(0)} min)`);
    const wide = routeTo(-300, -1030, 'pl_hid', { vehicleWidth: 2.4, revealed: { hidden_shore: true } });
    const narrow = routeTo(-300, -1030, 'pl_hid', { vehicleWidth: 2.0, revealed: { hidden_shore: true } });
    expect(narrow).not.toBeNull();
    expect(wide).toBeNull();
  });
});
