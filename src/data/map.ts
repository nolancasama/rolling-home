// The fictional region: world meters, +X east, +Z south (north is -Z).
// Pure data shared by the 3D world, the GPS/router and the simulation.

export type Biome = 'desert' | 'forest' | 'mesa';
export type RoadKind = 'highway' | 'mountain' | 'street' | 'dirt' | 'track';

export interface NodeDef { id: string; x: number; z: number }

export interface RoadDef {
  id: string;
  name: string;
  kind: RoadKind;
  from: string;
  to: string;
  /** Interior control points (node positions are added automatically). */
  via: [number, number][];
  /** Paved/driven width in meters. */
  width: number;
  /** Fictional distance + game-time multiplier while driving this road. */
  compression: number;
  /** Typical speed (m/s) for traffic and ETAs. */
  speed: number;
  /** Vehicles wider than this cannot pass (narrow tracks). */
  maxWidth?: number;
  /** Hidden from the map until this discovery is made. */
  hiddenUntil?: string;
  /** Closed loop roads (from === to). */
  loop?: boolean;
}

export type PlaceKind = 'town' | 'campground' | 'truckstop' | 'dispersed' | 'overlook' | 'poi' | 'hidden';

export interface PlaceDef {
  id: string;
  name: string;
  kind: PlaceKind;
  x: number;
  z: number;
  /** Area radius used for "you are in ..." and signal. */
  radius: number;
  biome: Biome;
  /** Base cell-signal bars (0-4). */
  signal: number;
  /** Solar exposure 0..1 (forest shade). */
  sun: number;
  description: string;
  /** Hidden on the map until discovered. */
  hidden?: boolean;
  /** Flatten terrain within this radius to the ground height at the center. */
  flatten?: number;
  /** Mood bonus per hour while relaxing here (scenery). */
  scenery: number;
  /** Discovery granted when you arrive. */
  discovery?: string;
  /** Nearest road node for GPS routing. */
  node: string;
}

export type BuildingStyle =
  | 'shop' | 'grocery' | 'gas' | 'warehouse' | 'house' | 'diner' | 'motel' | 'office' | 'ranger' | 'lodge'
  | 'garage' | 'restroom' | 'kiosk' | 'dealer' | 'cafe' | 'church' | 'travel' | 'shack' | 'lockers' | 'canopy';

export interface BuildingDef {
  id: string;
  place: string;
  style: BuildingStyle;
  x: number;
  z: number;
  /** Facade width (local X) and depth (local Z) in meters. */
  w: number;
  d: number;
  h: number;
  /** Rotation (rad). Front (door side) faces local +Z → world (sin rot, cos rot). */
  rot: number;
  color: string;
  roof: string;
  sign?: string;
  /** Pure decoration: no door interaction. */
  decor?: boolean;
}

export type AnchorKind =
  | 'shop' | 'fuel' | 'dump' | 'water' | 'propane' | 'dock' | 'jobboard' | 'mechanic' | 'kiosk' | 'shower'
  | 'restroom' | 'locker' | 'dealer' | 'diner' | 'fishing' | 'canoe' | 'carwash' | 'viewpoint' | 'campfire'
  | 'info';

export interface AnchorDef {
  id: string;
  kind: AnchorKind;
  place: string;
  name: string;
  x: number;
  z: number;
  /** Shop/campground/etc. this anchor opens. */
  ref?: string;
  /** Price for the service (fuel $/L, propane $/kg, flat fee otherwise). */
  price?: number;
  /** How close the RV must be (m) for vehicle services (fuel, dump, water, dock). */
  vehicleRadius?: number;
}

export interface SiteDef {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Pad heading (rad): vehicle facing direction when parked nose-in. */
  heading: number;
  length: number;
  width: number;
  /** Longest vehicle allowed. */
  maxLength: number;
  power: 0 | 15 | 30 | 50;
  water: boolean;
  sewer: boolean;
  scenery: number;
  level: boolean;
  fireRing?: boolean;
  /** Pedestal location (power/water/sewer hookups). */
  pedestal?: { x: number; z: number };
}

export type CampKind = 'resort' | 'campground' | 'truckstop' | 'dispersed' | 'hidden';

export interface CampgroundDef {
  id: string;
  name: string;
  place: string;
  kind: CampKind;
  pricePerNight: number;
  showers: 'none' | 'paid' | 'free';
  showerPrice: number;
  dump: boolean;
  dumpPrice: number;
  /** 0 = unlimited */
  stayLimitNights: number;
  quietHours: boolean;
  noisy: boolean;
  amenities: string[];
  description: string;
  sites: SiteDef[];
  /** Free sites need no reservation: you just park and stay. */
  free: boolean;
}

export interface ParkingDef {
  id: string;
  place: string;
  x: number;
  z: number;
  w: number;
  l: number;
  rot: number;
  /** Overnight stays allowed (truck stops). */
  overnight: boolean;
  /** Number of marked bays along the length. */
  bays: number;
  rv?: boolean;
  surface: 'asphalt' | 'gravel' | 'concrete';
}

export interface DiscoveryDef {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  text: string;
  mood: number;
  kind: 'viewpoint' | 'site' | 'shop' | 'job' | 'event' | 'place';
}

// ───────────────────────── Road network ─────────────────────────

export const NODES: NodeDef[] = [
  // Dusty Junction
  { id: 'dj_c', x: -900, z: 700 },
  { id: 'dj_e', x: -735, z: 700 },
  { id: 'dj_w', x: -1065, z: 700 },
  { id: 'dj_n', x: -900, z: 565 },
  { id: 'dj_s', x: -900, z: 835 },
  // Highway 60
  { id: 'ts', x: 130, z: 928 },
  // Mesa City grid
  { id: 'mc_w', x: 965, z: 300 },
  { id: 'mc_nw', x: 1060, z: 210 }, { id: 'mc_n', x: 1150, z: 210 }, { id: 'mc_ne', x: 1240, z: 210 },
  { id: 'mc_cw', x: 1060, z: 300 }, { id: 'mc_c', x: 1150, z: 300 }, { id: 'mc_ce', x: 1240, z: 300 },
  { id: 'mc_sw', x: 1060, z: 390 }, { id: 'mc_s', x: 1150, z: 390 }, { id: 'mc_se', x: 1240, z: 390 },
  { id: 'mc_e', x: 1330, z: 300 },
  { id: 'mc_resort', x: 1182, z: 498 },
  // Pine Lake
  { id: 'pl_s', x: -430, z: -965 },
  { id: 'pl_c', x: -300, z: -1030 },
  { id: 'pl_e', x: -140, z: -1022 },
  { id: 'pl_cg', x: 52, z: -1118 },
  { id: 'pl_hid', x: -404, z: -1308 },
  // Red Rock Flats
  { id: 'rr', x: -1368, z: 528 },
];

