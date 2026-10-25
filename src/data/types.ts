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
  id: string;
  name: string;
  /** Editor group, such as Luxury vinyl plank or Wallpaper. */
  group: string;
  surfaces: SurfaceKind[];
  pattern: MaterialPattern;
  /** Pattern variant. */
  motif?: string;
  /** Default tint, sRGB hex. */
  color: string;
  /** Secondary color for grout, stripes, prints or gaps. */
  color2?: string;
  /** 0..1, smooth to rough. */
  roughness: number;
  metalness?: number;
  /** kg per square meter including underlay/adhesive; 0 for slot-only materials. */
  kgPerM2: number;
  /** Material price per square meter of surface or item slot. */
  pricePerM2: number;
  /** DIY labor minutes per square meter for vehicle surfaces. */
  laborPerM2: number;
  /** Pattern repeat at scale 1, meters [u, v]. */
  repeat: [number, number];
  /** Selectable plank dimensions in meters; first entries are defaults. */
  plank?: {
    widths: number[];
    lengths: number[];
  };
  /** Closed window fabric light transmission: 0 blackout, 1 clear. */
  transmission?: number;
  /** 0..1 look/quality contribution to interior appeal. */
  appeal: number;
  /** Whether the default tint can be recolored. */
  tintable: boolean;
  /** Render hints. */
  sheen?: number;
  clearcoat?: number;
}

/** Material assignment on a surface, item slot or covering; omitted fields use material defaults. */
export interface Finish {
  mat: string;
  color?: string;
  color2?: string;
  /** Pattern scale multiplier, 0.5..2. */
  scale?: number;
  /** Pattern/grain direction in degrees. */
  rot?: 0 | 90;
  /** Pattern alignment offset in meters. */
  offset?: [number, number];
  /** One of the material's plank widths. */
  plankW?: number;
  /** One of the material's plank lengths. */
  plankL?: number;
  /** Finish override, matte to gloss. */
  roughness?: number;
}

export interface SurfaceDef {
  /** Stable surface id, such as floor.bed, wall.L.rear or trim. */
  id: string;
  kind: 'floor' | 'wall' | 'ceiling' | 'trim';
  name: string;
  /** Floor/ceiling plan rectangle. */
  rect?: Rect;
  /** Wall span: z range for side walls, x range for rear/front; fully contains its openings. */
  wall?: {
    side: 'left' | 'right' | 'rear' | 'front';
    a0: number;
    a1: number;
  };
  factory: Finish;
}
export type CoveringType = 'none' | 'curtains' | 'sheer' | 'blackout_roller' | 'solar_roller' | 'pleated' | 'day_night' | 'roman' | 'insulated' | 'privacy_screen';
export interface WindowTreatment {
  type: CoveringType;
  /** Window material allowed for this covering type. */
  fabric: Finish;
  /** Day/night covering's blackout layer. */
  fabric2?: Finish;
  /** Optional valance across the top. */
  valance?: Finish | null;
  hardware: 'white' | 'black' | 'brass' | 'chrome' | 'wood';
  mount: 'inside' | 'outside';
  /** Curtains and sheers only. */
  length?: 'sill' | 'long';
  /** 1 fully open, 0 fully closed. */
  open: number;
  /** Day/night layer lowered when closed. */
  layer?: 'day' | 'night';
}

export interface CoveringSpec {
  type: CoveringType;
  name: string;
  description: string;
  basePrice: number;
  pricePerM2: number;
  kgPerM2: number;
  laborMin: number;
  /** Allowed MaterialDef groups for the main fabric. */
  fabrics: string[];
  /** Allowed groups for the day/night blackout layer. */
  fabrics2?: string[];
  defaultFabric: string;
  defaultFabric2?: string;
}
export type MountKind = 'floor' | 'wall' | 'ceiling';
export interface StateSpec {
  id: string;
  label: string;
  /** Width and depth in meters for this state. */
  footprint: [number, number];
  height: number;
  /** Clear access zone, [width, depth] in meters. */
  access?: [number, number];
  /** Allowed while driving. */
  travel: boolean;
  /** Sleeping happens in this state. */
  bed?: boolean;
}

export interface MaterialSlotDef {
  /** Editable part, such as carcass, fronts, handles or cushions. */
  id: string;
  label: string;
  surfaces: SurfaceKind[];
  default: Finish;
}

