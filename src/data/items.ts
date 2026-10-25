import type { FamilySpec, ItemDef, MaterialSlotDef, SurfaceKind } from './types';

// Item catalog. Masses, sizes and capacities are internally consistent:
// stored volume defaults to the packed box (l*w*h), so a mattress is light
// but bulky and a battery is compact but heavy.

function slot(id: string, surfaces: SurfaceKind[], mat: string, color?: string): MaterialSlotDef {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), surfaces,
    default: { mat, ...(color ? { color } : {}) },
  };
}

const cabinetSlots = () => [
  slot('carcass', ['cabinet'], 'cab_white_oak'),
  slot('fronts', ['cabinet'], 'paint_satin', '#f6f3ec'),
  slot('handles', ['metal'], 'metal_black'),
];
const bedding = () => [
  slot('frame', ['frame'], 'cab_white_oak'),
  slot('bedding', ['upholstery'], 'uph_linen'),
];
const top = () => slot('top', ['counter', 'cabinet'], 'cab_white_oak');
const base = () => slot('base', ['metal'], 'metal_nickel');

const L: ItemDef[] = [
  // ───────────── Groceries ─────────────
  {
    id: 'canned_chili', name: 'Canned chili (2 cans)', category: 'grocery', price: 5.5, mass: 0.9,
    dims: [0.2, 0.1, 0.12], description: 'Shelf-stable. Better heated, but edible cold in a pinch.',
    food: { servings: 2, kind: 'cook', hunger: 34, mood: 1, cookMinutes: 15 }, model: 'can', color: '#c0442c',
  },
  {
    id: 'pasta_kit', name: 'Pasta & sauce', category: 'grocery', price: 6, mass: 1.1,
    dims: [0.25, 0.12, 0.1], description: 'Three hearty pasta dinners. Needs a stove and some water.',
    food: { servings: 3, kind: 'cook', hunger: 44, mood: 3, cookMinutes: 25 }, model: 'box', color: '#e0b04a',
  },
  {
    id: 'eggs_bread', name: 'Eggs & bread', category: 'grocery', price: 7, mass: 1.3,
    dims: [0.3, 0.15, 0.12], description: 'Four good breakfasts. Perishable: keep it in a powered fridge.',
    food: { servings: 4, kind: 'cook', hunger: 30, mood: 3, perishable: true, shelfHours: 30, cookMinutes: 12 },
    model: 'box', color: '#f2dfae',
  },
  {
    id: 'fresh_produce', name: 'Fresh vegetables', category: 'grocery', price: 8, mass: 2.0,
    dims: [0.35, 0.25, 0.15], description: 'Four servings of salad and stir-fry. Spoils quickly without a fridge.',
    food: { servings: 4, kind: 'cook', hunger: 32, mood: 5, perishable: true, shelfHours: 36, cookMinutes: 20 },
    model: 'produce', color: '#5fa04e',
  },
  {
    id: 'instant_noodles', name: 'Instant noodles (6)', category: 'grocery', price: 4, mass: 0.6,
    dims: [0.3, 0.2, 0.12], description: 'Cheap, light, quick. Needs hot water.',
    food: { servings: 6, kind: 'cook', hunger: 24, mood: 0, cookMinutes: 6 }, model: 'box', color: '#d9583a',
  },
  {
    id: 'snack_bars', name: 'Trail mix & bars', category: 'grocery', price: 6, mass: 0.6,
    dims: [0.2, 0.15, 0.1], description: 'Six quick snacks. No cooking needed.',
    food: { servings: 6, kind: 'snack', hunger: 12, mood: 1 }, model: 'box', color: '#9a6a3a',
  },
  {
    id: 'fruit', name: 'Apples & bananas', category: 'grocery', price: 5, mass: 1.5,
    dims: [0.3, 0.2, 0.15], description: 'Six pieces of fruit. Keeps a few days outside the fridge.',
    food: { servings: 6, kind: 'snack', hunger: 10, mood: 2, perishable: true, shelfHours: 96 },
    model: 'produce', color: '#e8c33c',
  },
  {
    id: 'deli_sandwich', name: 'Deli sandwich', category: 'grocery', price: 7.5, mass: 0.35,
    dims: [0.2, 0.12, 0.06], description: 'A ready meal. Eat it today.',
    food: { servings: 1, kind: 'ready', hunger: 36, mood: 2, perishable: true, shelfHours: 20 },
    model: 'box', color: '#d8b07a',
  },
  {
    id: 'trout', name: 'Fresh trout', category: 'grocery', price: 9, mass: 0.6,
    dims: [0.35, 0.12, 0.06], description: 'Caught in Pine Lake. Delicious pan-fried.',
    food: { servings: 2, kind: 'cook', hunger: 40, mood: 7, perishable: true, shelfHours: 18, cookMinutes: 20 },
    model: 'fish', color: '#8fa7b8',
  },
  {
    id: 'market_basket', name: 'Farmers market basket', category: 'grocery', price: 11, mass: 2.6,
    dims: [0.4, 0.3, 0.2], description: 'Local produce, cheese and bread. Five excellent meals.',
    food: { servings: 5, kind: 'cook', hunger: 42, mood: 8, perishable: true, shelfHours: 40, cookMinutes: 20 },
    model: 'produce', color: '#c98a3d',
  },

  // ───────────── Supplies ─────────────
  {
    id: 'butane', name: 'Butane canister', category: 'supply', price: 4, mass: 0.36,
    dims: [0.2, 0.07, 0.07], description: 'Fuel for butane camp stoves. About 8 meals per canister.',
    features: { butane: { uses: 8 } }, model: 'canister', color: '#d8d0c4',
  },
  {
    id: 'water_jug', name: 'Water jug (20 L)', category: 'supply', price: 4, mass: 20.6,
    dims: [0.38, 0.25, 0.3], description: 'Twenty liters of drinking water. Can be poured into the fresh tank anywhere.',
    features: { waterJug: { liters: 20 } }, model: 'jug', color: '#5aa7d6',
  },
  {
    id: 'firewood', name: 'Firewood bundle', category: 'supply', price: 8, mass: 9,
    dims: [0.45, 0.3, 0.25], description: 'For campfires at sites with a fire ring.',
    features: { firewood: true }, model: 'firewood', color: '#8a5a32',
  },

  // ───────────── Personal belongings ─────────────
  {
    id: 'clothes', name: 'Clothes & personal items', category: 'personal', price: 0, mass: 16,
    dims: [0.7, 0.45, 0.3], description: 'Your wardrobe, toiletries and odds and ends.', model: 'duffel', color: '#4f6d8a',
    sellable: false,
  },
  {
    id: 'kitchenware', name: 'Pots, pans & dishes', category: 'personal', price: 45, mass: 7,
    dims: [0.45, 0.35, 0.2], description: 'Needed to cook proper meals.', model: 'box', color: '#9aa3a8',
  },
  {
    id: 'bedding', name: 'Spare bedding', category: 'personal', price: 30, mass: 5,
    dims: [0.6, 0.4, 0.3], description: 'Blankets and pillows. Bulky.', model: 'duffel', color: '#c07a8a',
  },
  {
    id: 'books', name: 'Box of books', category: 'personal', price: 20, mass: 9,
    dims: [0.4, 0.3, 0.25], description: 'Heavy, but a good evening read.',
    features: { activity: { kind: 'book', minutes: 60, mood: 6 } }, model: 'box', color: '#b5835a',
  },
  {
    id: 'guitar', name: 'Old guitar', category: 'personal', price: 60, mass: 4,
    dims: [1.05, 0.4, 0.14], description: 'Play a little music at camp.',
    features: { activity: { kind: 'guitar', minutes: 45, mood: 9 } }, model: 'guitar', color: '#a8642c',
  },
  {
    id: 'laptop', name: 'Old laptop', category: 'personal', price: 120, mass: 2.4,
    dims: [0.38, 0.26, 0.04], description: 'Enables remote work. Needs power and cell signal.',
    features: { laptop: true }, model: 'laptop', color: '#3c4148',
  },

  // ───────────── Tools & gear ─────────────
  {
    id: 'water_hose', name: 'Drinking water hose', category: 'tool', price: 25, mass: 2.2,
    dims: [0.4, 0.4, 0.12], description: 'Required to fill tanks or connect city water.',
    features: { tool: 'water_hose' }, model: 'hose', color: '#e8e4dc',
  },
  {
    id: 'sewer_kit', name: 'Sewer hose kit', category: 'tool', price: 40, mass: 3.5,
    dims: [0.8, 0.2, 0.2], description: 'Required to dump gray and black tanks at a dump station.',
    features: { tool: 'sewer_kit' }, model: 'sewerhose', color: '#8b8f5a',
  },
  {
    id: 'power_cord', name: 'Shore power cord', category: 'tool', price: 60, mass: 6,
    dims: [0.45, 0.45, 0.15], description: 'Plugs your RV into campground power pedestals.',
    features: { tool: 'power_cord' }, model: 'cord', color: '#e0b030',
  },
  {
    id: 'cargo_straps', name: 'Cargo straps (4)', category: 'tool', price: 25, mass: 2,
    dims: [0.3, 0.2, 0.1], description: 'Secures loose cargo on the floor before driving.',
    features: { tool: 'straps' }, model: 'straps', color: '#e06a2c',
  },
  {
    id: 'leveling_blocks', name: 'Leveling blocks', category: 'tool', price: 35, mass: 6,
    dims: [0.45, 0.25, 0.2], description: 'Level the RV on uneven ground for a good night’s sleep.',
    features: { tool: 'leveling_blocks' }, model: 'blocks', color: '#e8c33c',
  },
  {
    id: 'tool_kit', name: 'Basic tool kit', category: 'tool', price: 85, mass: 8,
    dims: [0.5, 0.25, 0.2], description: 'Enables DIY maintenance with parts kits.',
    features: { tool: 'toolkit' }, model: 'toolbox', color: '#c23a2c',
  },

  // ───────────── Parts (DIY) ─────────────
  {
    id: 'engine_kit', name: 'Engine tune-up kit', category: 'part', price: 70, mass: 4,
    dims: [0.35, 0.25, 0.15], description: 'Plugs, filters and oil. DIY: engine +22% (up to 78%).',
    features: { part: { component: 'engine', amount: 0.22, cap: 0.78 } }, model: 'box', color: '#3c6e9e',
  },
  {
    id: 'brake_kit', name: 'Brake pads & fluid', category: 'part', price: 55, mass: 5,
    dims: [0.3, 0.25, 0.15], description: 'DIY: brakes +25% (up to 80%).',
    features: { part: { component: 'brakes', amount: 0.25, cap: 0.8 } }, model: 'box', color: '#9e3c3c',
  },
  {
    id: 'suspension_kit', name: 'Steering & suspension kit', category: 'part', price: 90, mass: 7,
    dims: [0.5, 0.3, 0.2], description: 'Bushings and tie-rod ends. DIY: steering +20% (up to 75%).',
    features: { part: { component: 'steering', amount: 0.2, cap: 0.75 } }, model: 'box', color: '#5a5a5a',
  },
  {
    id: 'appliance_kit', name: 'Appliance repair kit', category: 'part', price: 40, mass: 2,
    dims: [0.3, 0.2, 0.1], description: 'Seals, igniters and fuses. DIY: appliances +25% (up to 80%).',
    features: { part: { component: 'appliances', amount: 0.25, cap: 0.8 } }, model: 'box', color: '#6a8a5a',
  },

  // ───────────── Beds & mattresses ─────────────
  {
    id: 'van_bed', name: 'Van bed platform', category: 'furniture', price: 220, mass: 32,
    dims: [1.88, 1.3, 0.3], description: 'Raised platform across the rear. Takes a van-size mattress.',
    floor: { footprint: [1.88, 1.3], height: 0.9, access: [0.6, 0.4], flatpack: true },
    features: { bed: { quality: 0.55, usesMattress: true, mattressSize: 'van' } }, model: 'bed', color: '#b88a5a',
    slots: bedding(),
  },
  {
    id: 'double_bed', name: 'Double bed frame', category: 'furniture', price: 380, mass: 45,
    dims: [2.28, 1.4, 0.35], description: 'Full-width rear bed with lift-up frame. Takes a double mattress.',
    floor: { footprint: [2.28, 1.4], height: 0.6, access: [0.6, 0.45], flatpack: true },
    features: { bed: { quality: 0.6, usesMattress: true, mattressSize: 'double' } }, model: 'bed', color: '#a87a4a',
    slots: bedding(),
  },
  {
    id: 'foam_van', name: 'Foam mattress (van)', category: 'mattress', price: 120, mass: 12,
    dims: [1.85, 1.25, 0.12], description: 'Basic foam. Sleep quality 70%.',
    features: { mattress: { quality: 0.7, size: 'van' } }, model: 'mattress', color: '#d8d4c8',
  },
  {
    id: 'memory_van', name: 'Memory foam mattress (van)', category: 'mattress', price: 240, mass: 15,
    dims: [1.3, 0.42, 0.42], description: 'Ships rolled. Sleep quality 95%.',
    features: { mattress: { quality: 0.95, size: 'van' } }, model: 'mattress', color: '#e8e6f0',
  },
  {
    id: 'foam_double', name: 'Foam mattress (double)', category: 'mattress', price: 150, mass: 16,
    dims: [2.2, 1.35, 0.14], description: 'Basic foam. Sleep quality 75%.',
    features: { mattress: { quality: 0.75, size: 'double' } }, model: 'mattress', color: '#d8d4c8',
  },
  {
    id: 'hybrid_double', name: 'Hybrid spring mattress (double)', category: 'mattress', price: 520, mass: 30,
    dims: [2.2, 1.35, 0.26], description: 'Premium comfort, heavy and very bulky. Sleep quality 115%.',
    features: { mattress: { quality: 1.15, size: 'double' } }, model: 'mattress', color: '#f0ece0',
  },
  {
    id: 'memory_double', name: 'Memory foam mattress (double)', category: 'mattress', price: 330, mass: 21,
    dims: [1.4, 0.48, 0.48], description: 'Ships rolled. Sleep quality 100%.',
    features: { mattress: { quality: 1.0, size: 'double' } }, model: 'mattress', color: '#e8e6f0',
  },

  // ───────────── Galleys & appliances ─────────────
  {
    id: 'van_galley', name: 'Van galley (sink + butane burner)', category: 'appliance', price: 380, mass: 26,
    dims: [1.1, 0.55, 0.9], description: 'Counter with a sink and a single butane burner. Cabinet below.',
    floor: {
      footprint: [1.1, 0.55], height: 0.9, access: [0.8, 0.5], plumbing: true,
      againstWall: true, flatpack: true,
    },
    storage: { liters: 60, maxKg: 25, secure: true, maxDim: 0.55 },
    features: { galley: { sink: true, stove: 'butane' } }, model: 'galley', color: '#c9a77a',
    slots: [...cabinetSlots(), slot('counter', ['counter'], 'counter_butcher')],
  },
  {
    id: 'propane_galley', name: 'RV galley (sink + 3-burner + oven)', category: 'appliance', price: 620, mass: 46,
    dims: [1.6, 0.6, 0.92], description: 'Full kitchen on the propane system, with cabinets below.',
    floor: {
      footprint: [1.6, 0.6], height: 0.92, access: [1.0, 0.5], plumbing: true,
      againstWall: true, flatpack: true, propane: true,
    },
    storage: { liters: 120, maxKg: 45, secure: true, maxDim: 0.6 },
    features: { galley: { sink: true, stove: 'propane' } }, model: 'galley', color: '#b8956a',
    slots: [...cabinetSlots(), slot('counter', ['counter'], 'counter_butcher')],
  },
  {
    id: 'induction_galley', name: 'Induction galley (sink + induction)', category: 'appliance', price: 560, mass: 29,
    dims: [1.1, 0.55, 0.9], description: 'No gas needed. Draws 1.8 kW while cooking: shore power or a big inverter + battery.',
    floor: {
      footprint: [1.1, 0.55], height: 0.9, access: [0.8, 0.5], plumbing: true,
      againstWall: true, flatpack: true, ac: { watts: 1800, minInverter: 2000 },
    },
    storage: { liters: 60, maxKg: 25, secure: true, maxDim: 0.55 },
    features: { galley: { sink: true, stove: 'induction' } }, model: 'galley', color: '#d8d0c0',
    slots: [...cabinetSlots(), slot('counter', ['counter'], 'counter_butcher')],
  },
  {
    id: 'cooler_fridge', name: '12 V compressor fridge (40 L)', category: 'appliance', price: 300, mass: 16,
    dims: [0.6, 0.45, 0.55], description: 'Efficient chest fridge. About 18 W average.',
    floor: { footprint: [0.6, 0.45], height: 0.55, access: [0.5, 0.5], againstWall: true },
    storage: { liters: 40, maxKg: 30, secure: true, refrigerated: true, maxDim: 0.45 },
    features: { fridge: { liters: 40, mode: '12v', watts: 18 } }, model: 'fridge', color: '#e8eef2',
    slots: [slot('body', ['appliance'], 'app_white')],
  },
  {
    id: 'fridge_75', name: '12 V upright fridge (75 L)', category: 'appliance', price: 620, mass: 28,
    dims: [0.5, 0.55, 0.95], description: 'More food storage, more power: about 27 W average.',
    floor: { footprint: [0.5, 0.55], height: 0.95, access: [0.5, 0.55], againstWall: true },
    storage: { liters: 75, maxKg: 45, secure: true, refrigerated: true, maxDim: 0.5 },
    features: { fridge: { liters: 75, mode: '12v', watts: 27 } }, model: 'fridge', color: '#eef2f4',
    slots: [slot('body', ['appliance'], 'app_white')],
  },
  {
    id: 'threeway_fridge', name: '3-way RV fridge (170 L)', category: 'appliance', price: 900, mass: 50,
    dims: [0.6, 0.62, 1.6], description: 'Runs on propane off-grid or on shore power. Big capacity.',
    floor: { footprint: [0.6, 0.62], height: 1.6, access: [0.6, 0.55], againstWall: true, propane: true },
    storage: { liters: 170, maxKg: 70, secure: true, refrigerated: true, maxDim: 0.6 },
    features: { fridge: { liters: 170, mode: '3way', watts: 150, propaneKgPerDay: 0.32 } }, model: 'fridge', color: '#f0f0ec',
    slots: [slot('body', ['appliance'], 'app_white')],
  },
  {
    id: 'cassette_toilet', name: 'Cassette toilet (19 L)', category: 'appliance', price: 160, mass: 12,
    dims: [0.42, 0.48, 0.45], description: 'Self-contained. Empty the cassette at a dump station.',
    floor: { footprint: [0.42, 0.48], height: 0.45, access: [0.42, 0.5] },
    features: { toilet: { kind: 'cassette', cassetteLiters: 19 } }, model: 'toilet', color: '#f2f2f2',
    slots: [slot('body', ['appliance'], 'app_white')],
  },
  {
    id: 'composting_toilet', name: 'Composting toilet', category: 'appliance', price: 950, mass: 15,
    dims: [0.5, 0.5, 0.52], description: 'Produces no black water. A small 3 W fan runs constantly.',
    floor: { footprint: [0.5, 0.5], height: 0.52, access: [0.5, 0.5] },
    features: { toilet: { kind: 'composting' }, fan: { watts: 3 } }, model: 'toilet', color: '#e8dcc0',
    slots: [slot('body', ['appliance'], 'app_white')],
  },
  {
    id: 'wet_bath', name: 'Wet bath (toilet + shower)', category: 'appliance', price: 1400, mass: 85,
    dims: [0.9, 0.82, 2.0], description: 'Enclosed bathroom. Shower uses ~22 L fresh water; toilet drains to the black tank.',
    floor: {
      footprint: [0.9, 0.82], height: 2.0, access: [0.6, 0.5], plumbing: true, needsBlackTank: true,
      flatpack: true,
    },
    features: { toilet: { kind: 'plumbed' }, shower: { liters: 22, heater: 'propane' } }, model: 'wetbath', color: '#f4f4f0',
    slots: [slot('body', ['appliance'], 'app_white')],
  },
  {
    id: 'outdoor_shower', name: 'Outdoor shower kit', category: 'appliance', price: 80, mass: 3,
    dims: [0.4, 0.3, 0.15], description: 'Rinse off outside (10 L, no gray water). Not allowed in town lots.',
    features: { outdoorShower: { liters: 10 } }, model: 'box', color: '#3a8ab8',
  },

  // ───────────── Furniture ─────────────
  {
    id: 'dinette', name: 'Dinette (benches + table)', category: 'furniture', price: 450, mass: 60,
    dims: [1.8, 1.0, 0.9], description: 'Seats, a work table and bench storage. Converts to a small bed.',
    floor: {
      footprint: [1.8, 1.0], height: 0.9, access: [0.8, 0.4], flatpack: true,
      states: [
        { id: 'dinette', label: 'Dinette', footprint: [1.8, 1], height: 0.9, travel: true },
        { id: 'bed', label: 'Bed', footprint: [1.8, 1], height: 0.55, bed: true, travel: false },
      ],
    },
    storage: { liters: 100, maxKg: 40, secure: true, maxDim: 0.7 },
    features: { seat: { comfort: 2 }, table: { workMul: 1 }, bed: { quality: 0.5, usesMattress: false } },
    model: 'dinette', color: '#7a8a6a',
    slots: [
      slot('cushions', ['upholstery'], 'uph_linen'),
      slot('frame', ['frame'], 'cab_white_oak'),
      slot('table', ['counter'], 'counter_butcher'),
    ],
  },
  {
    id: 'folding_table', name: 'Folding wall table', category: 'furniture', price: 60, mass: 7,
    dims: [0.7, 0.5, 0.06], description: 'A proper work surface that folds flat when not in use.',
    floor: {
      footprint: [0.7, 0.1], height: 0.75, access: [0.6, 0.5], flatpack: true, againstWall: true,
      states: [
        { id: 'folded', label: 'Folded', footprint: [0.7, 0.1], height: 0.75, travel: true },
        { id: 'open', label: 'Open', footprint: [0.7, 0.6], height: 0.75, travel: false },
      ],
    },
    features: { table: { workMul: 1 }, comfort: 1 }, model: 'table', color: '#c9a77a',
    slots: [top(), slot('legs', ['metal'], 'metal_black')],
  },
  {
    id: 'swivel_chair', name: 'Compact swivel chair', category: 'furniture', price: 140, mass: 12,
    dims: [0.55, 0.55, 0.85], description: 'A comfy seat for reading and working.',
    floor: { footprint: [0.55, 0.55], height: 0.85, access: [0.5, 0.4] },
    features: { seat: { comfort: 3 }, comfort: 2 }, model: 'chair', color: '#5a7a9a',
    slots: [
      slot('upholstery', ['upholstery'], 'uph_linen', '#5a7a9a'),
      slot('base', ['metal'], 'metal_black'),
    ],
  },
  {
    id: 'small_cabinet', name: 'Small storage cabinet', category: 'furniture', price: 110, mass: 18,
    dims: [0.6, 0.4, 0.9], description: '80 L of secure storage.',
    floor: { footprint: [0.6, 0.4], height: 0.9, access: [0.6, 0.5] },
    storage: { liters: 80, maxKg: 30, secure: true, maxDim: 0.6 }, model: 'cabinet', color: '#b88a5a',
  },
  {
    id: 'tall_cabinet', name: 'Tall pantry cabinet', category: 'furniture', price: 190, mass: 30,
    dims: [0.6, 0.45, 1.8], description: '180 L of secure storage, floor to ceiling.',
    floor: { footprint: [0.6, 0.45], height: 1.8, access: [0.6, 0.5] },
    storage: { liters: 180, maxKg: 50, secure: true, maxDim: 0.6 }, model: 'cabinet', color: '#a87a4a',
  },
  {
    id: 'wardrobe', name: 'Wardrobe', category: 'furniture', price: 210, mass: 30,
    dims: [0.6, 0.6, 1.9], description: 'Hanging space and shelves: 250 L.',
    floor: { footprint: [0.6, 0.6], height: 1.9, access: [0.6, 0.5] },
    storage: { liters: 250, maxKg: 50, secure: true, maxDim: 0.6 }, model: 'cabinet', color: '#9a6e46',
  },
  {
    id: 'bookshelf', name: 'Wall bookshelf', category: 'furniture', price: 70, mass: 10,
    dims: [0.7, 0.3, 1.0], description: 'Lipped shelves (40 L). Makes the place feel like home.',
    floor: { footprint: [0.7, 0.3], height: 1.0, access: [0.5, 0.4], flatpack: true },
    storage: { liters: 40, maxKg: 20, secure: true, maxDim: 0.4 },
    features: { comfort: 2 }, model: 'shelf', color: '#b88a5a',
    slots: [slot('carcass', ['cabinet'], 'cab_white_oak')],
  },
  {
    id: 'rug', name: 'Cozy rug', category: 'furniture', price: 63.75, mass: 2.025,
    dims: [0.8, 0.2, 0.2], description: 'Soft underfoot. Rugs can lie in walkways.',
    floor: { footprint: [0.9, 1.5], height: 0.01, flat: true },
    features: { comfort: 2 }, model: 'rug', color: '#b84a3a',
    family: { id: 'rug', defaults: { size: 'm' }, options: { size: ['s', 'm', 'l', 'runner'] } },
    slots: [slot('rug', ['rug'], 'rug_kilim', '#b84a3a')],
  },
  {
    id: 'plant', name: 'Potted plant', category: 'furniture', price: 25, mass: 4,
    dims: [0.3, 0.3, 0.6], description: 'A little green on the road.',
    floor: { footprint: [0.3, 0.3], height: 0.6 }, features: { comfort: 1 }, model: 'plant', color: '#3f8a4a',
  },

  // ───────────── Systems (slots) ─────────────
  {
    id: 'agm_battery', name: 'AGM battery 100 Ah', category: 'system', price: 190, mass: 29,
    dims: [0.33, 0.17, 0.22], description: '600 Wh usable. Heavy for its size.',
    slot: { kind: 'battery', size: 1 }, features: { battery: { wh: 600 } }, model: 'battery', color: '#2c2c30',
  },
  {
    id: 'lithium_battery', name: 'Lithium battery 100 Ah', category: 'system', price: 680, mass: 13,
    dims: [0.33, 0.17, 0.22], description: '1200 Wh usable at less than half the weight of AGM.',
    slot: { kind: 'battery', size: 1 }, features: { battery: { wh: 1200 } }, model: 'battery', color: '#2a6aa8',
  },
  {
    id: 'solar_100', name: '100 W solar panel', category: 'system', price: 160, mass: 8,
    dims: [1.0, 0.68, 0.04], description: 'Roof-mounted. About 0.5 kWh on a sunny day.',
    slot: { kind: 'roof', size: 0.7 }, features: { solar: { watts: 100 } }, model: 'solar', color: '#1c2a4a',
  },
  {
    id: 'solar_200', name: '200 W solar panel', category: 'system', price: 290, mass: 13,
    dims: [1.6, 0.8, 0.04], description: 'Roof-mounted. About 1 kWh on a sunny day.',
    slot: { kind: 'roof', size: 1.3 }, features: { solar: { watts: 200 } }, model: 'solar', color: '#1c2a4a',
  },
  {
    id: 'roof_fan', name: 'Roof vent fan', category: 'system', price: 160, mass: 4,
    dims: [0.4, 0.4, 0.15], description: 'Moves air at night: better sleep in the desert. 20 W at night.',
    slot: { kind: 'roof', size: 0.25 }, features: { fan: { watts: 20 }, comfort: 2 }, model: 'fan', color: '#e8e8e8',
  },
  {
    id: 'inverter', name: '2000 W inverter', category: 'system', price: 320, mass: 6,
    dims: [0.4, 0.22, 0.12], description: 'Runs 120 V appliances (like induction) from the battery. 10 W idle.',
    slot: { kind: 'electronics', size: 1 }, features: { inverter: { watts: 2000, idleW: 10 } }, model: 'box', color: '#3a3a3a',
  },
  {
    id: 'signal_booster', name: 'Cell signal booster', category: 'system', price: 240, mass: 2,
    dims: [0.3, 0.2, 0.08], description: '+2 bars of cell signal for remote work. 8 W while working.',
    slot: { kind: 'electronics', size: 1 }, features: { booster: { bars: 2, watts: 8 } }, model: 'box', color: '#3a5a7a',
  },
  {
    id: 'string_lights', name: 'Warm string lights', category: 'system', price: 30, mass: 0.5,
    dims: [0.2, 0.2, 0.1], description: 'Cozy evenings. 6 W at night.',
    slot: { kind: 'electronics', size: 1 }, features: { lights: { watts: 6 }, comfort: 2 }, model: 'box', color: '#f0c860',
  },
  {
    id: 'aux_tank', name: 'Auxiliary fresh tank (40 L)', category: 'system', price: 95, mass: 7,
    dims: [0.8, 0.4, 0.25], description: '+40 L fresh water. Remember: 40 kg more when full.',
    slot: { kind: 'tank', size: 1 }, features: { tank: { liters: 40 } }, model: 'tank', color: '#e8e8e0',
  },
  {
    id: 'generator', name: 'Built-in generator 2.8 kW', category: 'system', price: 1350, mass: 55,
    dims: [0.7, 0.55, 0.45], description: 'Runs on the main fuel tank (0.7 L/h). Needs a generator bay.',
    slot: { kind: 'generator', size: 1 }, features: { generator: { watts: 2800, fuelLph: 0.7 } }, model: 'generator', color: '#d8d8d0',
  },
  {
    id: 'awning', name: 'Roll-out awning', category: 'system', price: 480, mass: 25,
    dims: [3.2, 0.2, 0.2], description: 'Shade and a dry patio at camp.',
    slot: { kind: 'awning', size: 1 }, features: { awning: true, comfort: 1 }, model: 'awning', color: '#d86a3a',
  },

  // ───────────── Outdoor ─────────────
  {
    id: 'camp_chair', name: 'Folding camp chair', category: 'outdoor', price: 35, mass: 4,
    dims: [0.9, 0.18, 0.18], description: 'Set it up outside and enjoy the view.',
    features: { outdoor: { kind: 'chair' }, seat: { comfort: 2 } }, model: 'campchair', color: '#3a7a5a',
  },
  {
    id: 'camp_table', name: 'Folding camp table', category: 'outdoor', price: 60, mass: 7,
    dims: [0.9, 0.6, 0.08], description: 'Outdoor dining and a sunny workspace.',
    features: { outdoor: { kind: 'table' }, table: { workMul: 0.95 } }, model: 'camptable', color: '#c9a77a',
  },
];


