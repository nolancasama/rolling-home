import type { ComponentId } from './types';

// ───────────────────────── Shops ─────────────────────────

export type ShopKind = 'grocery' | 'convenience' | 'rv' | 'used' | 'general' | 'outfitter' | 'dealer' | 'market';

export interface StockEntry {
  item: string;
  /** Price multiplier relative to the catalog price. */
  priceMul?: number;
  /** Used stock: condition (0..1) and limited quantity. */
  condition?: number;
  qty?: number;
}

export interface ShopDef {
  id: string;
  name: string;
  place: string;
  kind: ShopKind;
  blurb: string;
  priceMul: number;
  stock: StockEntry[];
  /** Buys your items at this fraction of value × condition. */
  buys?: number;
  /** Sells vehicles (dealership). */
  vehicles?: boolean;
  /** Only open when a discovery has been made. */
  requires?: string;
}

const GROCERY_BASICS: StockEntry[] = [
  { item: 'pasta_kit' }, { item: 'canned_chili' }, { item: 'eggs_bread' }, { item: 'fresh_produce' },
  { item: 'instant_noodles' }, { item: 'snack_bars' }, { item: 'fruit' }, { item: 'deli_sandwich' },
  { item: 'water_jug' }, { item: 'butane' },
];

const CONVENIENCE: StockEntry[] = [
  { item: 'snack_bars' }, { item: 'deli_sandwich' }, { item: 'instant_noodles' }, { item: 'canned_chili' },
  { item: 'water_jug' }, { item: 'butane' }, { item: 'firewood' }, { item: 'cargo_straps' },
];