export const ROADS: RoadDef[] = [
  // Dusty Junction streets
  { id: 'dj_main_e', name: 'Main Street', kind: 'street', from: 'dj_c', to: 'dj_e', via: [], width: 12, compression: 6, speed: 11 },
  { id: 'dj_main_w', name: 'Main Street', kind: 'street', from: 'dj_c', to: 'dj_w', via: [], width: 12, compression: 6, speed: 11 },
  { id: 'dj_north', name: 'North Avenue', kind: 'street', from: 'dj_c', to: 'dj_n', via: [], width: 11, compression: 6, speed: 11 },
  { id: 'dj_south', name: 'South Street', kind: 'street', from: 'dj_c', to: 'dj_s', via: [], width: 11, compression: 6, speed: 9 },

  // Highway 60: Dusty Junction → Coyote Flats → Mesa City
  {
    id: 'hwy60_w', name: 'Highway 60', kind: 'highway', from: 'dj_e', to: 'ts',
    via: [[-610, 712], [-470, 752], [-330, 808], [-190, 862], [-40, 908]],
    width: 10, compression: 26, speed: 25,
  },
  {
    id: 'hwy60_e', name: 'Highway 60', kind: 'highway', from: 'ts', to: 'mc_w',
    via: [[290, 918], [450, 862], [600, 770], [735, 640], [840, 500], [915, 375]],
    width: 10, compression: 26, speed: 25,
  },

  // Route 89: Dusty Junction up to Pine Lake
  {
    id: 'rt89', name: 'Route 89', kind: 'mountain', from: 'dj_n', to: 'pl_s',
    via: [
      [-905, 430], [-892, 280], [-858, 130], [-826, -10], [-818, -150], [-770, -280], [-712, -392],
      [-668, -500], [-668, -610], [-612, -722], [-530, -820], [-470, -900],
    ],
    width: 9, compression: 22, speed: 20,
  },

  // Scenic Byway: Pine Lake down to Mesa City
  {
    id: 'byway', name: 'Mesa Scenic Byway', kind: 'mountain', from: 'pl_e', to: 'mc_n',
    via: [
      [-40, -992], [90, -958], [222, -898], [345, -802], [440, -698], [518, -612], [618, -502], [736, -382],
      [858, -258], [958, -118], [1046, 10], [1110, 120],
    ],
    width: 9, compression: 24, speed: 22,
  },

  // Pine Lake
  { id: 'pl_street_w', name: 'Lakeview Road', kind: 'street', from: 'pl_s', to: 'pl_c', via: [[-372, -1002]], width: 10, compression: 6, speed: 10 },
  { id: 'pl_street_e', name: 'Lakeview Road', kind: 'street', from: 'pl_c', to: 'pl_e', via: [[-220, -1032]], width: 10, compression: 6, speed: 10 },
  {
    id: 'pl_cg_road', name: 'Campground Road', kind: 'street', from: 'pl_e', to: 'pl_cg',
    via: [[-70, -1040], [0, -1080]], width: 8, compression: 6, speed: 8,
  },
  {
    id: 'pl_cg_loop', name: 'Campground Loop', kind: 'dirt', from: 'pl_cg', to: 'pl_cg', loop: true,
    via: [
      [92, -1132], [121, -1150], [130, -1176], [130, -1300], [140, -1330], [166, -1344], [192, -1324],
      [198, -1260], [194, -1188], [168, -1152], [122, -1129],
    ],
    width: 6, compression: 6, speed: 6,
  },
  {
    id: 'pl_track', name: 'Old Logging Track', kind: 'track', from: 'pl_c', to: 'pl_hid',
    via: [[-360, -1046], [-440, -1068], [-478, -1130], [-484, -1200], [-460, -1262]],
    width: 3.6, compression: 6, speed: 5, maxWidth: 2.2, hiddenUntil: 'hidden_shore',
  },

  // Red Rock Flats dirt road
  {
    id: 'rr_road', name: 'Red Rock Road', kind: 'dirt', from: 'dj_w', to: 'rr',
    via: [[-1140, 690], [-1230, 640], [-1300, 590], [-1345, 548]],
    width: 6.5, compression: 8, speed: 9,
  },

  // Mesa City grid
  { id: 'mc_blvd_w', name: 'Mesa Boulevard', kind: 'street', from: 'mc_w', to: 'mc_cw', via: [], width: 13, compression: 6, speed: 12 },
  { id: 'mc_blvd_1', name: 'Mesa Boulevard', kind: 'street', from: 'mc_cw', to: 'mc_c', via: [], width: 13, compression: 6, speed: 12 },
  { id: 'mc_blvd_2', name: 'Mesa Boulevard', kind: 'street', from: 'mc_c', to: 'mc_ce', via: [], width: 13, compression: 6, speed: 12 },
  { id: 'mc_blvd_e', name: 'Mesa Boulevard', kind: 'street', from: 'mc_ce', to: 'mc_e', via: [], width: 13, compression: 6, speed: 12 },
  { id: 'mc_n1', name: 'North Street', kind: 'street', from: 'mc_nw', to: 'mc_n', via: [], width: 10, compression: 6, speed: 10 },
  { id: 'mc_n2', name: 'North Street', kind: 'street', from: 'mc_n', to: 'mc_ne', via: [], width: 10, compression: 6, speed: 10 },
  { id: 'mc_s1', name: 'South Street', kind: 'street', from: 'mc_sw', to: 'mc_s', via: [], width: 10, compression: 6, speed: 10 },
  { id: 'mc_s2', name: 'South Street', kind: 'street', from: 'mc_s', to: 'mc_se', via: [], width: 10, compression: 6, speed: 10 },
  { id: 'mc_av_w1', name: 'West Avenue', kind: 'street', from: 'mc_nw', to: 'mc_cw', via: [], width: 10, compression: 6, speed: 10 },
  { id: 'mc_av_w2', name: 'West Avenue', kind: 'street', from: 'mc_cw', to: 'mc_sw', via: [], width: 10, compression: 6, speed: 10 },
  { id: 'mc_av_c1', name: 'Central Avenue', kind: 'street', from: 'mc_n', to: 'mc_c', via: [], width: 12, compression: 6, speed: 11 },
  { id: 'mc_av_c2', name: 'Central Avenue', kind: 'street', from: 'mc_c', to: 'mc_s', via: [], width: 12, compression: 6, speed: 11 },
  { id: 'mc_av_e1', name: 'East Avenue', kind: 'street', from: 'mc_ne', to: 'mc_ce', via: [], width: 10, compression: 6, speed: 10 },
  { id: 'mc_av_e2', name: 'East Avenue', kind: 'street', from: 'mc_ce', to: 'mc_se', via: [], width: 10, compression: 6, speed: 10 },
  { id: 'mc_resort_rd', name: 'Resort Drive', kind: 'street', from: 'mc_s', to: 'mc_resort', via: [[1160, 450]], width: 9, compression: 6, speed: 9 },
];

