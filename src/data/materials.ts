import type { CoveringSpec, CoveringType, MaterialDef } from './types';

// Content defaults are deliberately explicit; procedural renderers consume the same data as the simulation.
const plank = { widths: [0.18, 0.15, 0.23], lengths: [1.22, 0.91, 1.52] };

const list: MaterialDef[] = [
  // ───────────── Floors ─────────────
  {
    id: 'factory_carpet', name: 'Factory berber (2004)', group: 'Factory', surfaces: ['floor'],
    pattern: 'carpet', color: '#8a7468', roughness: 0.96, kgPerM2: 2.6, pricePerM2: 18, laborPerM2: 15,
    repeat: [0.5, 0.5], appeal: 0.12, tintable: false, motif: 'berber', color2: '#6e5a52',
  },
  {
    id: 'factory_vinyl', name: 'Factory sheet vinyl (2004)', group: 'Factory', surfaces: ['floor'],
    pattern: 'sheet', color: '#b89a72', roughness: 0.6, kgPerM2: 2.4, pricePerM2: 12, laborPerM2: 12,
    repeat: [0.6, 0.6], appeal: 0.18, tintable: false, motif: 'parquet', color2: '#9a7d58',
  },
  {
    id: 'factory_plywood', name: 'Sealed plywood (homemade)', group: 'Factory', surfaces: ['floor'],
    pattern: 'wood', color: '#c8a777', roughness: 0.7, kgPerM2: 0.4, pricePerM2: 6, laborPerM2: 10,
    repeat: [1.22, 2.44], appeal: 0.12, tintable: false, motif: 'ply', color2: '#a88554',
  },
  {
    id: 'lvp_natural_oak', name: 'Natural oak', group: 'Luxury vinyl plank', surfaces: ['floor'],
    pattern: 'plank', color: '#c49a6c', roughness: 0.55, kgPerM2: 10.5, pricePerM2: 32, laborPerM2: 18,
    repeat: [0.18, 1.22], appeal: 0.74, tintable: true, plank,
  },
  {
    id: 'lvp_driftwood', name: 'Driftwood grey', group: 'Luxury vinyl plank', surfaces: ['floor'],
    pattern: 'plank', color: '#a39c92', roughness: 0.55, kgPerM2: 10.5, pricePerM2: 32, laborPerM2: 18,
    repeat: [0.18, 1.22], appeal: 0.72, tintable: true, plank,
  },
  {
    id: 'lvp_smoked_walnut', name: 'Smoked walnut', group: 'Luxury vinyl plank', surfaces: ['floor'],
    pattern: 'plank', color: '#6b4a35', roughness: 0.5, kgPerM2: 10.5, pricePerM2: 34, laborPerM2: 18,
    repeat: [0.18, 1.22], appeal: 0.78, tintable: true, plank,
  },
  {
    id: 'lvp_glue_thin', name: 'Thin glue-down plank (2 mm)', group: 'Luxury vinyl plank',
    surfaces: ['floor'], pattern: 'plank', color: '#b48a62', roughness: 0.6, kgPerM2: 4.5, pricePerM2: 26,
    laborPerM2: 24, repeat: [0.18, 1.22], appeal: 0.66, tintable: true, plank,
  },
  {
    id: 'sheet_vinyl_checker', name: 'Checkerboard sheet vinyl', group: 'Sheet vinyl', surfaces: ['floor'],
    pattern: 'sheet', color: '#efe8da', roughness: 0.45, kgPerM2: 2.6, pricePerM2: 14, laborPerM2: 12,
    repeat: [0.6, 0.6], appeal: 0.55, tintable: true, motif: 'checker', color2: '#2b2b2b',
  },
  {
    id: 'laminate_hickory', name: 'Rustic hickory laminate', group: 'Laminate', surfaces: ['floor'],
    pattern: 'plank', color: '#a7774e', roughness: 0.5, kgPerM2: 8, pricePerM2: 24, laborPerM2: 20,
    repeat: [0.19, 1.29], appeal: 0.62, tintable: true, motif: 'knots',
    plank: { widths: [0.19], lengths: [1.29] },
  },
  {
    id: 'hw_herringbone', name: 'Herringbone oak look', group: 'Hardwood-look', surfaces: ['floor'],
    pattern: 'plank', color: '#b88c5e', roughness: 0.5, kgPerM2: 9.5, pricePerM2: 48, laborPerM2: 35,
    repeat: [0.09, 0.45], appeal: 0.88, tintable: true, motif: 'herringbone',
    plank: { widths: [0.09], lengths: [0.45] },
  },
  {
    id: 'engineered_oak', name: 'Engineered oak', group: 'Engineered wood', surfaces: ['floor'],
    pattern: 'plank', color: '#b9905f', roughness: 0.45, kgPerM2: 9.8, pricePerM2: 70, laborPerM2: 30,
    repeat: [0.19, 1.9], appeal: 0.9, tintable: true, plank: { widths: [0.19, 0.24], lengths: [1.9] },
  },
  {
    id: 'carpet_oatmeal', name: 'Oatmeal berber', group: 'Carpet', surfaces: ['floor'], pattern: 'carpet',
    color: '#cdbfa8', roughness: 0.97, kgPerM2: 2.6, pricePerM2: 18, laborPerM2: 15, repeat: [0.5, 0.5],
    appeal: 0.42, tintable: true, motif: 'berber',
  },
  {
    id: 'carpet_plush', name: 'Plush cut pile', group: 'Carpet', surfaces: ['floor'], pattern: 'carpet',
    color: '#8e8f8a', roughness: 0.98, kgPerM2: 5.5, pricePerM2: 30, laborPerM2: 15, repeat: [0.5, 0.5],
    appeal: 0.55, tintable: true, motif: 'plush',
  },
  {
    id: 'rubber_coin', name: 'Coin-grip rubber', group: 'Rubber', surfaces: ['floor'], pattern: 'rubber',
    color: '#3a3b3d', roughness: 0.7, kgPerM2: 7.5, pricePerM2: 28, laborPerM2: 12, repeat: [0.3, 0.3],
    appeal: 0.32, tintable: true, motif: 'coin',
  },
  {
    id: 'cork_plank', name: 'Cork plank', group: 'Cork', surfaces: ['floor'], pattern: 'cork',
    color: '#b98f61', roughness: 0.8, kgPerM2: 5, pricePerM2: 40, laborPerM2: 20, repeat: [0.3, 0.9],
    appeal: 0.7, tintable: true, plank: { widths: [0.3], lengths: [0.9] },
  },
  {
    id: 'lvt_slate', name: 'Slate-look vinyl tile', group: 'Tile-look', surfaces: ['floor'], pattern: 'tile',
    color: '#5e6066', roughness: 0.65, kgPerM2: 6, pricePerM2: 30, laborPerM2: 25, repeat: [0.3, 0.6],
    appeal: 0.66, tintable: true, motif: 'slate', color2: '#3a3c40',
  },
  {
    id: 'lvt_terrazzo', name: 'Terrazzo-look vinyl tile', group: 'Tile-look', surfaces: ['floor'],
    pattern: 'tile', color: '#e4ddd2', roughness: 0.5, kgPerM2: 6, pricePerM2: 34, laborPerM2: 25,
    repeat: [0.6, 0.6], appeal: 0.74, tintable: true, motif: 'terrazzo', color2: '#9a8f80',
  },
  {
    id: 'marine_teak_holly', name: 'Teak & holly marine vinyl', group: 'Marine / RV', surfaces: ['floor'],
    pattern: 'plank', color: '#8a5a32', roughness: 0.55, kgPerM2: 3.2, pricePerM2: 55, laborPerM2: 18,
    repeat: [0.1, 1.2], appeal: 0.82, tintable: false, motif: 'teakholly', color2: '#e9dcc0',
  },

  // ───────────── Walls and ceilings ─────────────
  {
    id: 'factory_wallboard', name: 'Floral wallboard (2004)', group: 'Factory', surfaces: ['wall', 'ceiling'],
    pattern: 'wallpaper', color: '#e6dac4', roughness: 0.85, kgPerM2: 0.6, pricePerM2: 16, laborPerM2: 15,
    repeat: [0.6, 0.6], appeal: 0.15, tintable: false, motif: 'floral_faded', color2: '#b9a07e',
  },
  {
    id: 'factory_hardboard', name: 'Faux-wood hardboard (1997)', group: 'Factory', surfaces: ['wall'],
    pattern: 'wood', color: '#9c7048', roughness: 0.6, kgPerM2: 3, pricePerM2: 18, laborPerM2: 25,
    repeat: [0.2, 2.4], appeal: 0.12, tintable: false, motif: 'hardboard', color2: '#7a5232',
  },
  {
    id: 'factory_ceiling', name: 'Padded ceiling vinyl (factory)', group: 'Factory', surfaces: ['ceiling'],
    pattern: 'textured', color: '#e9e0cc', roughness: 0.9, kgPerM2: 0.5, pricePerM2: 12, laborPerM2: 15,
    repeat: [0.6, 0.6], appeal: 0.2, tintable: false, motif: 'padded',
  },
  {
    id: 'paint_matte', name: 'Matte paint', group: 'Paint', surfaces: ['wall', 'ceiling', 'trim', 'cabinet'],
    pattern: 'paint', color: '#f2efe8', roughness: 0.85, kgPerM2: 0.25, pricePerM2: 8, laborPerM2: 14,
    repeat: [1, 1], appeal: 0.55, tintable: true,
  },
  {
    id: 'paint_satin', name: 'Satin enamel', group: 'Paint', surfaces: ['wall', 'ceiling', 'trim', 'cabinet'],
    pattern: 'paint', color: '#ffffff', roughness: 0.4, kgPerM2: 0.25, pricePerM2: 10, laborPerM2: 16,
    repeat: [1, 1], appeal: 0.6, tintable: true,
  },
  {
    id: 'wallpaper_pinstripe', name: 'Pinstripe wallpaper', group: 'Wallpaper', surfaces: ['wall'],
    pattern: 'wallpaper', color: '#f0ebe0', roughness: 0.8, kgPerM2: 0.35, pricePerM2: 18, laborPerM2: 22,
    repeat: [0.25, 0.5], appeal: 0.6, tintable: true, motif: 'stripe', color2: '#c9b99a',
  },
  {
    id: 'wallpaper_botanical', name: 'Botanical wallpaper', group: 'Wallpaper', surfaces: ['wall'],
    pattern: 'wallpaper', color: '#f3efe4', roughness: 0.8, kgPerM2: 0.35, pricePerM2: 24, laborPerM2: 22,
    repeat: [0.53, 0.53], appeal: 0.72, tintable: true, motif: 'botanical', color2: '#5d7a5a',
  },
  {
    id: 'wallpaper_geo', name: 'Geometric wallpaper', group: 'Wallpaper', surfaces: ['wall'],
    pattern: 'wallpaper', color: '#2f3d4a', roughness: 0.75, kgPerM2: 0.35, pricePerM2: 24, laborPerM2: 22,
    repeat: [0.3, 0.3], appeal: 0.7, tintable: true, motif: 'geometric', color2: '#d9b26a',
  },
  {
    id: 'peel_subway', name: 'Peel-and-stick subway tile', group: 'Tile-look', surfaces: ['wall'],
    pattern: 'tile', color: '#f4f2ee', roughness: 0.25, kgPerM2: 1.2, pricePerM2: 40, laborPerM2: 25,
    repeat: [0.15, 0.075], appeal: 0.74, tintable: true, motif: 'subway', color2: '#c8c6c2',
  },
  {
    id: 'fabric_wall_linen', name: 'Linen wall fabric', group: 'Fabric', surfaces: ['wall', 'ceiling'],
    pattern: 'fabric', color: '#d9cfbf', roughness: 0.95, kgPerM2: 0.4, pricePerM2: 28, laborPerM2: 25,
    repeat: [0.2, 0.2], appeal: 0.66, tintable: true, motif: 'linen',
  },
  {
    id: 'panel_birch', name: 'Birch plywood paneling', group: 'Wood paneling', surfaces: ['wall', 'ceiling'],
    pattern: 'wood', color: '#e3cda4', roughness: 0.6, kgPerM2: 3.2, pricePerM2: 35, laborPerM2: 30,
    repeat: [1.22, 2.44], appeal: 0.76, tintable: false, motif: 'birchply',
  },
  {
    id: 'shiplap_painted', name: 'Painted shiplap', group: 'Wood paneling', surfaces: ['wall', 'ceiling'],
    pattern: 'plank', color: '#f4f1ea', roughness: 0.7, kgPerM2: 4.5, pricePerM2: 30, laborPerM2: 35,
    repeat: [0.14, 2.4], appeal: 0.78, tintable: true, motif: 'shiplap',
  },
  {
    id: 'beadboard', name: 'Beadboard', group: 'Wood paneling', surfaces: ['wall', 'ceiling'],
    pattern: 'plank', color: '#f2efe6', roughness: 0.65, kgPerM2: 3, pricePerM2: 26, laborPerM2: 30,
    repeat: [0.04, 2.4], appeal: 0.7, tintable: true, motif: 'beadboard',
  },
  {
    id: 'cedar_tongue', name: 'Cedar tongue & groove', group: 'Wood paneling', surfaces: ['wall', 'ceiling'],
    pattern: 'plank', color: '#b57b4c', roughness: 0.7, kgPerM2: 4, pricePerM2: 45, laborPerM2: 35,
    repeat: [0.09, 2.4], appeal: 0.82, tintable: true, motif: 'tng',
  },
  {
    id: 'vinyl_wall_linen', name: 'Vinyl wallboard (linen)', group: 'Vinyl', surfaces: ['wall', 'ceiling'],
    pattern: 'textured', color: '#ece6da', roughness: 0.8, kgPerM2: 0.6, pricePerM2: 16, laborPerM2: 15,
    repeat: [0.5, 0.5], appeal: 0.42, tintable: true, motif: 'linen',
  },
  {
    id: 'textured_stipple', name: 'Stipple textured panel', group: 'Textured', surfaces: ['wall', 'ceiling'],
    pattern: 'textured', color: '#efe9de', roughness: 0.9, kgPerM2: 1, pricePerM2: 20, laborPerM2: 18,
    repeat: [0.4, 0.4], appeal: 0.48, tintable: true, motif: 'stipple',
  },
  {
    id: 'accent_slats', name: 'Oak slat accent panel', group: 'Accent', surfaces: ['wall'], pattern: 'plank',
    color: '#b48a5a', roughness: 0.6, kgPerM2: 5.5, pricePerM2: 85, laborPerM2: 40, repeat: [0.055, 2.4],
    appeal: 0.88, tintable: true, motif: 'slats', color2: '#2a2622',
  },

  // ───────────── Trim ─────────────
  {
    id: 'factory_trim_oak', name: 'Honey oak trim (factory)', group: 'Trim', surfaces: ['trim'],
    pattern: 'wood', color: '#b9803f', roughness: 0.5, kgPerM2: 6, pricePerM2: 20, laborPerM2: 20,
    repeat: [0.2, 1], appeal: 0.25, tintable: false,
  },
  {
    id: 'trim_walnut', name: 'Walnut trim', group: 'Trim', surfaces: ['trim'], pattern: 'wood',
    color: '#5d3f2b', roughness: 0.45, kgPerM2: 6, pricePerM2: 35, laborPerM2: 20, repeat: [0.2, 1],
    appeal: 0.8, tintable: false,
  },
  {
    id: 'trim_aluminum', name: 'Brushed aluminum trim', group: 'Trim', surfaces: ['trim', 'metal'],
    pattern: 'metal', color: '#c8ccd0', roughness: 0.35, kgPerM2: 4, pricePerM2: 40, laborPerM2: 20,
    repeat: [0.2, 1], appeal: 0.7, tintable: false, motif: 'brushed', metalness: 1,
  },

  // ───────────── Cabinet faces ─────────────
  {
    id: 'cab_honey_oak', name: 'Honey oak (factory)', group: 'Cabinet wood', surfaces: ['cabinet', 'frame'],
    pattern: 'wood', color: '#bb823f', roughness: 0.5, kgPerM2: 0, pricePerM2: 45, laborPerM2: 0,
    repeat: [0.3, 1], appeal: 0.25, tintable: false, motif: 'oak',
  },
  {
    id: 'cab_walnut', name: 'Walnut veneer', group: 'Cabinet wood', surfaces: ['cabinet', 'frame'],
    pattern: 'wood', color: '#5b3c28', roughness: 0.45, kgPerM2: 0, pricePerM2: 65, laborPerM2: 0,
    repeat: [0.3, 1], appeal: 0.85, tintable: false, motif: 'walnut',
  },
  {
    id: 'cab_white_oak', name: 'White oak veneer', group: 'Cabinet wood', surfaces: ['cabinet', 'frame'],
    pattern: 'wood', color: '#cdb48d', roughness: 0.5, kgPerM2: 0, pricePerM2: 60, laborPerM2: 0,
    repeat: [0.3, 1], appeal: 0.82, tintable: false, motif: 'oak',
  },
  {
    id: 'cab_birch_ply', name: 'Birch plywood', group: 'Cabinet wood', surfaces: ['cabinet', 'frame'],
    pattern: 'wood', color: '#e0c9a0', roughness: 0.55, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0,
    repeat: [0.3, 1], appeal: 0.75, tintable: false, motif: 'birchply',
  },
  {
    id: 'cab_teak', name: 'Teak', group: 'Cabinet wood', surfaces: ['cabinet', 'frame'], pattern: 'wood',
    color: '#9a6b3f', roughness: 0.5, kgPerM2: 0, pricePerM2: 70, laborPerM2: 0, repeat: [0.3, 1],
    appeal: 0.82, tintable: false, motif: 'teak',
  },
  {
    id: 'cab_gloss_laminate', name: 'Gloss laminate', group: 'Cabinet laminate', surfaces: ['cabinet'],
    pattern: 'plastic', color: '#f5f5f2', roughness: 0.18, kgPerM2: 0, pricePerM2: 45, laborPerM2: 0,
    repeat: [1, 1], appeal: 0.65, tintable: true,
  },

  // ───────────── Countertops ─────────────
  {
    id: 'counter_factory', name: 'Beige laminate (factory)', group: 'Countertops', surfaces: ['counter'],
    pattern: 'laminate', color: '#d9ccb0', roughness: 0.5, kgPerM2: 12, pricePerM2: 40, laborPerM2: 30,
    repeat: [0.6, 0.6], appeal: 0.22, tintable: false, motif: 'speckle', color2: '#b8a888',
  },
  {
    id: 'counter_stone_laminate', name: 'Stone-look laminate', group: 'Countertops', surfaces: ['counter'],
    pattern: 'laminate', color: '#c9c6c0', roughness: 0.4, kgPerM2: 12, pricePerM2: 55, laborPerM2: 30,
    repeat: [0.6, 0.6], appeal: 0.55, tintable: false, motif: 'stone', color2: '#8f8b85',
  },
  {
    id: 'counter_butcher', name: 'Butcher block', group: 'Countertops', surfaces: ['counter'],
    pattern: 'plank', color: '#c7955e', roughness: 0.45, kgPerM2: 17, pricePerM2: 120, laborPerM2: 30,
    repeat: [0.6, 0.6], appeal: 0.8, tintable: false, motif: 'butcher', color2: undefined,
  },
  {
    id: 'counter_solid_white', name: 'Solid surface', group: 'Countertops', surfaces: ['counter'],
    pattern: 'stone', color: '#f2f0ec', roughness: 0.3, kgPerM2: 20, pricePerM2: 180, laborPerM2: 30,
    repeat: [0.6, 0.6], appeal: 0.78, tintable: true, motif: 'solid', color2: '#d9d6d0',
  },
  {
    id: 'counter_quartz', name: 'Quartz composite', group: 'Countertops', surfaces: ['counter'],
    pattern: 'stone', color: '#ecebe8', roughness: 0.2, kgPerM2: 30, pricePerM2: 320, laborPerM2: 30,
    repeat: [0.6, 0.6], appeal: 0.92, tintable: false, motif: 'veined', color2: '#9b9a98',
  },
  {
    id: 'counter_stainless', name: 'Stainless steel', group: 'Countertops',
    surfaces: ['counter', 'appliance'], pattern: 'metal', color: '#b9bdc1', roughness: 0.3, kgPerM2: 12,
    pricePerM2: 220, laborPerM2: 30, repeat: [0.6, 0.6], appeal: 0.74, tintable: false, motif: 'brushed',
    color2: undefined, metalness: 1,
  },

  // ───────────── Upholstery ─────────────
  {
    id: 'uph_factory_tweed', name: 'Brown-green tweed (factory)', group: 'Upholstery',
    surfaces: ['upholstery'], pattern: 'fabric', color: '#6b6a4b', roughness: 0.95, kgPerM2: 0,
    pricePerM2: 30, laborPerM2: 0, repeat: [0.2, 0.2], appeal: 0.15, tintable: false, motif: 'tweed',
    color2: '#8a6e4c',
  },
  {
    id: 'uph_linen', name: 'Linen', group: 'Upholstery', surfaces: ['upholstery', 'window'],
    pattern: 'fabric', color: '#d8d0c2', roughness: 0.92, kgPerM2: 0, pricePerM2: 35, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.7, tintable: true, motif: 'linen', color2: undefined, transmission: 0.3,
  },
  {
    id: 'uph_velvet', name: 'Velvet', group: 'Upholstery', surfaces: ['upholstery'], pattern: 'fabric',
    color: '#2f5a52', roughness: 0.75, kgPerM2: 0, pricePerM2: 55, laborPerM2: 0, repeat: [0.2, 0.2],
    appeal: 0.82, tintable: true, motif: 'velvet', color2: undefined, sheen: 0.8,
  },
  {
    id: 'uph_boucle', name: 'Bouclé', group: 'Upholstery', surfaces: ['upholstery'], pattern: 'fabric',
    color: '#ece7dd', roughness: 0.98, kgPerM2: 0, pricePerM2: 60, laborPerM2: 0, repeat: [0.2, 0.2],
    appeal: 0.84, tintable: true, motif: 'boucle', color2: undefined,
  },
  {
    id: 'uph_canvas', name: 'Canvas', group: 'Upholstery', surfaces: ['upholstery', 'window'],
    pattern: 'fabric', color: '#b8a684', roughness: 0.9, kgPerM2: 0, pricePerM2: 28, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.6, tintable: true, motif: 'canvas', color2: undefined, transmission: 0.3,
  },
  {
    id: 'uph_plaid', name: 'Wool plaid', group: 'Upholstery', surfaces: ['upholstery'], pattern: 'fabric',
    color: '#7a2f2a', roughness: 0.92, kgPerM2: 0, pricePerM2: 45, laborPerM2: 0, repeat: [0.2, 0.2],
    appeal: 0.72, tintable: true, motif: 'plaid', color2: '#2f3b2e',
  },
  {
    id: 'uph_ticking', name: 'Ticking stripe', group: 'Upholstery', surfaces: ['upholstery', 'window'],
    pattern: 'fabric', color: '#f1ede4', roughness: 0.9, kgPerM2: 0, pricePerM2: 32, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.66, tintable: true, motif: 'stripe', color2: '#3d5a7a', transmission: 0.3,
  },
  {
    id: 'uph_leather', name: 'Leather', group: 'Upholstery', surfaces: ['upholstery'], pattern: 'leather',
    color: '#7a4a2c', roughness: 0.45, kgPerM2: 0, pricePerM2: 120, laborPerM2: 0, repeat: [0.2, 0.2],
    appeal: 0.86, tintable: true, motif: undefined, color2: undefined, clearcoat: 0.3,
  },
  {
    id: 'uph_faux_leather', name: 'Faux leather', group: 'Upholstery', surfaces: ['upholstery'],
    pattern: 'leather', color: '#2e2e30', roughness: 0.35, kgPerM2: 0, pricePerM2: 45, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.6, tintable: true, motif: 'vinyl', color2: undefined,
  },

  // ───────────── Window fabrics ─────────────
  {
    id: 'win_factory_print', name: 'Floral print (factory)', group: 'Curtain', surfaces: ['window'],
    pattern: 'fabric', color: '#c9b48c', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0,
    repeat: [0.3, 0.3], appeal: 0.12, tintable: false, motif: 'floralprint', color2: '#8a5a4a',
    transmission: 0.3,
  },
  {
    id: 'win_factory_gingham', name: 'Gingham (homemade)', group: 'Curtain', surfaces: ['window'],
    pattern: 'fabric', color: '#e8dcc8', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0,
    repeat: [0.3, 0.3], appeal: 0.18, tintable: false, motif: 'check', color2: '#b8553a', transmission: 0.35,
  },
  {
    id: 'win_factory_quilted', name: 'Quilted valance (factory)', group: 'Valance', surfaces: ['window'],
    pattern: 'fabric', color: '#8a6d56', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0,
    repeat: [0.3, 0.3], appeal: 0.1, tintable: false, motif: 'quilted', color2: '#c2a882', transmission: 0.05,
  },
  {
    id: 'win_blackout', name: 'Blackout weave', group: 'Blackout', surfaces: ['window'], pattern: 'fabric',
    color: '#4a4d52', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0, repeat: [0.3, 0.3],
    appeal: 0.68, tintable: true, motif: 'blackout', color2: undefined, transmission: 0.02,
  },
  {
    id: 'win_blackout_linen', name: 'Linen-look blackout', group: 'Blackout', surfaces: ['window'],
    pattern: 'fabric', color: '#d9d0c0', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0,
    repeat: [0.3, 0.3], appeal: 0.72, tintable: true, motif: 'linen', color2: undefined, transmission: 0.03,
  },
  {
    id: 'win_solar_screen', name: 'Solar screen', group: 'Solar', surfaces: ['window'], pattern: 'fabric',
    color: '#3b3d40', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0, repeat: [0.3, 0.3],
    appeal: 0.62, tintable: true, motif: 'screen', color2: undefined, transmission: 0.22,
  },
  {
    id: 'win_sheer', name: 'Sheer voile', group: 'Sheer', surfaces: ['window'], pattern: 'fabric',
    color: '#f7f5f0', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0, repeat: [0.3, 0.3],
    appeal: 0.6, tintable: true, motif: 'sheer', color2: undefined, transmission: 0.62,
  },
  {
    id: 'win_linen', name: 'Linen curtain', group: 'Curtain', surfaces: ['window'], pattern: 'fabric',
    color: '#e4dccd', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0, repeat: [0.3, 0.3],
    appeal: 0.7, tintable: true, motif: 'linen', color2: undefined, transmission: 0.3,
  },
  {
    id: 'win_cotton_print', name: 'Cotton print', group: 'Curtain', surfaces: ['window'], pattern: 'fabric',
    color: '#f0ebe1', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0, repeat: [0.3, 0.3],
    appeal: 0.68, tintable: true, motif: 'print', color2: '#6a8a6a', transmission: 0.25,
  },
  {
    id: 'win_thermal', name: 'Insulated quilted', group: 'Insulated', surfaces: ['window'], pattern: 'fabric',
    color: '#5a6a72', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0, repeat: [0.3, 0.3],
    appeal: 0.6, tintable: true, motif: 'quilted', color2: undefined, transmission: 0.03,
  },
  {
    id: 'win_pleat_light', name: 'Light-filtering pleat', group: 'Pleated', surfaces: ['window'],
    pattern: 'fabric', color: '#efe8dc', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0,
    repeat: [0.3, 0.3], appeal: 0.6, tintable: true, motif: 'pleat', color2: undefined, transmission: 0.35,
  },
  {
    id: 'win_pleat_blackout', name: 'Blackout pleat', group: 'Pleated', surfaces: ['window'],
    pattern: 'fabric', color: '#d7cfc2', roughness: 0.9, kgPerM2: 0, pricePerM2: 0, laborPerM2: 0,
    repeat: [0.3, 0.3], appeal: 0.66, tintable: true, motif: 'pleat', color2: undefined, transmission: 0.02,
  },

  // ───────────── Metals ─────────────
  {
    id: 'metal_nickel', name: 'Brushed nickel', group: 'Metals', surfaces: ['metal', 'frame'],
    pattern: 'metal', color: '#b8b6b0', roughness: 0.35, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.7, tintable: false, motif: 'brushed', metalness: 1,
  },
  {
    id: 'metal_black', name: 'Matte black', group: 'Metals', surfaces: ['metal', 'frame'], pattern: 'metal',
    color: '#1d1d1f', roughness: 0.6, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0, repeat: [0.2, 0.2],
    appeal: 0.75, tintable: false, motif: 'powder', metalness: 0.6,
  },
  {
    id: 'metal_brass', name: 'Brushed brass', group: 'Metals', surfaces: ['metal', 'frame'], pattern: 'metal',
    color: '#c4a062', roughness: 0.35, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0, repeat: [0.2, 0.2],
    appeal: 0.78, tintable: false, motif: 'brushed', metalness: 1,
  },
  {
    id: 'metal_chrome', name: 'Polished chrome', group: 'Metals', surfaces: ['metal', 'frame'],
    pattern: 'metal', color: '#e4e6e8', roughness: 0.08, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.6, tintable: false, motif: 'polished', metalness: 1,
  },
  {
    id: 'metal_bronze', name: 'Oil-rubbed bronze', group: 'Metals', surfaces: ['metal', 'frame'],
    pattern: 'metal', color: '#4a3527', roughness: 0.45, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.66, tintable: false, motif: 'powder', metalness: 0.8,
  },
  {
    id: 'metal_brass_factory', name: 'Polished brass (factory)', group: 'Metals',
    surfaces: ['metal', 'frame'], pattern: 'metal', color: '#d2b05a', roughness: 0.15, kgPerM2: 0,
    pricePerM2: 40, laborPerM2: 0, repeat: [0.2, 0.2], appeal: 0.2, tintable: false, motif: 'polished',
    metalness: 1,
  },

  // ───────────── Appliance shells ─────────────
  {
    id: 'app_white', name: 'White', group: 'Appliance shells', surfaces: ['appliance'], pattern: 'plastic',
    color: '#f3f3f0', roughness: 0.35, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0, repeat: [0.2, 0.2],
    appeal: 0.4, tintable: false, metalness: 0,
  },
  {
    id: 'app_almond', name: 'Almond (factory)', group: 'Appliance shells', surfaces: ['appliance'],
    pattern: 'plastic', color: '#e8dcc2', roughness: 0.4, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.2, tintable: false, metalness: 0,
  },
  {
    id: 'app_stainless', name: 'Stainless', group: 'Appliance shells', surfaces: ['appliance'],
    pattern: 'metal', color: '#c3c6c9', roughness: 0.3, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.75, tintable: false, metalness: 1, motif: 'brushed',
  },
  {
    id: 'app_black', name: 'Black stainless', group: 'Appliance shells', surfaces: ['appliance'],
    pattern: 'metal', color: '#3a3b3d', roughness: 0.35, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0,
    repeat: [0.2, 0.2], appeal: 0.78, tintable: false, metalness: 0.9, motif: 'brushed',
  },

  // ───────────── Rugs ─────────────
  {
    id: 'rug_kilim', name: 'Kilim wool', group: 'Rugs', surfaces: ['rug'], pattern: 'fabric',
    color: '#b5452f', roughness: 0.95, kgPerM2: 0, pricePerM2: 25, laborPerM2: 0, repeat: [0.6, 0.9],
    appeal: 0.78, tintable: true, motif: 'kilim', color2: '#2f4a5a',
  },
  {
    id: 'rug_jute', name: 'Jute', group: 'Rugs', surfaces: ['rug'], pattern: 'fabric', color: '#b9a06e',
    roughness: 0.98, kgPerM2: 0, pricePerM2: 25, laborPerM2: 0, repeat: [0.6, 0.9], appeal: 0.7,
    tintable: true, motif: 'jute', color2: undefined,
  },
  {
    id: 'rug_shag', name: 'Shag', group: 'Rugs', surfaces: ['rug'], pattern: 'carpet', color: '#efe9df',
    roughness: 1, kgPerM2: 0, pricePerM2: 25, laborPerM2: 0, repeat: [0.6, 0.9], appeal: 0.66, tintable: true,
    motif: 'shag', color2: undefined,
  },
  {
    id: 'rug_stripe', name: 'Striped cotton', group: 'Rugs', surfaces: ['rug'], pattern: 'fabric',
    color: '#e8e0d0', roughness: 0.95, kgPerM2: 0, pricePerM2: 25, laborPerM2: 0, repeat: [0.6, 0.9],
    appeal: 0.64, tintable: true, motif: 'stripe', color2: '#2f4f6f',
  },

  // ───────────── Art ─────────────
  {
    id: 'art_desert', name: 'desert', group: 'Art prints', surfaces: ['decor'], pattern: 'wallpaper',
    color: '#e4d6bc', roughness: 0.85, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0, repeat: [0.5, 0.4],
    appeal: 0.8, tintable: false, motif: 'art_desert',
  },
  {
    id: 'art_mountains', name: 'mountains', group: 'Art prints', surfaces: ['decor'], pattern: 'wallpaper',
    color: '#e4d6bc', roughness: 0.85, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0, repeat: [0.5, 0.4],
    appeal: 0.8, tintable: false, motif: 'art_mountains',
  },
  {
    id: 'art_botanical', name: 'botanical', group: 'Art prints', surfaces: ['decor'], pattern: 'wallpaper',
    color: '#e4d6bc', roughness: 0.85, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0, repeat: [0.5, 0.4],
    appeal: 0.8, tintable: false, motif: 'art_botanical',
  },
  {
    id: 'art_abstract', name: 'abstract', group: 'Art prints', surfaces: ['decor'], pattern: 'wallpaper',
    color: '#e4d6bc', roughness: 0.85, kgPerM2: 0, pricePerM2: 40, laborPerM2: 0, repeat: [0.5, 0.4],
    appeal: 0.8, tintable: false, motif: 'art_abstract',
  },
];

