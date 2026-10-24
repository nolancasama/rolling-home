import type { VehicleDef, VehicleId } from './types';

// Vehicle-local frame: +Z = forward (front bumper at +length/2), +X = the
// vehicle's LEFT (driver) side, -X = right (curb/door) side, Y up from ground.
// Longitudinal positions used for axle loads ("d") are meters BEHIND the
// front axle: d = frontAxleZ - z.

const VAN: VehicleDef = {
  id: 'van',
  name: '1997 Wanderer HiTop Camper Van',
  shortName: 'Camper Van',
  year: 1997,
  kind: 'Camper van',
  description:
    'An old high-roof van with a homemade conversion. Faded paint and a few dents, but it parks anywhere, ' +
    'squeezes down narrow tracks and sips fuel compared to a motorhome.',
  pros: ['Parks in normal spaces', 'Fits narrow roads and small sites', 'Cheaper fuel and fees', 'Nimble handling'],
  cons: ['No shower', 'Cassette toilet only', 'Tight living space', 'Small tanks and battery'],
  price: 9800,
  fuelType: 'gasoline',
  dims: { length: 5.6, width: 2.0, height: 2.65, wheelbase: 3.5, frontOverhang: 0.85, track: 1.72, wheelRadius: 0.36 },
  shellMass: 2390,
  shellD: 1.62,
  gvwr: 3400,
  frontGawr: 1600,
  rearGawr: 1850,
  tanks: {
    fuel: { liters: 90, d: 2.3 },
    fresh: { liters: 60, d: 2.0 },
    gray: { liters: 40, d: 2.6 },
  },
  slots: {
    battery: { capacity: 2, d: 0.75 },
    roof: { capacity: 3.2, d: 2.0 },
    tank: { capacity: 1, d: 2.7 },
    electronics: { capacity: 4, d: 1.0 },
  },
  compartments: [
    {
      id: 'garage', name: 'Rear garage (under bed)', liters: 330, maxKg: 110, d: 4.0, secure: true, exterior: true,
      maxDim: 1.3, box: { x: 0, y: 0.82, z: -2.1, w: 1.7, h: 0.5, l: 1.1 },
    },
    {
      id: 'floor', name: 'Floor space (loose)', liters: 360, maxKg: 220, d: 2.45, secure: false, exterior: false,
      maxDim: 1.9, box: { x: -0.05, y: 0.55, z: -0.25, w: 0.7, h: 0.6, l: 1.3 },
    },
    {
      id: 'roof', name: 'Roof rack', liters: 300, maxKg: 60, d: 2.0, secure: true, exterior: true, high: true,
      maxDim: 1.8, box: { x: 0, y: 2.7, z: -0.6, w: 1.4, h: 0.4, l: 1.6 },
    },
    {
      id: 'cab', name: 'Cab console & door pockets', liters: 24, maxKg: 12, d: 0.6, secure: true, exterior: false,
      maxDim: 0.45, box: { x: 0, y: 0.75, z: 1.25, w: 0.3, h: 0.2, l: 0.4 },
    },
  ],
  handling: {
    powerKw: 118, maxSpeed: 33, brakeDecel: 6.8, maxSteer: 0.62, steerRate: 2.2, grip: 0.92,
    drag: 2.6, yawResponse: 7.5, reverseMax: 4.5,
  },
  fuelLPer100: 16,
  idleLph: 1.1,
  weeklyCost: 42,
  shorePowerAmps: 15,
  hasShower: false,
  startCondition: { engine: 0.72, steering: 0.68, brakes: 0.74, body: 0.5, appliances: 0.8 },
  interior: {
    floorY: 0.55,
    ceilingY: 2.42,
    halfWidth: 0.94,
    living: { x0: -0.94, x1: 0.94, z0: -2.74, z1: 0.72 },
    cab: { x0: -0.94, x1: 0.94, z0: 0.72, z1: 1.75 },
    door: {
      side: 'right',
      z0: -0.35,
      z1: 0.72,
      zone: { x0: -0.94, x1: -0.3, z0: -0.3, z1: 0.7 },
      outside: { x: -1.65, z: 0.15 },
    },
    plumbing: [{ x0: 0.2, x1: 0.94, z0: -1.5, z1: 0.72 }],
    driverSeat: { x: 0.48, z: 1.25 },
    passengerSeat: { x: -0.48, z: 1.25 },
    windows: [
      { side: 'left', a0: -2.3, a1: -1.3, y0: 1.3, y1: 1.95 },
      { side: 'left', a0: -0.9, a1: 0.45, y0: 1.3, y1: 1.95 },
      { side: 'right', a0: -2.3, a1: -1.3, y0: 1.3, y1: 1.95 },
      { side: 'right', a0: -0.25, a1: 0.6, y0: 1.3, y1: 1.95 },
      { side: 'rear', a0: -0.75, a1: -0.12, y0: 1.35, y1: 1.95 },
      { side: 'rear', a0: 0.12, a1: 0.75, y0: 1.35, y1: 1.95 },
    ],
  },
  defaults: [
    { item: 'van_bed', x: 0, z: -2.09, rot: 0, mattress: 'foam_van' },
    { item: 'van_galley', x: 0.665, z: -0.15, rot: 3 },
    { item: 'cooler_fridge', x: 0.715, z: -1.0, rot: 3 },
    { item: 'cassette_toilet', x: -0.7, z: -1.12, rot: 1 },
    { item: 'small_cabinet', x: -0.74, z: -0.61, rot: 1 },
    { item: 'agm_battery', slot: 'battery' },
  ],
  paint: { body: '#efe3c8', accent: '#3f8f8a', stripe: '#d9773c', trim: '#5b5148' },
};

