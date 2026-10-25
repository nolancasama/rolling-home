// Shared content types. Pure data: no DOM, no three.js.

export type ItemCategory =
  | 'grocery'
  | 'supply'
  | 'personal'
  | 'tool'
  | 'part'
  | 'furniture'
  | 'appliance'
  | 'fixture'
  | 'system'
  | 'mattress'
  | 'outdoor'
  | 'cargo';

export type SlotKind = 'battery' | 'roof' | 'tank' | 'generator' | 'electronics' | 'awning';

export type ComponentId = 'engine' | 'steering' | 'brakes' | 'appliances';

export type SurfaceKind = 'floor' | 'wall' | 'ceiling' | 'trim' | 'cabinet' | 'counter' | 'upholstery' | 'window' | 'metal' | 'frame' | 'appliance' | 'rug' | 'decor';
export type MaterialPattern = 'plank' | 'sheet' | 'tile' | 'carpet' | 'rubber' | 'cork' | 'paint' | 'wallpaper' | 'fabric' | 'leather' | 'wood' | 'laminate' | 'stone' | 'metal' | 'plastic' | 'textured';
export interface MaterialDef {
  id: string; name: string; group: string; surfaces: SurfaceKind[]; pattern: MaterialPattern; motif?: string;
  color: string; color2?: string; roughness: number; metalness?: number;
  kgPerM2: number; pricePerM2: number; laborPerM2: number; repeat: [number, number];
  plank?: { widths: number[]; lengths: number[] }; transmission?: number; appeal: number; tintable: boolean;
  sheen?: number; clearcoat?: number;
}
export interface Finish {
  mat: string; color?: string; color2?: string; scale?: number; rot?: 0 | 90; offset?: [number, number];
  plankW?: number; plankL?: number; roughness?: number;
}
export interface SurfaceDef {
  id: string; kind: 'floor' | 'wall' | 'ceiling' | 'trim'; name: string; rect?: Rect;
  wall?: { side: 'left' | 'right' | 'rear' | 'front'; a0: number; a1: number }; factory: Finish;
}
export type CoveringType = 'none' | 'curtains' | 'sheer' | 'blackout_roller' | 'solar_roller' | 'pleated' | 'day_night' | 'roman' | 'insulated' | 'privacy_screen';
export interface WindowTreatment {
  type: CoveringType; fabric: Finish; fabric2?: Finish; valance?: Finish | null;
  hardware: 'white' | 'black' | 'brass' | 'chrome' | 'wood'; mount: 'inside' | 'outside';
  length?: 'sill' | 'long'; open: number; layer?: 'day' | 'night';
}
export interface CoveringSpec {
  type: CoveringType; name: string; description: string; basePrice: number; pricePerM2: number;
  kgPerM2: number; laborMin: number; fabrics: string[]; fabrics2?: string[];
  defaultFabric: string; defaultFabric2?: string;
}
export type MountKind = 'floor' | 'wall' | 'ceiling';
export interface StateSpec {
  id: string; label: string; footprint: [number, number]; height: number; access?: [number, number]; travel: boolean; bed?: boolean;
}
export interface MaterialSlotDef { id: string; label: string; surfaces: SurfaceKind[]; default: Finish }
export interface ItemConfig {
  w?: number; h?: number; d?: number; front?: 'doors' | 'drawers' | 'mixed' | 'open' | 'glass';
  doors?: number; drawers?: number; shelves?: number; style?: 'slab' | 'shaker' | 'louver' | 'beadboard';
  handle?: 'bar' | 'knob' | 'cup' | 'edge' | 'latch'; arms?: 'track' | 'round' | 'none';
  legs?: 'tapered' | 'block' | 'metal' | 'plinth'; length?: number; size?: string;
}
export interface FamilySpec {
  id: 'cabinet' | 'sofa' | 'rug' | 'strip'; type?: 'base' | 'upper' | 'tall' | 'wardrobe' | 'drawers' | 'shelf';
  w?: [number, number, number]; h?: [number, number | 'clearance', number]; d?: [number, number, number];
  options?: Partial<Record<keyof ItemConfig, (string | number)[]>>; defaults: ItemConfig;
}
export interface LightSpec {
  kind: 'ceiling' | 'recessed' | 'pendant' | 'wall' | 'reading' | 'strip' | 'accent' | 'exterior';
  lumens: number; watts: number; dimmable: boolean; kelvin: [number, number]; rgb?: boolean; beam?: number;
}