// ───────────────────────── Places ─────────────────────────

export const PLACES: PlaceDef[] = [
  {
    id: 'dusty', name: 'Dusty Junction', kind: 'town', x: -900, z: 705, radius: 230, biome: 'desert', signal: 3, sun: 1,
    description: 'A sun-baked crossroads town: fuel, groceries, an RV supply shop, a mechanic and the freight office.',
    flatten: 210, scenery: 0, node: 'dj_c',
  },
  {
    id: 'pinelake', name: 'Pine Lake', kind: 'town', x: -280, z: -1045, radius: 200, biome: 'forest', signal: 2, sun: 0.65,
    description: 'A cool mountain village on a clear lake. Limited services, beautiful evenings.',
    flatten: 150, scenery: 2, node: 'pl_c',
  },
  {
    id: 'pl_camp', name: 'Pine Lake Campground', kind: 'campground', x: 145, z: -1235, radius: 150, biome: 'forest',
    signal: 1, sun: 0.6, description: 'Lakeside and forest sites with power and water.', scenery: 3, node: 'pl_cg',
  },
  {
    id: 'mesa', name: 'Mesa City', kind: 'town', x: 1150, z: 300, radius: 280, biome: 'mesa', signal: 4, sun: 1,
    description: 'The regional hub: supermarket, dealership, professional repairs, warehouse jobs and an RV resort.',
    flatten: 250, scenery: 0, node: 'mc_c',
  },
  {
    id: 'mesa_resort', name: 'Mesa Vista RV Resort', kind: 'campground', x: 1205, z: 560, radius: 90, biome: 'mesa',
    signal: 4, sun: 1, description: 'Full hookups, hot showers and big-rig friendly pull-throughs.', flatten: 85, scenery: 1,
    node: 'mc_resort',
  },
  {
    id: 'coyote', name: 'Coyote Flats Travel Center', kind: 'truckstop', x: 135, z: 975, radius: 110, biome: 'desert',
    signal: 3, sun: 1, description: 'Cheap fuel, paid showers, a dump station and free overnight parking (noisy).',
    flatten: 100, scenery: 0, node: 'ts',
  },
  {
    id: 'redrock', name: 'Red Rock Flats', kind: 'dispersed', x: -1385, z: 520, radius: 120, biome: 'desert', signal: 1,
    sun: 1, description: 'Free dispersed camping on public land. No services, huge skies. 14-night limit.',
    scenery: 3, node: 'rr',
  },
  {
    id: 'canyon_view', name: 'Canyon Overlook', kind: 'overlook', x: -745, z: -420, radius: 40, biome: 'desert', signal: 1,
    sun: 1, description: 'A pull-off above a red canyon on Route 89.', scenery: 3, discovery: 'canyon_overlook', node: 'dj_n',
  },
  {
    id: 'vista_point', name: 'Mesa Vista Point', kind: 'overlook', x: 548, z: -628, radius: 40, biome: 'mesa', signal: 2,
    sun: 1, description: 'A wide view east over the mesas.', scenery: 3, discovery: 'vista_point', node: 'pl_e',
  },
  {
    id: 'hidden_shore', name: 'Hidden Lakeshore', kind: 'hidden', x: -404, z: -1318, radius: 50, biome: 'forest',
    signal: 0, sun: 0.7, description: 'A secret free campsite on the far shore. Narrow vehicles only.', hidden: true,
    flatten: 26, scenery: 4, discovery: 'hidden_shore', node: 'pl_hid',
  },
  {
    id: 'rattlesnake', name: "Rattlesnake Rick's Curios", kind: 'poi', x: -325, z: 790, radius: 40, biome: 'desert',
    signal: 2, sun: 1, description: 'An odd roadside shop with bargain secondhand gear.', hidden: true, flatten: 32,
    scenery: 1, discovery: 'rattlesnake', node: 'dj_e',
  },
];

// ───────────────────────── Buildings ─────────────────────────

const N = 0; // front faces +Z (south)
const S = Math.PI; // front faces -Z (north)
const E = Math.PI / 2; // front faces +X (east)
const W = -Math.PI / 2; // front faces -X (west)