const CLASS_C: VehicleDef = {
  id: 'classc',
  name: '2004 Trailcrest 24C Motorhome',
  shortName: 'Class C Motorhome',
  year: 2004,
  kind: 'Class C motorhome',
  description:
    'A used 24-foot motorhome on a truck chassis: real bathroom with a shower, a propane kitchen, a big fridge ' +
    'and a cab-over bunk. Comfortable, but thirsty, tall and long, and its payload is smaller than it looks.',
  pros: ['Wet bath with shower', 'Propane kitchen + 3-way fridge', 'Lots of storage volume', 'Generator bay'],
  cons: ['Heavy fuel use', 'Too long or tall for some roads and sites', 'Limited payload', 'Long rear overhang'],
  price: 29500,
  fuelType: 'gasoline',
  dims: { length: 7.4, width: 2.4, height: 3.4, wheelbase: 4.4, frontOverhang: 0.95, track: 1.95, wheelRadius: 0.4 },
  shellMass: 3820,
  shellD: 2.42,
  gvwr: 5200,
  frontGawr: 2200,
  rearGawr: 3350,
  tanks: {
    fuel: { liters: 150, d: 2.3 },
    fresh: { liters: 150, d: 3.4 },
    gray: { liters: 115, d: 4.6 },
    black: { liters: 95, d: 4.85 },
    propane: { kg: 15, d: 3.0 },
  },
  slots: {
    battery: { capacity: 3, d: 1.6 },
    roof: { capacity: 6.0, d: 3.8 },
    tank: { capacity: 1, d: 3.9 },
    generator: { capacity: 1, d: 1.2 },
    electronics: { capacity: 6, d: 2.5 },
    awning: { capacity: 1, d: 3.0 },
  },
  compartments: [
    {
      id: 'rearbay', name: 'Rear exterior bay', liters: 520, maxKg: 130, d: 6.0, secure: true, exterior: true,
      maxDim: 1.6, box: { x: 0, y: 0.45, z: -3.25, w: 1.9, h: 0.55, l: 0.7 },
    },
    {
      id: 'sidebays', name: 'Side basement bays', liters: 720, maxKg: 200, d: 3.3, secure: true, exterior: true,
      maxDim: 1.4, box: { x: 0, y: 0.45, z: -0.6, w: 1.9, h: 0.5, l: 1.6 },
    },
    {
      id: 'overhead', name: 'Overhead cabinets', liters: 300, maxKg: 60, d: 3.0, secure: true, exterior: false,
      maxDim: 0.6, box: { x: 0.95, y: 2.4, z: -0.3, w: 0.35, h: 0.35, l: 1.6 },
    },
    {
      id: 'cabover', name: 'Cab-over bunk (loose)', liters: 260, maxKg: 60, d: 0.4, secure: false, exterior: false,
      maxDim: 1.9, box: { x: 0, y: 2.45, z: 2.25, w: 1.6, h: 0.4, l: 0.8 },
    },
    {
      id: 'floor', name: 'Floor space (loose)', liters: 480, maxKg: 260, d: 3.6, secure: false, exterior: false,
      maxDim: 2.3, box: { x: 0.0, y: 0.85, z: -0.4, w: 0.6, h: 0.6, l: 1.4 },
    },
    {
      id: 'cab', name: 'Cab console & door pockets', liters: 30, maxKg: 15, d: 0.7, secure: true, exterior: false,
      maxDim: 0.45, box: { x: 0, y: 1.0, z: 2.0, w: 0.3, h: 0.2, l: 0.4 },
    },
  ],
  handling: {
    powerKw: 185, maxSpeed: 31, brakeDecel: 5.8, maxSteer: 0.56, steerRate: 1.6, grip: 0.84,
    drag: 4.8, yawResponse: 5.0, reverseMax: 4,
  },
  fuelLPer100: 25,
  idleLph: 1.9,
  weeklyCost: 78,
  shorePowerAmps: 30,
  hasShower: true,
  startCondition: { engine: 0.64, steering: 0.7, brakes: 0.66, body: 0.75, appliances: 0.62 },
  interior: {
    floorY: 0.85,
    ceilingY: 2.85,
    halfWidth: 1.14,
    living: { x0: -1.14, x1: 1.14, z0: -3.64, z1: 1.45 },
    cab: { x0: -1.14, x1: 1.14, z0: 1.45, z1: 2.55 },
    door: {
      side: 'right',
      z0: 0.55,
      z1: 1.25,
      zone: { x0: -1.14, x1: -0.44, z0: 0.5, z1: 1.3 },
      outside: { x: -1.95, z: 0.9 },
    },
    plumbing: [
      { x0: -1.14, x1: -0.4, z0: -1.25, z1: 0.5 },
      { x0: -1.14, x1: 1.14, z0: -2.4, z1: -1.1 },
    ],
    driverSeat: { x: 0.55, z: 2.0 },
    passengerSeat: { x: -0.55, z: 2.0 },
    cabover: { quality: 0.68 },
    windows: [
      { side: 'left', a0: -3.2, a1: -2.45, y0: 1.65, y1: 2.25 },
      { side: 'left', a0: -0.85, a1: 0.65, y0: 1.55, y1: 2.3 },
      { side: 'right', a0: -1.05, a1: -0.25, y0: 1.75, y1: 2.3 },
      { side: 'right', a0: 0.68, a1: 1.12, y0: 1.75, y1: 2.25 },
      { side: 'rear', a0: -0.6, a1: 0.6, y0: 1.7, y1: 2.3 },
    ],
  },
  defaults: [
    { item: 'double_bed', x: 0, z: -2.94, rot: 0, mattress: 'foam_double' },
    { item: 'wet_bath', x: -0.73, z: -1.79, rot: 1 },
    { item: 'wardrobe', x: 0.84, z: -1.94, rot: 3 },
    { item: 'threeway_fridge', x: 0.83, z: -1.3, rot: 3 },
    { item: 'dinette', x: 0.64, z: -0.05, rot: 3 },
    { item: 'propane_galley', x: -0.84, z: -0.45, rot: 1 },
    { item: 'agm_battery', slot: 'battery' },
    { item: 'agm_battery', slot: 'battery' },
    { item: 'awning', slot: 'awning' },
  ],
  paint: { body: '#f4f1ea', accent: '#2f5f8f', stripe: '#c8553d', trim: '#4a4f57' },
};

export const VEHICLES: Record<VehicleId, VehicleDef> = { van: VAN, classc: CLASS_C };
export const VEHICLE_IDS: VehicleId[] = ['van', 'classc'];

export function vehicleDef(id: VehicleId): VehicleDef {
  return VEHICLES[id];
}

export function frontAxleZ(def: VehicleDef): number {
  return def.dims.length / 2 - def.dims.frontOverhang;
}

export function rearAxleZ(def: VehicleDef): number {
  return frontAxleZ(def) - def.dims.wheelbase;
}

/** Distance behind the front axle for a vehicle-local z. */
export function dFromZ(def: VehicleDef, z: number): number {
  return frontAxleZ(def) - z;
}