function cabinet(id: string, name: string, family: FamilySpec, wall = false): ItemDef {
  const c = family.defaults;
  const w = c.w!, h = c.h!, d = c.d!;
  const hasTop = family.type === 'base' || family.type === 'drawers';
  return {
    id, name, category: 'furniture', price: 0, mass: 0, dims: [Math.max(w, h), d, 0.12],
    description: 'Configurable secure RV storage.', family,
    floor: {
      footprint: [w, d], height: h,
      access: [w, wall ? (family.type === 'shelf' ? 0.6 : 0.9) : 0.5],
      flatpack: true, againstWall: !wall,
      ...(wall ? {
        mount: 'wall',
        elevation: family.type === 'shelf' ? 1.2 : 1.45,
        elevationRange: [family.type === 'shelf' ? 0.9 : 1.3, 'clearance'],
      } : {}),
    },
    storage: { liters: 0, maxKg: wall ? 25 : 60, secure: true, maxDim: w },
    model: family.type === 'shelf' ? 'shelf' : 'cabinet',
    slots: family.type === 'shelf' ? [cabinetSlots()[0]] : [
      ...cabinetSlots(),
      ...(hasTop ? [
        slot(
          family.type === 'base' ? 'counter' : 'top',
          ['counter', 'cabinet'],
          family.type === 'base' ? 'counter_butcher' : 'cab_white_oak',
        ),
      ] : []),
    ],
  };
}