export const BUILDINGS: BuildingDef[] = [
  // Dusty Junction — north side of Main Street (fronts face south)
  { id: 'dj_diner', place: 'dusty', style: 'diner', x: -1030, z: 677, w: 18, d: 14, h: 5, rot: N, color: '#e9d9b8', roof: '#b4513a', sign: 'SAGEBRUSH DINER' },
  { id: 'dj_grocery', place: 'dusty', style: 'grocery', x: -980, z: 675, w: 26, d: 18, h: 6.5, rot: N, color: '#d9a066', roof: '#7a4a2a', sign: 'CACTUS MARKET' },
  { id: 'dj_gas_shop', place: 'dusty', style: 'gas', x: -838, z: 648, w: 16, d: 12, h: 4.5, rot: N, color: '#f2efe6', roof: '#c23a2c', sign: 'JUNCTION FUEL & WASH' },
  { id: 'dj_gas_canopy', place: 'dusty', style: 'canopy', x: -838, z: 673, w: 24, d: 11, h: 5.2, rot: N, color: '#f2efe6', roof: '#c23a2c', decor: true },
  { id: 'dj_carwash', place: 'dusty', style: 'garage', x: -800, z: 652, w: 8, d: 14, h: 5, rot: W, color: '#d8e4ea', roof: '#3a6a8a', sign: 'WASH', decor: true },
  { id: 'dj_motel', place: 'dusty', style: 'motel', x: -770, z: 664, w: 30, d: 11, h: 4.2, rot: N, color: '#e7b9a0', roof: '#8a3a2a', sign: 'STARLITE MOTEL', decor: true },
  // south side (fronts face north)
  { id: 'dj_rvsupply', place: 'dusty', style: 'shop', x: -1030, z: 724, w: 22, d: 16, h: 6, rot: S, color: '#c9d6c0', roof: '#4a6a4a', sign: 'DESERT RV SUPPLY' },
  { id: 'dj_garage', place: 'dusty', style: 'garage', x: -972, z: 724, w: 20, d: 16, h: 6, rot: S, color: '#b9a48a', roof: '#5a4a3a', sign: "RUSTY'S GARAGE" },
  { id: 'dj_freight', place: 'dusty', style: 'warehouse', x: -879, z: 790, w: 24, d: 18, h: 7, rot: W, color: '#c4b39a', roof: '#6a5a4a', sign: 'POST & FREIGHT' },
  { id: 'dj_salvage', place: 'dusty', style: 'shack', x: -921, z: 782, w: 20, d: 14, h: 5, rot: E, color: '#a89478', roof: '#6a4a3a', sign: 'SECOND CHANCE SALVAGE' },
  // decor
  { id: 'dj_house1', place: 'dusty', style: 'house', x: -1060, z: 620, w: 11, d: 9, h: 4, rot: N, color: '#e0c8a8', roof: '#8a5a3a', decor: true },
  { id: 'dj_house2', place: 'dusty', style: 'house', x: -1020, z: 618, w: 10, d: 9, h: 4, rot: N, color: '#c8d8d0', roof: '#5a6a7a', decor: true },
  { id: 'dj_house3', place: 'dusty', style: 'house', x: -1060, z: 780, w: 11, d: 9, h: 4, rot: S, color: '#e8d0b0', roof: '#9a4a3a', decor: true },
  { id: 'dj_house4', place: 'dusty', style: 'house', x: -1010, z: 790, w: 10, d: 9, h: 4, rot: S, color: '#d8b8a0', roof: '#6a4a3a', decor: true },
  { id: 'dj_church', place: 'dusty', style: 'church', x: -960, z: 615, w: 12, d: 18, h: 7, rot: N, color: '#f0e8dc', roof: '#7a5a4a', decor: true },
  { id: 'dj_house5', place: 'dusty', style: 'house', x: -840, z: 760, w: 10, d: 9, h: 4, rot: S, color: '#dcc4a0', roof: '#7a5a3a', decor: true },
  { id: 'dj_house6', place: 'dusty', style: 'house', x: -790, z: 742, w: 11, d: 9, h: 4, rot: S, color: '#e4d4bc', roof: '#5a4a4a', decor: true },

  // Pine Lake village (street runs east-west around z≈-1030; lake to the north)
  { id: 'pl_store', place: 'pinelake', style: 'shop', x: -335, z: -1058, w: 20, d: 14, h: 6, rot: N, color: '#8a5a3a', roof: '#3a4a3a', sign: 'GENERAL STORE' },
  { id: 'pl_ranger', place: 'pinelake', style: 'ranger', x: -268, z: -1010, w: 14, d: 11, h: 5.5, rot: S, color: '#6a7a4a', roof: '#4a3a2a', sign: 'RANGER STATION' },
  { id: 'pl_lodge', place: 'pinelake', style: 'lodge', x: -215, z: -1062, w: 28, d: 18, h: 8, rot: N, color: '#7a4e2e', roof: '#3a3a36', sign: 'PINE LAKE LODGE' },
  { id: 'pl_cabin1', place: 'pinelake', style: 'house', x: -380, z: -1062, w: 9, d: 8, h: 4, rot: N, color: '#8a6040', roof: '#4a4a40', decor: true },
  { id: 'pl_cabin2', place: 'pinelake', style: 'house', x: -320, z: -1000, w: 9, d: 8, h: 4, rot: S, color: '#7a5434', roof: '#3a4a3a', decor: true },
  { id: 'pl_cabin3', place: 'pinelake', style: 'house', x: -180, z: -1000, w: 9, d: 8, h: 4, rot: S, color: '#94683e', roof: '#4a3a30', decor: true },
  { id: 'pl_canoe', place: 'pinelake', style: 'shack', x: -282, z: -1100, w: 7, d: 5, h: 3.2, rot: N, color: '#a0703c', roof: '#2e5a4a', sign: 'CANOES', decor: true },
  // Campground
  { id: 'pl_kiosk', place: 'pl_camp', style: 'kiosk', x: 38, z: -1098, w: 5, d: 4, h: 3.2, rot: E, color: '#8a6040', roof: '#3a4a3a', sign: 'CAMP OFFICE' },
  { id: 'pl_bath', place: 'pl_camp', style: 'restroom', x: 166, z: -1258, w: 10, d: 7, h: 3.6, rot: W, color: '#9a7a54', roof: '#3a4a3a', sign: 'SHOWERS' },

  // Mesa City
  { id: 'mc_grocers', place: 'mesa', style: 'grocery', x: 1102, z: 268, w: 34, d: 24, h: 7.5, rot: N, color: '#e8c89a', roof: '#a04a32', sign: 'MESA GROCERS' },
  { id: 'mc_cafe', place: 'mesa', style: 'cafe', x: 1130, z: 238, w: 14, d: 10, h: 4.5, rot: S, color: '#d8a888', roof: '#6a3a2a', sign: 'CAFE', decor: true },
  { id: 'mc_outfitters', place: 'mesa', style: 'shop', x: 1210, z: 270, w: 24, d: 18, h: 6.5, rot: N, color: '#b8c8a8', roof: '#4a5a3a', sign: 'MESA OUTFITTERS' },
  { id: 'mc_gas', place: 'mesa', style: 'gas', x: 1102, z: 345, w: 16, d: 12, h: 4.5, rot: S, color: '#f2efe6', roof: '#2a6aa8', sign: 'MESA GAS' },
  { id: 'mc_gas_canopy', place: 'mesa', style: 'canopy', x: 1102, z: 325, w: 22, d: 10, h: 5.2, rot: S, color: '#f2efe6', roof: '#2a6aa8', decor: true },
  { id: 'mc_office', place: 'mesa', style: 'office', x: 1100, z: 372, w: 26, d: 14, h: 12, rot: N, color: '#c8b8a8', roof: '#5a5a5a', decor: true },
  { id: 'mc_service', place: 'mesa', style: 'garage', x: 1200, z: 334, w: 30, d: 20, h: 7, rot: S, color: '#d0d4d8', roof: '#3a4a5a', sign: 'PRO AUTO & RV SERVICE' },
  { id: 'mc_house1', place: 'mesa', style: 'house', x: 1190, z: 374, w: 10, d: 9, h: 4, rot: N, color: '#e0c8b0', roof: '#7a4a3a', decor: true },
  { id: 'mc_house2', place: 'mesa', style: 'house', x: 1220, z: 374, w: 10, d: 9, h: 4, rot: N, color: '#c8d0c0', roof: '#5a5a4a', decor: true },
  { id: 'mc_dealer', place: 'mesa', style: 'dealer', x: 1005, z: 336, w: 28, d: 16, h: 6.5, rot: S, color: '#f0f0f0', roof: '#2a4a7a', sign: 'MESA RV CENTER' },
  { id: 'mc_lockers', place: 'mesa', style: 'lockers', x: 1005, z: 262, w: 30, d: 12, h: 3.6, rot: N, color: '#e0a040', roof: '#5a5a5a', sign: 'U-STORE LOCKERS' },
  { id: 'mc_logistics', place: 'mesa', style: 'warehouse', x: 1292, z: 345, w: 36, d: 26, h: 9, rot: S, color: '#b0b8c0', roof: '#4a525a', sign: 'MESA LOGISTICS' },
  { id: 'mc_office2', place: 'mesa', style: 'office', x: 1292, z: 255, w: 24, d: 16, h: 14, rot: N, color: '#a8b0b8', roof: '#4a4a4a', decor: true },
  { id: 'mc_house3', place: 'mesa', style: 'house', x: 1110, z: 190, w: 10, d: 9, h: 4, rot: N, color: '#e8d0b8', roof: '#8a4a3a', decor: true },
  { id: 'mc_house4', place: 'mesa', style: 'house', x: 1190, z: 190, w: 10, d: 9, h: 4, rot: N, color: '#d8c0a0', roof: '#6a5a4a', decor: true },
  { id: 'mc_house5', place: 'mesa', style: 'house', x: 1110, z: 412, w: 10, d: 9, h: 4, rot: S, color: '#d0c8b8', roof: '#5a4a4a', decor: true },
  { id: 'mc_church', place: 'mesa', style: 'church', x: 1275, z: 188, w: 12, d: 18, h: 8, rot: N, color: '#f0e8dc', roof: '#6a4a3a', decor: true },
  // Resort
  { id: 'mc_resort_office', place: 'mesa_resort', style: 'kiosk', x: 1168, z: 512, w: 10, d: 8, h: 4.2, rot: E, color: '#e8d8c0', roof: '#a05a3a', sign: 'RESORT OFFICE' },
  { id: 'mc_resort_bath', place: 'mesa_resort', style: 'restroom', x: 1262, z: 560, w: 12, d: 8, h: 3.8, rot: W, color: '#e8d8c0', roof: '#a05a3a', sign: 'SHOWERS', decor: true },

  // Coyote Flats Travel Center (south of Highway 60)
  { id: 'ts_store', place: 'coyote', style: 'travel', x: 112, z: 1006, w: 34, d: 18, h: 6.5, rot: S, color: '#e8d8b8', roof: '#b4513a', sign: 'COYOTE FLATS' },
  { id: 'ts_canopy', place: 'coyote', style: 'canopy', x: 112, z: 968, w: 34, d: 12, h: 5.6, rot: S, color: '#f2efe6', roof: '#b4513a', decor: true },

  // Rattlesnake Rick's (north side of Highway 60)
  { id: 'rick_shack', place: 'rattlesnake', style: 'shack', x: -330, z: 778, w: 12, d: 8, h: 4, rot: -0.38, color: '#c89a5a', roof: '#6a3a2a', sign: "RICK'S CURIOS" },
];