export const SHOPS: Record<string, ShopDef> = {
  dj_grocery: {
    id: 'dj_grocery', name: 'Cactus Market', place: 'dusty', kind: 'grocery', priceMul: 1,
    blurb: 'Small-town groceries. Fair prices, dusty floors.', stock: GROCERY_BASICS,
  },
  dj_gas_shop: {
    id: 'dj_gas_shop', name: 'Junction Fuel shop', place: 'dusty', kind: 'convenience', priceMul: 1.2,
    blurb: 'Snacks, ice and the essentials.', stock: CONVENIENCE,
  },
  dj_rvsupply: {
    id: 'dj_rvsupply', name: 'Desert RV Supply', place: 'dusty', kind: 'rv', priceMul: 1,
    blurb: 'Hoses, batteries, solar and everything that breaks in an RV.',
    stock: [
      { item: 'water_hose' }, { item: 'sewer_kit' }, { item: 'power_cord' }, { item: 'cargo_straps' },
      { item: 'leveling_blocks' }, { item: 'solar_100' }, { item: 'solar_200' }, { item: 'agm_battery' },
      { item: 'lithium_battery' }, { item: 'roof_fan' }, { item: 'aux_tank' }, { item: 'inverter' },
      { item: 'signal_booster' }, { item: 'string_lights' }, { item: 'cooler_fridge' }, { item: 'cassette_toilet' },
      { item: 'outdoor_shower' }, { item: 'small_cabinet' }, { item: 'folding_table' }, { item: 'rug' },
      { item: 'plant' }, { item: 'foam_van' }, { item: 'memory_van' }, { item: 'foam_double' },
      { item: 'appliance_kit' },
    ],
  },
  dj_salvage: {
    id: 'dj_salvage', name: 'Second Chance Salvage', place: 'dusty', kind: 'used', priceMul: 1,
    blurb: 'Used gear at bargain prices. Check the condition before you buy.', buys: 0.4,
    stock: [
      { item: 'solar_100', priceMul: 0.5, condition: 0.7, qty: 1 },
      { item: 'agm_battery', priceMul: 0.45, condition: 0.6, qty: 2 },
      { item: 'swivel_chair', priceMul: 0.45, condition: 0.7, qty: 1 },
      { item: 'small_cabinet', priceMul: 0.5, condition: 0.6, qty: 1 },
      { item: 'fridge_75', priceMul: 0.5, condition: 0.55, qty: 1 },
      { item: 'tool_kit', priceMul: 0.55, condition: 0.8, qty: 1 },
      { item: 'camp_chair', priceMul: 0.5, condition: 0.6, qty: 2 },
      { item: 'bookshelf', priceMul: 0.5, condition: 0.65, qty: 1 },
      { item: 'folding_table', priceMul: 0.55, condition: 0.7, qty: 1 },
      { item: 'leveling_blocks', priceMul: 0.5, condition: 0.75, qty: 1 },
    ],
  },
  pl_store: {
    id: 'pl_store', name: 'Pine Lake General Store', place: 'pinelake', kind: 'general', priceMul: 1.25,
    blurb: 'Everything you forgot, at mountain prices.',
    stock: [
      { item: 'pasta_kit' }, { item: 'canned_chili' }, { item: 'eggs_bread' }, { item: 'instant_noodles' },
      { item: 'snack_bars' }, { item: 'fruit' }, { item: 'water_jug' }, { item: 'butane' }, { item: 'firewood' },
      { item: 'camp_chair' }, { item: 'cargo_straps' },
    ],
  },
  mc_grocers: {
    id: 'mc_grocers', name: 'Mesa Grocers', place: 'mesa', kind: 'grocery', priceMul: 0.92,
    blurb: 'The big supermarket. Best grocery prices in the region.', stock: GROCERY_BASICS,
  },
  mc_outfitters: {
    id: 'mc_outfitters', name: 'Mesa Outfitters', place: 'mesa', kind: 'outfitter', priceMul: 1,
    blurb: 'Camp furniture, tools, parts and home comforts.',
    stock: [
      { item: 'camp_chair' }, { item: 'camp_table' }, { item: 'tool_kit' }, { item: 'engine_kit' },
      { item: 'brake_kit' }, { item: 'suspension_kit' }, { item: 'appliance_kit' }, { item: 'leveling_blocks' },
      { item: 'cargo_straps' }, { item: 'firewood' }, { item: 'outdoor_shower' }, { item: 'rug' }, { item: 'plant' },
      { item: 'bookshelf' }, { item: 'swivel_chair' }, { item: 'tall_cabinet' }, { item: 'wardrobe' },
      { item: 'small_cabinet' }, { item: 'folding_table' }, { item: 'string_lights' }, { item: 'kitchenware' },
    ],
  },
  mc_gas_shop: {
    id: 'mc_gas_shop', name: 'Mesa Gas shop', place: 'mesa', kind: 'convenience', priceMul: 1.15,
    blurb: 'Coffee, snacks and road supplies.', stock: CONVENIENCE,
  },
  mc_dealer: {
    id: 'mc_dealer', name: 'Mesa RV Center', place: 'mesa', kind: 'dealer', priceMul: 1.05,
    blurb: 'Used RVs, trade-ins and premium equipment.', buys: 0.45, vehicles: true,
    stock: [
      { item: 'fridge_75' }, { item: 'threeway_fridge' }, { item: 'induction_galley' }, { item: 'propane_galley' },
      { item: 'van_galley' }, { item: 'composting_toilet' }, { item: 'wet_bath' }, { item: 'generator' },
      { item: 'awning' }, { item: 'lithium_battery' }, { item: 'solar_200' }, { item: 'inverter' },
      { item: 'signal_booster' }, { item: 'memory_double' }, { item: 'hybrid_double' }, { item: 'memory_van' },
      { item: 'dinette' }, { item: 'double_bed' }, { item: 'van_bed' }, { item: 'wardrobe' }, { item: 'tall_cabinet' },
    ],
  },
  ts_store: {
    id: 'ts_store', name: 'Coyote Flats store', place: 'coyote', kind: 'convenience', priceMul: 1.15,
    blurb: 'Open 24 hours. Truckers swear by the burritos.', stock: CONVENIENCE,
  },
  rick: {
    id: 'rick', name: "Rattlesnake Rick's Curios", place: 'rattlesnake', kind: 'used', priceMul: 1,
    blurb: '"If I ain\'t got it, you don\'t need it." Odd stock, honest prices.', buys: 0.35, requires: 'rattlesnake',
    stock: [
      { item: 'solar_200', priceMul: 0.45, condition: 0.8, qty: 1 },
      { item: 'lithium_battery', priceMul: 0.5, condition: 0.85, qty: 1 },
      { item: 'signal_booster', priceMul: 0.5, condition: 0.9, qty: 1 },
      { item: 'camp_table', priceMul: 0.5, condition: 0.7, qty: 1 },
      { item: 'plant', priceMul: 0.6, condition: 0.9, qty: 2 },
      { item: 'books', priceMul: 0.5, condition: 0.8, qty: 1 },
      { item: 'rug', priceMul: 0.5, condition: 0.75, qty: 1 },
    ],
  },
  market: {
    id: 'market', name: 'Saturday Farmers Market', place: 'mesa', kind: 'market', priceMul: 0.85,
    blurb: 'Local growers every Saturday morning in the plaza.',
    stock: [{ item: 'market_basket' }, { item: 'fresh_produce' }, { item: 'fruit' }, { item: 'eggs_bread' }],
  },
};