export interface FoodSpec {
  servings: number;
  /** cook: needs a stove. ready: a full meal as-is. snack: small bite. */
  kind: 'cook' | 'ready' | 'snack';
  hunger: number;
  mood?: number;
  /** Spoils unless kept in a powered fridge. */
  perishable?: boolean;
  /** Unrefrigerated shelf life (game hours) for perishables. */
  shelfHours?: number;
  cookMinutes?: number;
}

export interface StorageSpec {
  liters: number;
  maxKg: number;
  secure: boolean;
  refrigerated?: boolean;
  /** Longest item dimension (m) that fits through the opening. */
  maxDim?: number;
}

export interface FloorSpec {
  mount?: MountKind;
  elevation?: number;
  elevationRange?: [number, number | 'clearance'];
  againstWall?: boolean;
  propane?: boolean;
  ac?: { watts: number; minInverter: number };
  states?: StateSpec[];
  flatpack?: boolean;
  /** [width side-to-side, depth front-to-back] in meters at rotation 0 (front facing +Z). */
  footprint: [number, number];
  height: number;
  /** Clear zone in front of the item that must stay free and reachable: [width, depth]. */
  access?: [number, number];
  /** Must sit inside a plumbing zone. */
  plumbing?: boolean;
  /** Walkable (rugs): no collision, may sit under nothing else flat. */
  flat?: boolean;
  /** Needs a built-in black water tank (plumbed toilets). */
  needsBlackTank?: boolean;
}

export interface Features {
  bed?: { quality: number; usesMattress: boolean; mattressSize?: 'van' | 'double' };
  mattress?: { quality: number; size: 'van' | 'double' };
  seat?: { comfort: number };
  table?: { workMul: number };
  galley?: { sink: boolean; stove: 'butane' | 'propane' | 'induction' | null };
  fridge?: { liters: number; mode: '12v' | '3way' | '120v'; watts: number; propaneKgPerDay?: number };
  microwave?: { watts: number; minutes: number };
  charger?: { watts: number };
  mppt?: { efficiency: number };
  hood?: boolean;
  toilet?: { kind: 'cassette' | 'plumbed' | 'composting'; cassetteLiters?: number };
  shower?: { liters: number; heater: 'propane' | 'electric' };
  outdoorShower?: { liters: number };
  battery?: { wh: number };
  solar?: { watts: number };
  inverter?: { watts: number; idleW: number };
  booster?: { bars: number; watts: number };
  tank?: { liters: number };
  generator?: { watts: number; fuelLph: number };
  fan?: { watts: number };
  lights?: { watts: number };
  awning?: boolean;
  comfort?: number;
  laptop?: boolean;
  tool?: 'toolkit' | 'water_hose' | 'sewer_kit' | 'power_cord' | 'straps' | 'leveling_blocks';
  part?: { component: ComponentId; amount: number; cap: number };
  butane?: { uses: number };
  waterJug?: { liters: number };
  firewood?: boolean;
  activity?: { kind: 'guitar' | 'book'; minutes: number; mood: number };
  outdoor?: { kind: 'chair' | 'table' };
}