const cabinetOptions: FamilySpec['options'] = {
  drawers: [2, 3, 4, 5],
  shelves: [0, 1, 2, 3, 4, 5, 6],
  style: ['slab', 'shaker', 'louver', 'beadboard'],
  handle: ['bar', 'knob', 'cup', 'edge', 'latch'],
};

// ───────────── Configurable cabinets ─────────────
L.push(
  cabinet('cab_base', 'Base cabinet', {
    id: 'cabinet', type: 'base',
    w: [0.3, 1.2, 0.05], d: [0.4, 0.6, 0.05], h: [0.55, 0.95, 0.05],
    defaults: { w: 0.6, h: 0.9, d: 0.55, front: 'doors', shelves: 1, style: 'slab', handle: 'bar' },
    options: { ...cabinetOptions, front: ['doors', 'drawers', 'mixed', 'open'] },
  }),
  cabinet('cab_upper', 'Upper cabinet', {
    id: 'cabinet', type: 'upper',
    w: [0.3, 2.4, 0.05], d: [0.28, 0.38, 0.02], h: [0.3, 0.6, 0.05],
    defaults: { w: 0.8, h: 0.45, d: 0.33, front: 'doors', shelves: 1, style: 'slab', handle: 'bar' },
    options: { ...cabinetOptions, front: ['doors', 'glass', 'open'] },
  }, true),
  cabinet('cab_tall', 'Tall pantry', {
    id: 'cabinet', type: 'tall',
    w: [0.3, 0.7, 0.05], d: [0.35, 0.6, 0.05], h: [1.4, 'clearance', 0.05],
    defaults: { w: 0.5, h: 1.8, d: 0.5, front: 'doors', shelves: 4, style: 'slab', handle: 'bar' },
    options: { ...cabinetOptions, front: ['doors', 'glass'] },
  }),
  cabinet('cab_wardrobe', 'Wardrobe', {
    id: 'cabinet', type: 'wardrobe',
    w: [0.5, 1, 0.05], d: [0.5, 0.65, 0.05], h: [1.7, 'clearance', 0.05],
    defaults: { w: 0.6, h: 1.9, d: 0.6, front: 'doors', style: 'louver', handle: 'bar' },
    options: { ...cabinetOptions, front: ['doors'] },
  }),
  cabinet('cab_drawers', 'Drawer chest', {
    id: 'cabinet', type: 'drawers',
    w: [0.4, 0.9, 0.05], d: [0.4, 0.55, 0.05], h: [0.6, 1, 0.05],
    defaults: { w: 0.6, h: 0.8, d: 0.45, front: 'drawers', drawers: 4, style: 'slab', handle: 'bar' },
    options: { ...cabinetOptions, front: ['drawers'] },
  }),
  cabinet('cab_open_shelf', 'Lipped open shelf', {
    id: 'cabinet', type: 'shelf',
    w: [0.4, 1.2, 0.05], d: [0.18, 0.3, 0.02], h: [0.3, 1, 0.05],
    defaults: { w: 0.8, h: 0.5, d: 0.25, front: 'open', shelves: 2 },
    options: { shelves: [0, 1, 2, 3, 4, 5, 6], front: ['open'] },
  }, true),
);