// ───────────────────────── Mechanics ─────────────────────────

export interface MechanicDef {
  id: string;
  name: string;
  place: string;
  /** Components this shop can repair and the best condition it can reach. */
  repairs: Partial<Record<ComponentId | 'body', number>>;
  /** Dollars per condition-percent, before vehicle and difficulty multipliers. */
  rate: Partial<Record<ComponentId | 'body', number>>;
  /** Game minutes per condition-percent. */
  minutesPerPct: number;
  blurb: string;
  sellsParts: string[];
}

export const MECHANICS: Record<string, MechanicDef> = {
  rusty: {
    id: 'rusty', name: "Rusty's Garage", place: 'dusty',
    repairs: { engine: 0.85, brakes: 0.88, steering: 0.85 },
    rate: { engine: 7, brakes: 4, steering: 5 },
    minutesPerPct: 5,
    blurb: 'Honest small-town mechanic. Gets you to "good", not "perfect".',
    sellsParts: ['engine_kit', 'brake_kit', 'suspension_kit', 'tool_kit'],
  },
  pro: {
    id: 'pro', name: 'Pro Auto & RV Service', place: 'mesa',
    repairs: { engine: 1, brakes: 1, steering: 1, appliances: 1, body: 1 },
    rate: { engine: 9, brakes: 5, steering: 6.5, appliances: 4.5, body: 6 },
    minutesPerPct: 3.5,
    blurb: 'Professional chassis and RV appliance service, plus body and paint.',
    sellsParts: ['engine_kit', 'brake_kit', 'suspension_kit', 'appliance_kit'],
  },
};

// ───────────────────────── Jobs ─────────────────────────

export interface DockRef { anchor: string; place: string; label: string }

export const DOCKS: Record<string, DockRef> = {
  dj_dock: { anchor: 'dj_dock', place: 'dusty', label: 'Post & Freight, Dusty Junction' },
  pl_lodge_dock: { anchor: 'pl_lodge_dock', place: 'pinelake', label: 'Pine Lake Lodge' },
  mc_dock: { anchor: 'mc_dock', place: 'mesa', label: 'Mesa Logistics, Mesa City' },
  ts_dock: { anchor: 'ts_dock', place: 'coyote', label: 'Coyote Flats Travel Center' },
};

export interface CargoTemplate {
  name: string;
  client: string;
  /** Crate size (m) and mass range per crate (kg). */
  dims: [number, number, number];
  mass: [number, number];
  count: [number, number];
  fragile?: boolean;
  refrigerated?: boolean;
}

export const CARGO_TEMPLATES: CargoTemplate[] = [
  { name: 'Hardware supplies', client: 'Pine Lake Lodge', dims: [0.6, 0.45, 0.4], mass: [45, 62], count: [2, 4] },
  { name: 'Canned goods', client: 'General store', dims: [0.5, 0.4, 0.35], mass: [28, 38], count: [3, 6] },
  { name: 'Engine parts', client: 'Diesel shop', dims: [0.5, 0.4, 0.35], mass: [55, 75], count: [1, 3] },
  { name: 'Bedding & linens', client: 'Lodge housekeeping', dims: [0.8, 0.6, 0.6], mass: [8, 14], count: [3, 6] },
  { name: 'Craft beer kegs', client: 'Taproom', dims: [0.45, 0.45, 0.6], mass: [55, 62], count: [2, 3] },
  { name: 'Pottery and glassware', client: 'Gift shop', dims: [0.55, 0.45, 0.45], mass: [14, 22], count: [2, 4], fragile: true },
  { name: 'Fresh pies', client: 'Cafe', dims: [0.4, 0.3, 0.2], mass: [5, 8], count: [2, 4], refrigerated: true },
  { name: 'Camping chairs (boxed)', client: 'Outfitters', dims: [0.9, 0.4, 0.3], mass: [10, 15], count: [3, 6] },
  { name: 'Books and records', client: 'Thrift store', dims: [0.45, 0.35, 0.3], mass: [20, 28], count: [2, 5] },
  { name: 'Solar panels (boxed)', client: 'Off-grid installer', dims: [1.6, 0.85, 0.12], mass: [16, 22], count: [2, 4], fragile: true },
];