export interface ItemConfig {
  /** Configured dimensions in meters. */
  w?: number;
  h?: number;
  d?: number;
  front?: 'doors' | 'drawers' | 'mixed' | 'open' | 'glass';
  doors?: number;
  drawers?: number;
  shelves?: number;
  style?: 'slab' | 'shaker' | 'louver' | 'beadboard';
  handle?: 'bar' | 'knob' | 'cup' | 'edge' | 'latch';
  arms?: 'track' | 'round' | 'none';
  legs?: 'tapered' | 'block' | 'metal' | 'plinth';
  /** Strip light length in meters. */
  length?: number;
  /** Rug family size id. */
  size?: string;
}

export interface FamilySpec {
  id: 'cabinet' | 'sofa' | 'rug' | 'strip';
  /** Cabinet subtype. */
  type?: 'base' | 'upper' | 'tall' | 'wardrobe' | 'drawers' | 'shelf';
  /** Adjustable dimension ranges [min, max, step] in meters. */
  w?: [number, number, number];
  /** 'clearance' means the vehicle's floor-to-ceiling height. */
  h?: [number, number | 'clearance', number];
  d?: [number, number, number];
  /** Allowed values for configurable options. */
  options?: Partial<Record<keyof ItemConfig, (string | number)[]>>;
  defaults: ItemConfig;
}

export interface LightSpec {
  kind: 'ceiling' | 'recessed' | 'pendant' | 'wall' | 'reading' | 'strip' | 'accent' | 'exterior';
  /** Per fixture, or per meter for strips. */
  lumens: number;
  /** Per fixture, or per meter for strips. */
  watts: number;
  dimmable: boolean;
  /** Adjustable color temperature range; equal values mean fixed. */
  kelvin: [number, number];
  rgb?: boolean;
  /** Reading light spot cone in degrees. */
  beam?: number;
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
  /** Defaults to floor. */
  mount?: MountKind;
  /** Wall item's default bottom height above the floor, meters. */
  elevation?: number;
  /** Allowed bottom height; 'clearance' uses the vehicle's floor-to-ceiling height. */
  elevationRange?: [number, number | 'clearance'];
  /** Back edge must touch a wall. */
  againstWall?: boolean;
  /** Must sit fully inside a gas zone. */
  propane?: boolean;
  /** 120 V appliance load and required inverter capacity. */
  ac?: {
    watts: number;
    minInverter: number;
  };
  /** First entry is the default/travel state. */
  states?: StateSpec[];
  /** Ships knocked-down or is built in place; skips the door-fit check. */
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
  /** Microwave power and cooking duration. */
  microwave?: {
    watts: number;
    minutes: number;
  };
  /** Shore charger output. */
  charger?: {
    watts: number;
  };
  /** Solar harvest efficiency multiplier. */
  mppt?: {
    efficiency: number;
  };
  /** Range hood fan and light. */
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
  /** Configurable item family and allowed options. */
  family?: FamilySpec;
  /** Editable material parts. */
  slots?: MaterialSlotDef[];
  /** Fixture lighting properties. */
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
  /** Stable window id within the vehicle. */
  id: string;
  /** Door window; no covering. */
  door?: boolean;
  /** Factory covering. */
  factory?: WindowTreatment;
  side: 'left' | 'right' | 'rear' | 'front';
  /** Along the wall: z range for side walls, x range for rear/front. */
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

export interface InteriorDef {
  /** Editable vehicle surfaces and their factory finishes. */
  surfaces: SurfaceDef[];
  /** Propane line zones; empty means none. */
  gas: Rect[];
  /** Entry openings used by the door-fit check, meters. */
  openings: {
    name: string;
    w: number;
    h: number;
  }[];
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
  | {
      item: string;
      x: number;
      z: number;
      rot: number;
      mattress?: string;
      /** Bottom height above the floor, meters. */
      y?: number;
      /** Factory configuration. */
      config?: ItemConfig;
      /** Factory finish per material slot. */
      finish?: Record<string, Finish>;
      /** Initial state id. */
      state?: string;
      /** Data version that added the install; used by save migration. */
      since?: number;
    }
  | {
      item: string;
      slot: SlotKind;
      /** Data version that added the install; used by save migration. */
      since?: number;
    };

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