L.push(
  // ───────────── Furniture variants ─────────────
  {
    id: 'sofa_lounge', name: 'Lounge sofa', category: 'furniture', price: 892, mass: 47.6,
    dims: [1.6, 0.85, 0.82], description: 'Lounge sofa.', model: 'dinette',
    floor: { footprint: [1.6, 0.85], height: 0.82, flatpack: true },
    family: {
      id: 'sofa', w: [1.2, 2, 0.1], d: [0.8, 0.95, 0.05],
      defaults: { w: 1.6, d: 0.85, arms: 'track', legs: 'tapered' },
      options: { arms: ['track', 'round', 'none'], legs: ['tapered', 'block', 'metal', 'plinth'] },
    },
    features: { seat: { comfort: 4 }, comfort: 2 },
    slots: [
      slot('body', ['upholstery'], 'uph_linen'),
      slot('cushions', ['upholstery'], 'uph_linen'),
      slot('piping', ['upholstery'], 'uph_linen'),
      slot('legs', ['frame', 'metal'], 'cab_walnut'),
    ],
  },
  {
    id: 'sofa_jackknife', name: 'Jackknife sofa bed', category: 'furniture', price: 1160, mass: 54.4,
    dims: [1.7, 0.82, 0.9], description: 'Jackknife sofa bed.', model: 'dinette',
    floor: {
      footprint: [1.7, 0.82], height: 0.9, flatpack: true,
      states: [
        {
          id: 'sofa', label: 'Sofa', footprint: [1.7, 0.82], height: 0.9, travel: true,
        },
        {
          id: 'bed', label: 'Bed', footprint: [1.7, 1.2], height: 0.45, bed: true, travel: false,
        },
      ],
    },
    family: {
      id: 'sofa', w: [1.5, 1.9, 0.1], defaults: { w: 1.7, d: 0.82, arms: 'none', legs: 'plinth' },
      options: { arms: ['none'], legs: ['plinth'] },
    },
    features: { bed: { quality: 0.6, usesMattress: false }, seat: { comfort: 3 } },
    slots: [
      slot('body', ['upholstery'], 'uph_velvet', '#3f5a6a'),
      slot('cushions', ['upholstery'], 'uph_velvet', '#3f5a6a'),
      slot('base', ['frame'], 'cab_walnut'),
    ],
  },
  {
    id: 'murphy_bed', name: 'Murphy bed (double)', category: 'furniture', price: 1650, mass: 72,
    dims: [1.45, 0.42, 1.95], description: 'Murphy bed (double).', model: 'bed',
    floor: {
      footprint: [1.45, 0.42], height: 1.95, flatpack: true, againstWall: true,
      states: [
        {
          id: 'stowed', label: 'Stowed', footprint: [1.45, 0.42], height: 1.95, travel: true,
        },
        {
          id: 'bed', label: 'Bed', footprint: [1.45, 2.05], height: 0.55, bed: true, travel: false,
        },
      ],
    },
    features: { bed: { quality: 0.74, usesMattress: false } },
    slots: [slot('cabinet', ['cabinet'], 'cab_white_oak'), slot('bedding', ['upholstery'], 'uph_linen')],
  },
  {
    id: 'bunk_beds', name: 'Bunk beds (2 singles)', category: 'furniture', price: 780, mass: 58,
    dims: [1.95, 0.75, 1.75], description: 'Bunk beds (2 singles).', model: 'bed',
    floor: { footprint: [1.95, 0.75], height: 1.75, flatpack: true, againstWall: true },
    features: { bed: { quality: 0.55, usesMattress: false } },
    slots: bedding(),
  },
  {
    id: 'table_telescoping', name: 'Telescoping pedestal table', category: 'furniture', price: 260, mass: 12,
    dims: [0.75, 0.55, 0.72], description: 'Telescoping pedestal table.', model: 'table',
    floor: {
      footprint: [0.75, 0.55], height: 0.72, flatpack: true,
      states: [
        {
          id: 'dining', label: 'Dining', footprint: [0.75, 0.55], height: 0.72, travel: true,
        },
        {
          id: 'coffee', label: 'Coffee', footprint: [0.75, 0.55], height: 0.45, travel: true,
        },
      ],
    },
    features: { table: { workMul: 1 } },
    slots: [top(), base()],
  },
  {
    id: 'recliner', name: 'Wall-hugger recliner', category: 'furniture', price: 620, mass: 38,
    dims: [0.78, 0.82, 1.02], description: 'Wall-hugger recliner.', model: 'chair',
    floor: {
      footprint: [0.78, 0.82], height: 1.02, flatpack: true,
      states: [
        {
          id: 'upright', label: 'Upright', footprint: [0.78, 0.82], height: 1.02, travel: true,
        },
        {
          id: 'reclined', label: 'Reclined', footprint: [0.78, 1.45], height: 0.72, travel: false,
        },
      ],
    },
    features: { seat: { comfort: 4 }, comfort: 2 },
    slots: [
      slot('upholstery', ['upholstery'], 'uph_faux_leather', '#4a3a30'),
      slot('base', ['frame'], 'cab_walnut'),
    ],
  },
  {
    id: 'theater_seats', name: 'RV theater seating (pair)', category: 'furniture', price: 1450, mass: 76,
    dims: [1.6, 0.85, 1.05], description: 'RV theater seating (pair).', model: 'dinette',
    floor: {
      footprint: [1.6, 0.85], height: 1.05, flatpack: true,
      states: [
        {
          id: 'upright', label: 'Upright', footprint: [1.6, 0.85], height: 1.05, travel: true,
        },
        {
          id: 'reclined', label: 'Reclined', footprint: [1.6, 1.5], height: 0.75, travel: false,
        },
      ],
    },
    features: { seat: { comfort: 5 }, comfort: 3 },
    slots: [
      slot('upholstery', ['upholstery'], 'uph_faux_leather', '#3a2e2a'),
      slot('console', ['cabinet'], 'cab_walnut'),
    ],
  },
  {
    id: 'ottoman', name: 'Storage ottoman', category: 'furniture', price: 120, mass: 8,
    dims: [0.6, 0.45, 0.42], description: 'Storage ottoman.', model: 'chair',
    floor: { footprint: [0.6, 0.45], height: 0.42, flatpack: true },
    storage: { liters: 45, maxKg: 20, secure: true }, features: { seat: { comfort: 1 } },
    slots: [slot('upholstery', ['upholstery'], 'uph_linen')],
  },
  {
    id: 'storage_bench', name: 'Entry storage bench', category: 'furniture', price: 160, mass: 14,
    dims: [0.9, 0.4, 0.46], description: 'Entry storage bench.', model: 'cabinet',
    floor: { footprint: [0.9, 0.4], height: 0.46, flatpack: true, againstWall: true },
    storage: { liters: 90, maxKg: 35, secure: true }, features: { seat: { comfort: 1 } },
    slots: [slot('cabinet', ['cabinet'], 'cab_white_oak'), slot('cushion', ['upholstery'], 'uph_linen')],
  },

  // ───────────── Decor ─────────────
  {
    id: 'wall_art', name: 'Framed print', category: 'furniture', price: 45, mass: 1.4, dims: [0.5, 0.03, 0.4],
    description: 'Framed print.', model: 'box',
    floor: { footprint: [0.5, 0.03], height: 0.4, mount: 'wall', elevation: 1.35 }, features: { comfort: 1 },
    slots: [slot('frame', ['frame', 'metal'], 'metal_black'), slot('print', ['decor'], 'art_desert')],
  },

  // ───────────── Appliances ─────────────
  {
    id: 'fridge_drawer', name: 'Drawer fridge base (65 L)', category: 'appliance', price: 1150, mass: 26,
    dims: [0.62, 0.6, 0.9], description: 'Drawer fridge base (65 L).', model: 'fridge',
    floor: { footprint: [0.6, 0.58], height: 0.9, againstWall: true, access: [0.6, 0.5] },
    storage: { liters: 65, maxKg: 30, secure: true, refrigerated: true },
    features: { fridge: { liters: 65, mode: '12v', watts: 30 } },
    slots: [slot('front', ['appliance'], 'app_stainless'), slot('counter', ['counter'], 'counter_butcher')],
  },
  {
    id: 'fridge_12v_10cf', name: '12 V fridge, 10 cu ft (283 L)', category: 'appliance', price: 1650,
    mass: 58, dims: [1.52, 0.6, 0.66], description: '12 V fridge, 10 cu ft (283 L).', model: 'fridge',
    floor: { footprint: [0.6, 0.66], height: 1.52, againstWall: true, access: [0.6, 0.55] },
    storage: { liters: 283, maxKg: 90, secure: true, refrigerated: true },
    features: { fridge: { liters: 283, mode: '12v', watts: 45 } },
    slots: [slot('body', ['appliance'], 'app_black')],
  },
  {
    id: 'fridge_residential', name: 'Residential French-door fridge (18 cu ft)', category: 'appliance',
    price: 1350, mass: 95, dims: [1.68, 0.76, 0.79],
    description: 'Residential French-door fridge (18 cu ft).', model: 'fridge',
    floor: {
      footprint: [0.76, 0.79], height: 1.68, againstWall: true, access: [0.76, 0.55],
      ac: { watts: 160, minInverter: 1000 },
    },
    storage: { liters: 510, maxKg: 130, secure: true, refrigerated: true },
    features: { fridge: { liters: 510, mode: '120v', watts: 75 } },
    slots: [slot('body', ['appliance'], 'app_stainless')],
  },
  {
    id: 'microwave', name: 'Microwave (0.9 cu ft)', category: 'appliance', price: 240, mass: 13,
    dims: [0.5, 0.36, 0.29], description: 'Microwave (0.9 cu ft).', model: 'box',
    floor: {
      footprint: [0.5, 0.36], height: 0.29, mount: 'wall', elevation: 1.35,
      ac: { watts: 1000, minInverter: 1000 },
    },
    features: { microwave: { watts: 1000, minutes: 6 } },
    slots: [slot('body', ['appliance'], 'app_stainless')],
  },
  {
    id: 'range_hood', name: 'Range hood (12 V fan + light)', category: 'appliance', price: 140, mass: 3.5,
    dims: [0.55, 0.3, 0.14], description: 'Range hood (12 V fan + light).', model: 'box',
    floor: { footprint: [0.55, 0.3], height: 0.14, mount: 'wall', elevation: 1.3 }, features: { hood: true },
    light: { kind: 'strip', lumens: 120, watts: 2, dimmable: false, kelvin: [3000, 3000] },
    slots: [slot('body', ['appliance', 'metal'], 'app_stainless')],
  },
  {
    id: 'wet_bath_deluxe', name: 'Wet bath (porcelain toilet + rain shower)', category: 'appliance',
    price: 2400, mass: 92, dims: [0.95, 0.85, 2], description: 'Wet bath (porcelain toilet + rain shower).',
    model: 'wetbath',
    floor: {
      footprint: [0.95, 0.85], height: 2, plumbing: true, needsBlackTank: true, flatpack: true,
      access: [0.6, 0.5],
    },
    features: { toilet: { kind: 'plumbed' }, shower: { liters: 15, heater: 'propane' } },
    slots: [slot('walls', ['appliance'], 'app_white'), slot('fixtures', ['metal'], 'metal_black')],
  },

  // ───────────── Lighting ─────────────
  {
    id: 'light_dome', name: 'Dome light (factory)', category: 'fixture', price: 35, mass: 0.5,
    dims: [0.3, 0.3, 0.06], description: 'Dome light (factory).', model: 'box',
    floor: { footprint: [0.3, 0.3], height: 0.06, mount: 'ceiling' },
    light: { kind: 'ceiling', lumens: 420, watts: 5, dimmable: false, kelvin: [3000, 3000] },
    slots: [slot('body', ['metal'], 'metal_nickel')],
  },
  {
    id: 'light_flush', name: 'Modern flush light', category: 'fixture', price: 65, mass: 0.7,
    dims: [0.32, 0.32, 0.05], description: 'Modern flush light.', model: 'box',
    floor: { footprint: [0.32, 0.32], height: 0.05, mount: 'ceiling' },
    light: { kind: 'ceiling', lumens: 600, watts: 6, dimmable: true, kelvin: [2700, 4000] },
    slots: [slot('trim', ['metal'], 'metal_nickel')],
  },
  {
    id: 'light_puck', name: 'Recessed LED puck', category: 'fixture', price: 18, mass: 0.1,
    dims: [0.09, 0.09, 0.02], description: 'Recessed LED puck.', model: 'box',
    floor: { footprint: [0.09, 0.09], height: 0.02, mount: 'ceiling' },
    light: { kind: 'recessed', lumens: 200, watts: 2.5, dimmable: true, kelvin: [2700, 5000] },
    slots: [slot('body', ['metal'], 'metal_nickel')],
  },
  {
    id: 'light_pendant', name: 'Mini pendant', category: 'fixture', price: 85, mass: 1.1,
    dims: [0.2, 0.2, 0.38], description: 'Mini pendant.', model: 'box',
    floor: { footprint: [0.2, 0.2], height: 0.38, mount: 'ceiling' },
    light: { kind: 'pendant', lumens: 320, watts: 4, dimmable: true, kelvin: [2200, 2700] },
    slots: [slot('shade', ['metal'], 'metal_nickel')],
  },
  {
    id: 'light_sconce', name: 'Wall sconce', category: 'fixture', price: 45, mass: 0.6,
    dims: [0.14, 0.12, 0.22], description: 'Wall sconce.', model: 'box',
    floor: { footprint: [0.14, 0.12], height: 0.22, mount: 'wall', elevation: 1.45 },
    light: { kind: 'wall', lumens: 260, watts: 3, dimmable: true, kelvin: [2700, 3000] },
    slots: [slot('body', ['metal'], 'metal_nickel')],
  },
  {
    id: 'light_reading', name: 'Swivel reading light', category: 'fixture', price: 32, mass: 0.3,
    dims: [0.1, 0.16, 0.12], description: 'Swivel reading light.', model: 'box',
    floor: { footprint: [0.1, 0.16], height: 0.12, mount: 'wall', elevation: 1.2 },
    light: { kind: 'reading', lumens: 180, watts: 2, dimmable: true, kelvin: [3000, 4000], beam: 45 },
    slots: [slot('body', ['metal'], 'metal_nickel')],
  },
  {
    id: 'light_undercab', name: 'Under-cabinet LED strip', category: 'fixture', price: 27, mass: 0.072,
    dims: [0.6, 0.04, 0.012], description: 'Under-cabinet LED strip.', model: 'box',
    floor: { footprint: [0.6, 0.04], height: 0.012, mount: 'wall', elevation: 1.43 },
    light: { kind: 'strip', lumens: 320, watts: 4, dimmable: true, kelvin: [2700, 6000] },
    family: {
      id: 'strip', defaults: { length: 0.6 },
      options: { length: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] },
    },
    slots: [slot('body', ['metal'], 'metal_nickel')],
  },
  {
    id: 'light_accent', name: 'RGB accent strip', category: 'fixture', price: 35, mass: 0.12,
    dims: [1, 0.04, 0.012], description: 'RGB accent strip.', model: 'box',
    floor: { footprint: [1, 0.04], height: 0.012, mount: 'wall', elevation: 0.06 },
    light: { kind: 'accent', lumens: 150, watts: 2.5, dimmable: true, kelvin: [2700, 6500], rgb: true },
    family: {
      id: 'strip', defaults: { length: 1 },
      options: { length: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] },
    },
    slots: [slot('body', ['metal'], 'metal_nickel')],
  },
  {
    id: 'light_awning', name: 'Awning LED strip', category: 'fixture', price: 65, mass: 0.5,
    dims: [0.3, 0.2, 0.05], description: 'Warm light along the awning.', model: 'box',
    slot: { kind: 'electronics', size: 0.5 },
    light: { kind: 'exterior', lumens: 600, watts: 7, dimmable: false, kelvin: [3000, 3000] },
    slots: [slot('body', ['metal'], 'metal_nickel')],
  },

  // ───────────── Systems (slots) ─────────────
  {
    id: 'lithium_200', name: 'Lithium battery 200 Ah', category: 'system', mass: 22, price: 1150,
    dims: [0.52, 0.24, 0.22], slot: { kind: 'battery', size: 2 }, features: { battery: { wh: 2400 } },
    description: 'A larger lithium house battery.', model: 'battery',
  },
  {
    id: 'lithium_300', name: 'Lithium battery 300 Ah', category: 'system', mass: 31, price: 1600,
    dims: [0.52, 0.27, 0.24], slot: { kind: 'battery', size: 2 }, features: { battery: { wh: 3600 } },
    description: 'High-capacity lithium storage.', model: 'battery',
  },
  {
    id: 'inverter_1000', name: '1000 W inverter', category: 'system', mass: 3.5, price: 180,
    dims: [0.3, 0.2, 0.1], slot: { kind: 'electronics', size: 1 },
    features: { inverter: { watts: 1000, idleW: 6 } }, description: 'Runs small AC appliances.', model: 'box',
  },
  {
    id: 'inverter_charger', name: '3000 W inverter/charger', category: 'system', mass: 25, price: 1350,
    dims: [0.5, 0.3, 0.2], slot: { kind: 'electronics', size: 2 },
    features: { inverter: { watts: 3000, idleW: 18 }, charger: { watts: 1400 } },
    description: 'Powerful AC supply and shore charger.', model: 'box',
  },
  {
    id: 'mppt', name: 'MPPT solar controller', category: 'system', mass: 1.6, price: 160,
    dims: [0.2, 0.15, 0.08], slot: { kind: 'electronics', size: 1 }, features: { mppt: { efficiency: 0.92 } },
    description: 'Improves solar harvest efficiency.', model: 'box',
  },
  {
    id: 'solar_400', name: '400 W rigid solar panel', category: 'system', mass: 22, price: 480,
    dims: [1.95, 1.13, 0.04], slot: { kind: 'roof', size: 2.4 }, features: { solar: { watts: 400 } },
    description: 'A large roof-mounted solar panel.', model: 'solar',
  },
);

const catalog = L.filter((d) => !['small_cabinet', 'tall_cabinet', 'wardrobe'].includes(d.id));
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(catalog.map((d) => [d.id, d]));
export const ITEM_LIST: readonly ItemDef[] = catalog;

/** A generic definition used for delivery crates (their real data lives on the instance). */
export const CARGO_DEF: ItemDef = {
  id: 'cargo', name: 'Delivery cargo', category: 'cargo', price: 0, mass: 0, dims: [0.5, 0.5, 0.5],
  description: 'Freight for a delivery contract.', model: 'crate', color: '#c8955a', sellable: false,
};

export function itemDef(id: string): ItemDef {
  if (id === 'cargo') return CARGO_DEF;
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item ${id}`);
  return d;
}

export function packedLiters(def: ItemDef): number {
  if (def.volume != null) return def.volume;
  return Math.round(def.dims[0] * def.dims[1] * def.dims[2] * 1000 * 10) / 10;
}

export function longestDim(dims: readonly number[]): number {
  return Math.max(dims[0], dims[1], dims[2]);
}