// ───────────────────────── Parking ─────────────────────────

// rot: local +X (width w) → world (cos rot, -sin rot); local +Z (length l) → world (sin rot, cos rot).
export const PARKING: ParkingDef[] = [
  { id: 'dj_lot', place: 'dusty', x: -935, z: 752, w: 30, l: 36, rot: 0, overnight: false, bays: 6, rv: true, surface: 'asphalt' },
  { id: 'dj_gas_apron', place: 'dusty', x: -838, z: 674, w: 30, l: 24, rot: 0, overnight: false, bays: 0, surface: 'concrete' },
  { id: 'dj_freight_yard', place: 'dusty', x: -893, z: 826, w: 30, l: 22, rot: 0, overnight: false, bays: 0, surface: 'concrete' },
  { id: 'pl_lot', place: 'pinelake', x: -322, z: -1038, w: 34, l: 16, rot: 0, overnight: false, bays: 5, rv: true, surface: 'gravel' },
  { id: 'pl_lodge_yard', place: 'pinelake', x: -180, z: -1050, w: 16, l: 18, rot: 0, overnight: false, bays: 0, surface: 'gravel' },
  { id: 'pl_cg_yard', place: 'pl_camp', x: 70, z: -1124, w: 24, l: 16, rot: 0.3, overnight: false, bays: 0, surface: 'gravel' },
  { id: 'mc_lot', place: 'mesa', x: 1005, z: 375, w: 40, l: 36, rot: 0, overnight: false, bays: 8, rv: true, surface: 'asphalt' },
  { id: 'mc_gas_apron', place: 'mesa', x: 1102, z: 322, w: 30, l: 22, rot: 0, overnight: false, bays: 0, surface: 'concrete' },
  { id: 'mc_dock_yard', place: 'mesa', x: 1292, z: 316, w: 40, l: 18, rot: 0, overnight: false, bays: 0, surface: 'concrete' },
  { id: 'mc_service_apron', place: 'mesa', x: 1200, z: 314, w: 30, l: 14, rot: 0, overnight: false, bays: 0, surface: 'concrete' },
  { id: 'mc_grocers_lot', place: 'mesa', x: 1102, z: 244, w: 34, l: 16, rot: 0, overnight: false, bays: 6, surface: 'asphalt' },
  { id: 'mc_resort_pad', place: 'mesa_resort', x: 1220, z: 561, w: 72, l: 92, rot: 0, overnight: true, bays: 0, surface: 'asphalt' },
  { id: 'ts_lot', place: 'coyote', x: 140, z: 972, w: 150, l: 70, rot: 0, overnight: true, bays: 0, surface: 'concrete' },
  { id: 'canyon_pull', place: 'canyon_view', x: -738, z: -414, w: 18, l: 30, rot: 0.55, overnight: false, bays: 3, rv: true, surface: 'gravel' },
  { id: 'vista_pull', place: 'vista_point', x: 540, z: -624, w: 18, l: 30, rot: 0.75, overnight: false, bays: 3, rv: true, surface: 'gravel' },
  { id: 'rick_lot', place: 'rattlesnake', x: -335, z: 791, w: 22, l: 12, rot: -0.38, overnight: false, bays: 0, surface: 'gravel' },
];

// ───────────────────────── Campgrounds ─────────────────────────

function lakeSites(): SiteDef[] {
  // The loop's west lane runs north-south at x≈130. Lakeside sites sit west of
  // it (nose toward the lake = facing west), forest sites east of it.
  const out: SiteDef[] = [];
  const zs = [-1192, -1224, -1256, -1288];
  zs.forEach((z, i) => {
    out.push({
      id: `P${i + 1}`, name: `Lakeside ${i + 1}`, x: 116, z, heading: -Math.PI / 2, length: 11, width: 5.5,
      maxLength: 8, power: 30, water: true, sewer: false, scenery: 4, level: true, fireRing: true,
      pedestal: { x: 121.5, z: z - 3.4 },
    });
  });
  zs.forEach((z, i) => {
    out.push({
      id: `P${i + 5}`, name: `Forest ${i + 1}`, x: 144, z, heading: Math.PI / 2, length: 11, width: 5.5,
      maxLength: 7.5, power: 30, water: true, sewer: false, scenery: 3, level: true, fireRing: true,
      pedestal: { x: 138.5, z: z + 3.4 },
    });
  });
  return out;
}

