import { SIGNAL_BY_ROAD } from '../data/config';
import {
  ANCHORS, ANCHOR_BY_ID, CAMPGROUNDS, PARKING, PLACES, type AnchorDef, type AnchorKind, type CampgroundDef,
  type PlaceDef, type SiteDef,
} from '../data/map';
import { VEHICLES } from '../data/vehicles';
import { nearestRoad } from '../world/roads';
import { angleDiff, dist, worldToLocal } from './geo';
import type { GameState, VehicleState } from './types';

// Pure location queries against the map data.

export function placeAt(x: number, z: number): PlaceDef | null {
  let best: PlaceDef | null = null;
  for (const p of PLACES) {
    const d = dist(x, z, p.x, p.z);
    if (d <= p.radius && (!best || p.radius < best.radius)) best = p;
  }
  return best;
}

export function placeName(x: number, z: number): string {
  const p = placeAt(x, z);
  if (p) return p.name;
  const r = nearestRoad(x, z, 40);
  return r ? r.edge.def.name : 'Open country';
}

export function baseSignal(x: number, z: number): number {
  const p = placeAt(x, z);
  if (p) return p.signal;
  const r = nearestRoad(x, z, 80);
  return r ? SIGNAL_BY_ROAD[r.edge.def.kind] ?? 1 : 1;
}

export function signalAt(x: number, z: number, boosterBars: number): number {
  const b = baseSignal(x, z);
  if (b <= 0) return boosterBars > 0 ? 1 : 0;
  return Math.min(4, b + boosterBars);
}

export function sunAt(x: number, z: number): number {
  const p = placeAt(x, z);
  return p ? p.sun : 1;
}

export function sceneryAt(x: number, z: number): number {
  const p = placeAt(x, z);
  return p ? p.scenery : 1;
}

export function anchorsNear(x: number, z: number, r: number, kinds?: AnchorKind[]): AnchorDef[] {
  return ANCHORS.filter((a) => (!kinds || kinds.includes(a.kind)) && dist(x, z, a.x, a.z) <= r).sort(
    (a, b) => dist(x, z, a.x, a.z) - dist(x, z, b.x, b.z),
  );
}

/** Is the vehicle close enough to a vehicle-service anchor (fuel pump, dump, dock...)? */
export function vehicleAtAnchor(v: VehicleState, anchorId: string): boolean {
  const a = ANCHOR_BY_ID[anchorId];
  if (!a) return false;
  const len = VEHICLES[v.def].dims.length;
  return dist(v.pose.x, v.pose.z, a.x, a.z) <= (a.vehicleRadius ?? 10) + len / 2;
}

export function vehicleAnchors(v: VehicleState, kind: AnchorKind): AnchorDef[] {
  return ANCHORS.filter((a) => a.kind === kind && vehicleAtAnchor(v, a.id));
}

export interface SiteHit {
  camp: CampgroundDef;
  site: SiteDef;
  /** Vehicle fully inside the pad and aligned. */
  inside: boolean;
}

/** The campsite the vehicle is parked in (center inside the pad, roughly aligned). */
export function siteOfVehicle(v: VehicleState): SiteHit | null {
  const def = VEHICLES[v.def];
  for (const camp of CAMPGROUNDS) {
    for (const site of camp.sites) {
      if (Math.abs(v.pose.x - site.x) > 40 || Math.abs(v.pose.z - site.z) > 40) continue;
      const [lx, lz] = worldToLocal(v.pose.x, v.pose.z, site.x, site.z, site.heading);
      const tol = 1.2;
      if (Math.abs(lx) > site.width / 2 + tol || Math.abs(lz) > site.length / 2 + tol) continue;
      const a = Math.abs(angleDiff(v.pose.heading, site.heading));
      const aligned = a < 0.6 || a > Math.PI - 0.6;
      const fitsLen = Math.abs(lz) + def.dims.length / 2 <= site.length / 2 + 2.5;
      return { camp, site, inside: aligned && fitsLen };
    }
  }
  return null;
}

export function parkingAt(x: number, z: number) {
  for (const pk of PARKING) {
    const [lx, lz] = worldToLocal(x, z, pk.x, pk.z, pk.rot);
    if (Math.abs(lx) <= pk.w / 2 + 1 && Math.abs(lz) <= pk.l / 2 + 1) return pk;
  }
  return null;
}

export type StayKind = 'reserved' | 'free_site' | 'overnight_lot' | 'unpaid_site' | 'town' | 'wild';

export interface Stay {
  kind: StayKind;
  camp?: CampgroundDef;
  site?: SiteDef;
  label: string;
}

/** What kind of overnight stay the vehicle's current spot is. */
export function stayOf(s: GameState, v: VehicleState): Stay {
  const hit = siteOfVehicle(v);
  if (hit) {
    if (hit.camp.free) return { kind: 'free_site', camp: hit.camp, site: hit.site, label: hit.camp.name };
    const r = s.reservation;
    if (r && r.camp === hit.camp.id && r.site === hit.site.id) return { kind: 'reserved', camp: hit.camp, site: hit.site, label: `${hit.camp.name}, site ${hit.site.id}` };
    return { kind: 'unpaid_site', camp: hit.camp, site: hit.site, label: `${hit.camp.name} (unpaid)` };
  }
  const pk = parkingAt(v.pose.x, v.pose.z);
  if (pk?.overnight) {
    const camp = CAMPGROUNDS.find((c) => c.place === pk.place);
    return { kind: 'overnight_lot', camp, label: camp?.name ?? 'Overnight lot' };
  }
  const p = placeAt(v.pose.x, v.pose.z);
  if (p && p.kind === 'town') return { kind: 'town', label: `${p.name} (street parking)` };
  if (p && (p.kind === 'dispersed' || p.kind === 'hidden')) {
    const camp = CAMPGROUNDS.find((c) => c.place === p.id);
    return { kind: 'free_site', camp, label: p.name };
  }
  return { kind: 'wild', label: p ? p.name : 'Roadside' };
}