export interface BoardDef {
  id: string;
  name: string;
  place: string;
  /** Deliveries picked up at this dock. */
  dock: string;
  /** Delivery destinations. */
  destinations: string[];
  /** Pay multiplier (bigger towns pay better). */
  payMul: number;
  /** Max number of delivery offers per day. */
  deliveries: number;
  /** Odd job ids offered here. */
  oddJobs: string[];
}

export const BOARDS: Record<string, BoardDef> = {
  dj_board: {
    id: 'dj_board', name: 'Post & Freight job board', place: 'dusty', dock: 'dj_dock',
    destinations: ['pl_lodge_dock', 'mc_dock', 'ts_dock'], payMul: 1, deliveries: 3, oddJobs: ['dj_litter'],
  },
  pl_board: {
    id: 'pl_board', name: 'Ranger notice board', place: 'pinelake', dock: 'pl_lodge_dock',
    destinations: ['mc_dock', 'dj_dock'], payMul: 1, deliveries: 2, oddJobs: ['pl_firewood', 'pl_trail'],
  },
  mc_board: {
    id: 'mc_board', name: 'Mesa Logistics job board', place: 'mesa', dock: 'mc_dock',
    destinations: ['dj_dock', 'pl_lodge_dock', 'ts_dock'], payMul: 1.2, deliveries: 4, oddJobs: ['mc_unload'],
  },
};

export interface OddJobDef {
  id: string;
  title: string;
  place: string;
  description: string;
  mechanic: 'visit' | 'carry';
  /** visit: target points. carry: pickup points then the drop point (last). */
  points: [number, number][];
  drop?: [number, number];
  /** Game minutes per step. */
  minutesPer: number;
  pay: number;
  energyPerStep: number;
  hygienePerStep: number;
  carryModel?: string;
}

export const ODD_JOBS: Record<string, OddJobDef> = {
  dj_litter: {
    id: 'dj_litter', title: 'Clean up the fuel station lot', place: 'dusty',
    description: 'Pick up litter around Junction Fuel & Wash. Six spots, about an hour.',
    mechanic: 'visit',
    points: [[-856, 664], [-822, 664], [-848, 684], [-818, 682], [-862, 676], [-806, 672]],
    minutesPer: 10, pay: 34, energyPerStep: 1.6, hygienePerStep: 1.6,
  },
  pl_firewood: {
    id: 'pl_firewood', title: 'Stack firewood at the campground', place: 'pl_camp',
    description: 'Carry five bundles from the woodpile to the rack by the camp office.',
    mechanic: 'carry', points: [[88, -1108], [90, -1111], [86, -1112], [89, -1106], [87, -1110]], drop: [46, -1104],
    minutesPer: 12, pay: 42, energyPerStep: 2.4, hygienePerStep: 2, carryModel: 'firewood',
  },
  pl_trail: {
    id: 'pl_trail', title: 'Clear the Eagle Rock trail', place: 'pinelake',
    description: 'Clear fallen branches at four spots along the trail up to Eagle Rock.',
    mechanic: 'visit', points: [[-201, -990], [-190, -963], [-178, -945], [-171, -934]],
    minutesPer: 15, pay: 46, energyPerStep: 2.5, hygienePerStep: 2.2,
  },
  mc_unload: {
    id: 'mc_unload', title: 'Unload a delivery truck', place: 'mesa',
    description: 'Carry six boxes from the parked truck to the logistics dock.',
    mechanic: 'carry', points: [[1318, 314], [1319, 316], [1317, 312], [1318, 318], [1320, 314], [1316, 316]],
    drop: [1301, 330], minutesPer: 8, pay: 56, energyPerStep: 1.8, hygienePerStep: 1.5, carryModel: 'crate',
  },
  dex_solar: {
    id: 'dex_solar', title: "Help Dex fix his solar wiring", place: 'any',
    description: 'Check three connections around Dex’s van.', mechanic: 'visit', points: [],
    minutesPer: 15, pay: 50, energyPerStep: 1.2, hygienePerStep: 1,
  },
};