function resortSites(): SiteDef[] {
  const out: SiteDef[] = [];
  for (let i = 0; i < 5; i++) {
    const z = 528 + i * 16;
    out.push({
      id: `M${i + 1}`, name: `Pull-through ${i + 1}`, x: 1205, z, heading: Math.PI / 2, length: 20, width: 6,
      maxLength: 14, power: 50, water: true, sewer: true, scenery: 1, level: true, pedestal: { x: 1200, z: z + 4.5 },
    });
    out.push({
      id: `M${i + 6}`, name: `Back-in ${i + 1}`, x: 1238, z, heading: Math.PI / 2, length: 14, width: 6,
      maxLength: 11, power: 30, water: true, sewer: true, scenery: 1, level: true, pedestal: { x: 1233, z: z + 4.5 },
    });
  }
  return out;
}

export const CAMPGROUNDS: CampgroundDef[] = [
  {
    id: 'pine_cg', name: 'Pine Lake Campground', place: 'pl_camp', kind: 'campground', pricePerNight: 28,
    showers: 'paid', showerPrice: 3, dump: true, dumpPrice: 8, stayLimitNights: 0, quietHours: true, noisy: false,
    amenities: ['Power 30A', 'Water', 'Dump station', 'Showers ($3)', 'Fire rings', 'Lake access'],
    description: 'Shaded forest and lakeside sites. Sites are limited to 7.5-8 m vehicles.', sites: lakeSites(), free: false,
  },
  {
    id: 'mesa_resort', name: 'Mesa Vista RV Resort', place: 'mesa_resort', kind: 'resort', pricePerNight: 52,
    showers: 'free', showerPrice: 0, dump: true, dumpPrice: 0, stayLimitNights: 0, quietHours: true, noisy: false,
    amenities: ['Full hookups', 'Power 30/50A', 'Sewer at every site', 'Free hot showers', 'Big rigs welcome'],
    description: 'Paved full-hookup sites. Not much scenery, but every comfort.', sites: resortSites(), free: false,
  },
  {
    id: 'coyote_lot', name: 'Coyote Flats overnight lot', place: 'coyote', kind: 'truckstop', pricePerNight: 0,
    showers: 'paid', showerPrice: 12, dump: true, dumpPrice: 10, stayLimitNights: 1, quietHours: false, noisy: true,
    amenities: ['Free overnight', 'Showers ($12)', 'Dump ($10)', 'Cheap fuel'],
    description: 'Free overnight parking among idling trucks. Expect poor sleep.',
    sites: [
      { id: 'T1', name: 'RV row 1', x: 190, z: 958, heading: Math.PI / 2, length: 22, width: 6, maxLength: 20, power: 0, water: false, sewer: false, scenery: 0, level: true },
      { id: 'T2', name: 'RV row 2', x: 190, z: 972, heading: Math.PI / 2, length: 22, width: 6, maxLength: 20, power: 0, water: false, sewer: false, scenery: 0, level: true },
      { id: 'T3', name: 'RV row 3', x: 190, z: 986, heading: Math.PI / 2, length: 22, width: 6, maxLength: 20, power: 0, water: false, sewer: false, scenery: 0, level: true },
    ],
    free: true,
  },
  {
    id: 'redrock_flats', name: 'Red Rock Flats (dispersed)', place: 'redrock', kind: 'dispersed', pricePerNight: 0,
    showers: 'none', showerPrice: 0, dump: false, dumpPrice: 0, stayLimitNights: 14, quietHours: false, noisy: false,
    amenities: ['Free', 'Spectacular sunsets', 'Full sun for solar', 'No services'],
    description: 'Pick a flat-ish spot among the red rocks. Bring water; leveling blocks help.',
    sites: [
      { id: 'R1', name: 'Rock spot 1', x: -1380, z: 500, heading: 0.3, length: 14, width: 8, maxLength: 14, power: 0, water: false, sewer: false, scenery: 4, level: false, fireRing: true },
      { id: 'R2', name: 'Rock spot 2', x: -1408, z: 530, heading: 1.2, length: 14, width: 8, maxLength: 14, power: 0, water: false, sewer: false, scenery: 4, level: false },
      { id: 'R3', name: 'Rock spot 3', x: -1360, z: 545, heading: -0.6, length: 14, width: 8, maxLength: 14, power: 0, water: false, sewer: false, scenery: 3, level: false },
    ],
    free: true,
  },
  {
    id: 'hidden_site', name: 'Hidden Lakeshore', place: 'hidden_shore', kind: 'hidden', pricePerNight: 0,
    showers: 'none', showerPrice: 0, dump: false, dumpPrice: 0, stayLimitNights: 14, quietHours: false, noisy: false,
    amenities: ['Free', 'Private lake view', 'Narrow access (2.2 m)'],
    description: 'A quiet clearing reached only by an old logging track.',
    sites: [
      { id: 'H1', name: 'Shore clearing', x: -404, z: -1318, heading: Math.PI / 2 + 0.4, length: 9, width: 6, maxLength: 7, power: 0, water: false, sewer: false, scenery: 5, level: true, fireRing: true },
    ],
    free: true,
  },
];

// ───────────────────────── Anchors (interaction points) ─────────────────────────