export const MATERIAL_LIST: readonly MaterialDef[] = list;
export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(list.map((d) => [d.id, d]));
export function materialDef(id: string): MaterialDef {
  const def = MATERIALS[id];
  if (!def) throw new Error(`Unknown material ${id}`);
  return def;
}

export const PALETTE: readonly string[] = [
  '#ffffff', '#f7f3ea', '#eee5d3', '#e5dccd', '#d5cbbd', '#c4b6a6', '#ad9c8c', '#908276',
  '#d8d9d6', '#b9bcb9', '#929895', '#656b69', '#3c4140', '#242625', '#151515', '#c7955e',
  '#a87545', '#795438', '#5b3c28', '#35251e', '#bd7356', '#a35238', '#c39b42', '#ad8439',
  '#d0d9c5', '#9dab91', '#7e8655', '#405c43', '#25463b', '#6f9990', '#a6c9d8', '#bed0dc',
  '#537998', '#263e62', '#3d8b8b', '#245b5b', '#e4c2b6', '#bd8d8e', '#8e3e54', '#9c7d8e',
  '#614457', '#f0df9a', '#e4bb3c', '#d88539', '#b65e30', '#e8e0d0', '#b9a06e', '#6b4a35',
];

const coveringList: CoveringSpec[] = [
  {
    type: 'none', name: 'No covering', description: 'Bare window.', basePrice: 0, pricePerM2: 0, kgPerM2: 0,
    laborMin: 5, fabrics: [], defaultFabric: '',
  },
  {
    type: 'curtains', name: 'Curtains (pair)', description: 'Gathered fabric curtains.', basePrice: 25,
    pricePerM2: 22, kgPerM2: 0.7, laborMin: 15, fabrics: ['Curtain', 'Blackout', 'Insulated', 'Upholstery'],
    defaultFabric: 'win_linen',
  },
  {
    type: 'sheer', name: 'Sheer curtains', description: 'Soft, light-filtering curtains.', basePrice: 20,
    pricePerM2: 18, kgPerM2: 0.3, laborMin: 12, fabrics: ['Sheer'], defaultFabric: 'win_sheer',
  },
  {
    type: 'blackout_roller', name: 'Blackout roller shade', description: 'A compact room-darkening roller.',
    basePrice: 55, pricePerM2: 45, kgPerM2: 1, laborMin: 20, fabrics: ['Blackout'],
    defaultFabric: 'win_blackout',
  },
  {
    type: 'solar_roller', name: 'Solar roller shade',
    description: 'Filters sunlight while preserving the view.', basePrice: 50, pricePerM2: 40, kgPerM2: 0.8,
    laborMin: 20, fabrics: ['Solar'], defaultFabric: 'win_solar_screen',
  },
  {
    type: 'pleated', name: 'Pleated shade', description: 'An accordion shade.', basePrice: 45, pricePerM2: 70,
    kgPerM2: 0.7, laborMin: 20, fabrics: ['Pleated'], defaultFabric: 'win_pleat_light',
  },
  {
    type: 'day_night', name: 'Day/night pleated shade', description: 'Independent day and night layers.',
    basePrice: 80, pricePerM2: 110, kgPerM2: 1.1, laborMin: 25, fabrics: ['Sheer', 'Solar', 'Pleated'],
    fabrics2: ['Blackout', 'Pleated'], defaultFabric: 'win_solar_screen',
    defaultFabric2: 'win_pleat_blackout',
  },
  {
    type: 'roman', name: 'Roman shade', description: 'Fabric folds into a neat stack.', basePrice: 40,
    pricePerM2: 75, kgPerM2: 1.3, laborMin: 25, fabrics: ['Curtain', 'Blackout', 'Upholstery'],
    defaultFabric: 'win_linen',
  },
  {
    type: 'insulated', name: 'Insulated cellular shade', description: 'Quilted privacy and light control.',
    basePrice: 60, pricePerM2: 85, kgPerM2: 1.2, laborMin: 20, fabrics: ['Insulated'],
    defaultFabric: 'win_thermal',
  },
  {
    type: 'privacy_screen', name: 'Snap-in privacy screen', description: 'A removable window privacy panel.',
    basePrice: 15, pricePerM2: 15, kgPerM2: 0.4, laborMin: 8, fabrics: ['Blackout', 'Solar', 'Insulated'],
    defaultFabric: 'win_blackout',
  },
];
export const COVERINGS: Record<CoveringType, CoveringSpec> = Object.fromEntries(coveringList.map((d) => [d.type, d])) as Record<CoveringType, CoveringSpec>;