export interface RemoteGig {
  id: string;
  title: string;
  description: string;
  minSignal: number;
  perHour: number;
}

export const REMOTE_GIGS: RemoteGig[] = [
  { id: 'data_entry', title: 'Data entry', description: 'Slow, steady and forgiving of bad signal.', minSignal: 1, perHour: 13 },
  { id: 'support_chat', title: 'Customer support chat', description: 'Needs a stable connection.', minSignal: 2, perHour: 17 },
  { id: 'web_qa', title: 'Website testing', description: 'Good pay, needs strong signal.', minSignal: 3, perHour: 22 },
];

// ───────────────────────── NPC travelers ─────────────────────────

export interface NpcStop { place: string; site?: string; x: number; z: number; heading: number }

export interface NpcDef {
  id: string;
  name: string;
  vehicle: 'vintage' | 'vanlife' | 'semi';
  look: { skin: string; hair: string; hairStyle: number; shirt: string; pants: string };
  intro: string;
  /** Location per day of week (0 = Monday). null = on the road. */
  week: (NpcStop | null)[];
}

const MARGE_PL: NpcStop = { place: 'pl_camp', site: 'P2', x: 116, z: -1224, heading: -Math.PI / 2 };
const MARGE_MC: NpcStop = { place: 'mesa_resort', site: 'M3', x: 1205, z: 560, heading: Math.PI / 2 };
const MARGE_RR: NpcStop = { place: 'redrock', site: 'R2', x: -1408, z: 530, heading: 1.2 };
const DEX_RR: NpcStop = { place: 'redrock', site: 'R1', x: -1380, z: 500, heading: 0.3 };
const DEX_TS: NpcStop = { place: 'coyote', site: 'T2', x: 190, z: 972, heading: Math.PI / 2 };
const DEX_PL: NpcStop = { place: 'pl_camp', site: 'P6', x: 144, z: -1224, heading: Math.PI / 2 };
const HANK_TS: NpcStop = { place: 'coyote', site: 'T3', x: 172, z: 992, heading: Math.PI / 2 };

export const NPCS: Record<string, NpcDef> = {
  marge: {
    id: 'marge', name: 'Marge', vehicle: 'vintage',
    look: { skin: '#e8c4a8', hair: '#d8d8d8', hairStyle: 2, shirt: '#c85a7a', pants: '#4a5a7a' },
    intro: 'A retired full-timer with a vintage motorhome and a three-legged dog named Biscuit.',
    week: [MARGE_PL, MARGE_PL, MARGE_PL, MARGE_MC, MARGE_MC, MARGE_RR, MARGE_RR],
  },
  dex: {
    id: 'dex', name: 'Dex', vehicle: 'vanlife',
    look: { skin: '#8a5a3a', hair: '#2a1a10', hairStyle: 1, shirt: '#3a8a8a', pants: '#2a2a2a' },
    intro: 'A young van-lifer who works remotely and chases good signal and better sunsets.',
    week: [DEX_RR, DEX_RR, DEX_TS, DEX_TS, DEX_PL, DEX_PL, DEX_PL],
  },
  hank: {
    id: 'hank', name: 'Hank', vehicle: 'semi',
    look: { skin: '#d8a888', hair: '#6a4a2a', hairStyle: 3, shirt: '#8a2a2a', pants: '#3a4a5a' },
    intro: 'A long-haul trucker who has seen every scale house in three states.',
    week: [HANK_TS, null, HANK_TS, null, HANK_TS, null, HANK_TS],
  },
};

// ───────────────────────── Events ─────────────────────────

export interface EventDef {
  id: string;
  name: string;
  place: string;
  /** Day of week (0 = Monday). */
  weekday: number;
  startHour: number;
  endHour: number;
  x: number;
  z: number;
  description: string;
}

export const EVENTS: EventDef[] = [
  {
    id: 'farmers_market', name: 'Farmers Market', place: 'mesa', weekday: 5, startHour: 8, endHour: 14, x: 1176, z: 245,
    description: 'Saturday mornings in the Mesa City plaza: cheap local produce and live music.',
  },
  {
    id: 'campfire_night', name: 'Campfire Night', place: 'pl_camp', weekday: 4, startHour: 19, endHour: 23, x: 162, z: -1312,
    description: 'Friday evenings at the Pine Lake Campground fire circle. Everyone is welcome.',
  },
];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