export const ANCHORS: AnchorDef[] = [
  // Dusty Junction
  { id: 'dj_grocery_door', kind: 'shop', place: 'dusty', name: 'Cactus Market', x: -980, z: 684.5, ref: 'dj_grocery' },
  { id: 'dj_rv_door', kind: 'shop', place: 'dusty', name: 'Desert RV Supply', x: -1030, z: 715.5, ref: 'dj_rvsupply' },
  { id: 'dj_diner_door', kind: 'diner', place: 'dusty', name: 'Sagebrush Diner', x: -1030, z: 684.5, price: 12 },
  { id: 'dj_garage_door', kind: 'mechanic', place: 'dusty', name: "Rusty's Garage", x: -972, z: 715.5, ref: 'rusty', vehicleRadius: 18 },
  { id: 'dj_salvage_door', kind: 'shop', place: 'dusty', name: 'Second Chance Salvage', x: -910.5, z: 782, ref: 'dj_salvage' },
  { id: 'dj_gas_door', kind: 'shop', place: 'dusty', name: 'Junction Fuel shop', x: -838, z: 654.5, ref: 'dj_gas_shop' },
  { id: 'dj_pump_a', kind: 'fuel', place: 'dusty', name: 'Fuel pump', x: -846, z: 673, price: 1.22, vehicleRadius: 7 },
  { id: 'dj_pump_b', kind: 'fuel', place: 'dusty', name: 'Fuel pump', x: -830, z: 673, price: 1.22, vehicleRadius: 7 },
  { id: 'dj_dump', kind: 'dump', place: 'dusty', name: 'Dump station', x: -812, z: 688, price: 6, vehicleRadius: 9 },
  { id: 'dj_water', kind: 'water', place: 'dusty', name: 'Water spigot', x: -806, z: 686, price: 3, vehicleRadius: 10 },
  { id: 'dj_propane', kind: 'propane', place: 'dusty', name: 'Propane refill', x: -822, z: 655, price: 3.4, vehicleRadius: 10 },
  { id: 'dj_wash', kind: 'carwash', place: 'dusty', name: 'Car wash', x: -806, z: 652, price: 9, vehicleRadius: 9 },
  { id: 'dj_board', kind: 'jobboard', place: 'dusty', name: 'Freight job board', x: -890.5, z: 794, ref: 'dj_board' },
  { id: 'dj_dock', kind: 'dock', place: 'dusty', name: 'Freight loading dock', x: -884, z: 806, vehicleRadius: 26 },
  // Pine Lake
  { id: 'pl_store_door', kind: 'shop', place: 'pinelake', name: 'Pine Lake General Store', x: -335, z: -1050.5, ref: 'pl_store' },
  { id: 'pl_pump', kind: 'fuel', place: 'pinelake', name: 'Fuel pump', x: -312, z: -1043, price: 1.38, vehicleRadius: 7 },
  { id: 'pl_propane', kind: 'propane', place: 'pinelake', name: 'Propane refill', x: -350, z: -1046, price: 3.9, vehicleRadius: 10 },
  { id: 'pl_board', kind: 'jobboard', place: 'pinelake', name: 'Ranger notice board', x: -268, z: -1016, ref: 'pl_board' },
  { id: 'pl_info', kind: 'info', place: 'pinelake', name: 'Ranger desk', x: -262, z: -1016 },
  { id: 'pl_lodge_dock', kind: 'dock', place: 'pinelake', name: 'Lodge delivery door', x: -197, z: -1058, vehicleRadius: 26 },
  { id: 'pl_fishing', kind: 'fishing', place: 'pinelake', name: 'End of the pier', x: -250, z: -1146 },
  { id: 'pl_canoe', kind: 'canoe', place: 'pinelake', name: 'Canoe rental', x: -282, z: -1096.5, price: 10 },
  { id: 'pl_kiosk', kind: 'kiosk', place: 'pl_camp', name: 'Campground office', x: 42, z: -1098, ref: 'pine_cg' },
  { id: 'pl_cg_dump', kind: 'dump', place: 'pl_camp', name: 'Campground dump station', x: 74, z: -1130, price: 8, vehicleRadius: 9 },
  { id: 'pl_cg_water', kind: 'water', place: 'pl_camp', name: 'Campground water fill', x: 79, z: -1126, price: 0, vehicleRadius: 10 },
  { id: 'pl_cg_shower', kind: 'shower', place: 'pl_camp', name: 'Campground showers', x: 161, z: -1258, price: 3, ref: 'pine_cg' },
  { id: 'pl_cg_fire', kind: 'campfire', place: 'pl_camp', name: 'Community fire circle', x: 162, z: -1312 },
  // Mesa City
  { id: 'mc_grocers_door', kind: 'shop', place: 'mesa', name: 'Mesa Grocers', x: 1102, z: 280.5, ref: 'mc_grocers' },
  { id: 'mc_outfit_door', kind: 'shop', place: 'mesa', name: 'Mesa Outfitters', x: 1210, z: 279.5, ref: 'mc_outfitters' },
  { id: 'mc_gas_door', kind: 'shop', place: 'mesa', name: 'Mesa Gas shop', x: 1102, z: 338.5, ref: 'mc_gas_shop' },
  { id: 'mc_pump_a', kind: 'fuel', place: 'mesa', name: 'Fuel pump', x: 1094, z: 325, price: 1.19, vehicleRadius: 7 },
  { id: 'mc_pump_b', kind: 'fuel', place: 'mesa', name: 'Fuel pump', x: 1110, z: 325, price: 1.19, vehicleRadius: 7 },
  { id: 'mc_dump', kind: 'dump', place: 'mesa', name: 'Dump station', x: 1124, z: 318, price: 7, vehicleRadius: 9 },
  { id: 'mc_water', kind: 'water', place: 'mesa', name: 'Water fill', x: 1126, z: 314, price: 2, vehicleRadius: 10 },
  { id: 'mc_propane', kind: 'propane', place: 'mesa', name: 'Propane refill', x: 1080, z: 318, price: 3.2, vehicleRadius: 10 },
  { id: 'mc_service_door', kind: 'mechanic', place: 'mesa', name: 'Pro Auto & RV Service', x: 1200, z: 323.5, ref: 'pro', vehicleRadius: 20 },
  { id: 'mc_dealer_door', kind: 'dealer', place: 'mesa', name: 'Mesa RV Center', x: 1005, z: 327.5, ref: 'mc_dealer' },
  { id: 'mc_locker_door', kind: 'locker', place: 'mesa', name: 'U-Store Lockers', x: 1005, z: 268.5, price: 15, vehicleRadius: 22 },
  { id: 'mc_board', kind: 'jobboard', place: 'mesa', name: 'Logistics job board', x: 1280, z: 331.5, ref: 'mc_board' },
  { id: 'mc_dock', kind: 'dock', place: 'mesa', name: 'Logistics loading dock', x: 1300, z: 331.5, vehicleRadius: 26 },
  { id: 'mc_resort_kiosk', kind: 'kiosk', place: 'mesa_resort', name: 'Resort office', x: 1173.5, z: 512, ref: 'mesa_resort' },
  { id: 'mc_resort_shower', kind: 'shower', place: 'mesa_resort', name: 'Resort showers', x: 1256, z: 560, price: 0, ref: 'mesa_resort' },
  { id: 'mc_resort_dump', kind: 'dump', place: 'mesa_resort', name: 'Resort dump station', x: 1190, z: 520, price: 0, vehicleRadius: 9 },
  // Coyote Flats
  { id: 'ts_door', kind: 'shop', place: 'coyote', name: 'Coyote Flats store', x: 106, z: 996.5, ref: 'ts_store' },
  { id: 'ts_shower', kind: 'shower', place: 'coyote', name: 'Truck stop showers', x: 122, z: 996.5, price: 12, ref: 'coyote_lot' },
  { id: 'ts_pump_a', kind: 'fuel', place: 'coyote', name: 'Fuel pump', x: 100, z: 968, price: 1.12, vehicleRadius: 7 },
  { id: 'ts_pump_b', kind: 'fuel', place: 'coyote', name: 'Fuel pump', x: 124, z: 968, price: 1.12, vehicleRadius: 7 },
  { id: 'ts_dump', kind: 'dump', place: 'coyote', name: 'Dump station', x: 176, z: 1000, price: 10, vehicleRadius: 9 },
  { id: 'ts_water', kind: 'water', place: 'coyote', name: 'Potable water', x: 182, z: 1000, price: 4, vehicleRadius: 10 },
  { id: 'ts_propane', kind: 'propane', place: 'coyote', name: 'Propane refill', x: 82, z: 992, price: 3.1, vehicleRadius: 10 },
  { id: 'ts_dock', kind: 'dock', place: 'coyote', name: 'Travel center receiving', x: 90, z: 1006, vehicleRadius: 26 },
  // Rattlesnake Rick's
  { id: 'rick_door', kind: 'shop', place: 'rattlesnake', name: "Rattlesnake Rick's", x: -331.7, z: 782.3, ref: 'rick' },
  // Viewpoints
  { id: 'canyon_rail', kind: 'viewpoint', place: 'canyon_view', name: 'Canyon railing', x: -752, z: -430 },
  { id: 'vista_rail', kind: 'viewpoint', place: 'vista_point', name: 'Vista railing', x: 556, z: -636 },
];

