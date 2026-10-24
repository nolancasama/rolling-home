import { DISCOVERIES, PLACES, type DiscoveryDef } from '../data/map';
import { journal, note } from './core';
import { dist } from './geo';
import { addMood } from './needs';
import { complete } from './objectives';
import type { GameState } from './types';

// Discoveries are found by being there (on foot or by RV).

export function checkDiscoveries(s: GameState, x: number, z: number): DiscoveryDef[] {
  const found: DiscoveryDef[] = [];
  for (const d of DISCOVERIES) {
    if (s.discovered[d.id] != null) continue;
    if (dist(x, z, d.x, d.z) > d.radius) continue;
    s.discovered[d.id] = s.time.minutes;
    s.revealed[d.id] = true;
    addMood(s, `disc_${d.id}`, `Discovered ${d.name}`, d.mood, 8);
    journal(s, 'discovery', `${d.name}: ${d.text}`);
    note(s, `Discovered: ${d.name}`, 'discovery');
    s.stats.today.discoveries.push(d.name);
    found.push(d);
  }
  return found;
}

/** Track first visits to places (objective "Drive to a new place"). */
export function checkVisit(s: GameState, x: number, z: number, start = 'dusty'): string | null {
  for (const p of PLACES) {
    if (p.kind === 'overlook' || p.kind === 'poi') continue;
    if (dist(x, z, p.x, p.z) > p.radius * 0.8) continue;
    const key = `visited:${p.id}`;
    if (s.flags[key]) return null;
    s.flags[key] = true;
    if (p.id !== start) {
      complete(s, 'travel');
      if (!s.revealed[p.id]) s.revealed[p.id] = true;
      journal(s, 'event', `Arrived at ${p.name} for the first time.`);
    }
    return p.id;
  }
  return null;
}