export interface ItemDef {
  family?: FamilySpec;
  slots?: MaterialSlotDef[];
  light?: LightSpec;
  id: string;
  name: string;
  category: ItemCategory;
  price: number;
  /** kg */
  mass: number;
  /** Packed size in meters [length, width, height]. */
  dims: [number, number, number];
  /** Liters occupied when stored. Defaults to the packed box volume. */
  volume?: number;
  description: string;
  food?: FoodSpec;
  /** Storage the item provides once installed (cabinets, fridges). */
  storage?: StorageSpec;
  floor?: FloorSpec;
  slot?: { kind: SlotKind; size: number };
  features?: Features;
  /** Render model key. */
  model: string;
  color?: string;
  /** Cannot be bought new (secondhand stock only). */
  usedOnly?: boolean;
  sellable?: boolean;
}

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface CompartmentDef {
  id: string;
  name: string;
  liters: number;
  maxKg: number;
  /** Distance behind the front axle (m). Negative = ahead of the front axle. */
  d: number;
  secure: boolean;
  exterior: boolean;
  maxDim: number;
  /** Where crates/boxes are drawn, in vehicle-local meters (center + size). */
  box: { x: number; y: number; z: number; w: number; h: number; l: number };
  /** Raises the center of gravity (roof racks). */
  high?: boolean;
}

export interface TankDef {
  liters: number;
  d: number;
}

export interface WindowDef {
  id: string;
  door?: boolean;
  factory?: WindowTreatment;
  side: 'left' | 'right' | 'rear' | 'front';
  /** Along the wall: z range for side walls, x range for rear/front. */
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

export interface InteriorDef {
  surfaces: SurfaceDef[];
  gas: Rect[];
  openings: { name: string; w: number; h: number }[];
  floorY: number;
  ceilingY: number;
  /** The chassis cab can sit lower than the coach floor (Class C: a step down into the cab). */
  cabFloorY: number;
  /** Cab headliner height. */
  cabCeilingY: number;
  halfWidth: number;
  living: Rect;
  cab: Rect;
  door: {
    side: 'right' | 'left';
    z0: number;
    z1: number;
    zone: Rect;
    /** Outside standing point in vehicle-local coords. */
    outside: { x: number; z: number };
  };
  plumbing: Rect[];
  driverSeat: { x: number; z: number };
  passengerSeat: { x: number; z: number };
  /** Built-in bunk above the cab (Class C). */
  cabover?: { quality: number };
  windows: WindowDef[];
}

export type DefaultInstall =
  | { item: string; x: number; z: number; rot: number; mattress?: string; y?: number; config?: ItemConfig; finish?: Record<string, Finish>; state?: string; since?: number }
  | { item: string; slot: SlotKind; since?: number };

export type VehicleId = 'van' | 'classc';

export interface VehicleDef {
  id: VehicleId;
  name: string;
  shortName: string;
  year: number;
  kind: string;
  description: string;
  pros: string[];
  cons: string[];
  price: number;
  fuelType: 'gasoline' | 'diesel';
  dims: {
    length: number;
    width: number;
    height: number;
    wheelbase: number;
    frontOverhang: number;
    track: number;
    wheelRadius: number;
  };
  shellMass: number;
  /** Center of gravity of the empty shell, meters behind the front axle. */
  shellD: number;
  gvwr: number;
  frontGawr: number;
  rearGawr: number;
  tanks: { fuel: TankDef; fresh: TankDef; gray: TankDef; black?: TankDef; propane?: { kg: number; d: number } };
  slots: Partial<Record<SlotKind, { capacity: number; d: number }>>;
  compartments: CompartmentDef[];
  handling: {
    powerKw: number;
    maxSpeed: number;
    brakeDecel: number;
    maxSteer: number;
    steerRate: number;
    grip: number;
    drag: number;
    yawResponse: number;
    reverseMax: number;
  };
  fuelLPer100: number;
  idleLph: number;
  weeklyCost: number;
  shorePowerAmps: number;
  hasShower: boolean;
  /** Body condition (looks) is separate from mechanical condition. */
  startCondition: { engine: number; steering: number; brakes: number; body: number; appliances: number };
  interior: InteriorDef;
  defaults: DefaultInstall[];
  paint: { body: string; accent: string; stripe: string; trim: string };
}