// ───────────────────────── Discoveries ─────────────────────────

export const DISCOVERIES: DiscoveryDef[] = [
  { id: 'canyon_overlook', name: 'Canyon Overlook', x: -745, z: -420, radius: 45, kind: 'viewpoint', mood: 8, text: 'The canyon drops away in bands of red and gold. Worth the stop.' },
  { id: 'vista_point', name: 'Mesa Vista Point', x: 548, z: -628, radius: 45, kind: 'viewpoint', mood: 8, text: 'Flat-topped mesas march to the horizon.' },
  { id: 'hidden_shore', name: 'Hidden Lakeshore', x: -404, z: -1318, radius: 40, kind: 'site', mood: 12, text: 'A free, private campsite on the quiet side of Pine Lake. Big rigs will never fit down here.' },
  { id: 'rattlesnake', name: "Rattlesnake Rick's Curios", x: -325, z: 790, radius: 55, kind: 'shop', mood: 4, text: 'A giant fiberglass snake marks a shop full of oddities and cheap used gear.' },
  { id: 'redrock', name: 'Red Rock Flats', x: -1385, z: 520, radius: 80, kind: 'place', mood: 6, text: 'Free camping among red hoodoos. The stars out here are unreal.' },
  { id: 'petroglyphs', name: 'Petroglyph Rock', x: -1436, z: 468, radius: 14, kind: 'viewpoint', mood: 10, text: 'Ancient carvings of bighorn sheep and spirals, faint in the evening light.' },
  { id: 'eagle_rock', name: 'Eagle Rock', x: -170, z: -930, radius: 16, kind: 'viewpoint', mood: 10, text: 'From the top of the trail you can see the whole lake and the road you came in on.' },
  { id: 'pl_lake', name: 'Pine Lake', x: -250, z: -1100, radius: 60, kind: 'place', mood: 5, text: 'Cool air, pine scent and loons on the water.' },
];

// ───────────────────────── Lake + terrain features ─────────────────────────

export const LAKE = { x: -150, z: -1260, rx: 240, rz: 140, level: 118.5 };

/** Flat-topped buttes (decor) in the terrain: center, radius, height. */
export const MESAS: { x: number; z: number; r: number; h: number }[] = [
  { x: 690, z: 60, r: 120, h: 70 },
  { x: 1500, z: 30, r: 160, h: 85 },
  { x: 1440, z: 720, r: 130, h: 60 },
  { x: 620, z: 1160, r: 150, h: 55 },
  { x: -180, z: 1180, r: 140, h: 50 },
  { x: 380, z: 360, r: 90, h: 45 },
  { x: -1250, z: 1000, r: 140, h: 60 },
  { x: -1540, z: 300, r: 120, h: 70 },
];

/** Extra hills (above the surrounding terrain). */
export const HILLS: { x: number; z: number; r: number; h: number }[] = [
  { x: -170, z: -925, r: 55, h: 24 }, // Eagle Rock
];

/** Walking trails (rendered as dirt paths). */
export const TRAILS: { id: string; points: [number, number][]; width: number }[] = [
  { id: 'eagle_trail', points: [[-205, -1018], [-200, -985], [-188, -960], [-176, -942], [-170, -932]], width: 1.8 },
  { id: 'pier_path', points: [[-262, -1048], [-258, -1080], [-252, -1110], [-250, -1124]], width: 2 },
  { id: 'petro_path', points: [[-1390, 508], [-1412, 488], [-1432, 472]], width: 1.6 },
];

/** Walkable platforms over water/terrain: rect + deck height above the lake level. */
export const DECKS: { id: string; x: number; z: number; w: number; l: number; y: number }[] = [
  { id: 'pier', x: -250, z: -1137, w: 3, l: 26, y: 119.3 },
];

/** Narrow passages: two boulders with a gap between them (vehicle width filter). */
export const GATES: { id: string; x: number; z: number; heading: number; gap: number }[] = [
  { id: 'track_gate', x: -481, z: -1160, heading: 0.06, gap: 2.32 },
];

/** Canyon carved below the Canyon Overlook. */
export const CANYON: { points: [number, number][]; width: number; depth: number } = {
  points: [[-1180, 260], [-1060, 80], [-955, -120], [-875, -300], [-842, -440], [-880, -620], [-960, -800]],
  width: 110,
  depth: 48,
};

export const WORLD = {
  minX: -1600, maxX: 1600, minZ: -1600, maxZ: 1300,
  /** Player/vehicle bounds (soft walls). */
  playMinX: -1520, playMaxX: 1520, playMinZ: -1520, playMaxZ: 1220,
};

// Lookups

export const NODE_BY_ID: Record<string, NodeDef> = Object.fromEntries(NODES.map((n) => [n.id, n]));
export const PLACE_BY_ID: Record<string, PlaceDef> = Object.fromEntries(PLACES.map((p) => [p.id, p]));
export const ANCHOR_BY_ID: Record<string, AnchorDef> = Object.fromEntries(ANCHORS.map((a) => [a.id, a]));
export const CAMPGROUND_BY_ID: Record<string, CampgroundDef> = Object.fromEntries(CAMPGROUNDS.map((c) => [c.id, c]));
export const DISCOVERY_BY_ID: Record<string, DiscoveryDef> = Object.fromEntries(DISCOVERIES.map((d) => [d.id, d]));

export function findSite(siteId: string): { camp: CampgroundDef; site: SiteDef } | null {
  for (const camp of CAMPGROUNDS) {
    const site = camp.sites.find((s) => s.id === siteId);
    if (site) return { camp, site };
  }
  return null;
}
