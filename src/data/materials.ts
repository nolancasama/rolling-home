import type { CoveringSpec, CoveringType, MaterialDef, MaterialPattern, SurfaceKind } from './types';

// Content defaults are deliberately explicit; procedural renderers consume the same data as the simulation.
const list: MaterialDef[] = [];
function add(id: string, name: string, group: string, surfaces: SurfaceKind[], pattern: MaterialPattern,
  color: string, roughness: number, kgPerM2: number, pricePerM2: number, laborPerM2: number,
  repeat: [number, number], appeal: number, tintable: boolean, extra: Partial<MaterialDef> = {}): void {
  list.push({ id, name, group, surfaces, pattern, color, roughness, kgPerM2, pricePerM2, laborPerM2, repeat, appeal, tintable, ...extra });
}
const plank = { widths: [0.18, 0.15, 0.23], lengths: [1.22, 0.91, 1.52] };
add('factory_carpet', 'Factory berber (2004)', 'Factory', ['floor'], 'carpet', '#8a7468', .96, 2.6, 18, 15, [.5,.5], .12, false, { motif:'berber', color2:'#6e5a52' });
add('factory_vinyl', 'Factory sheet vinyl (2004)', 'Factory', ['floor'], 'sheet', '#b89a72', .6, 2.4, 12, 12, [.6,.6], .18, false, { motif:'parquet', color2:'#9a7d58' });
add('factory_plywood', 'Sealed plywood (homemade)', 'Factory', ['floor'], 'wood', '#c8a777', .7, .4, 6, 10, [1.22,2.44], .12, false, { motif:'ply', color2:'#a88554' });
for (const [id, name, color, rough, kg, price, labor, appeal] of [
  ['lvp_natural_oak','Natural oak','#c49a6c',.55,10.5,32,18,.74],
  ['lvp_driftwood','Driftwood grey','#a39c92',.55,10.5,32,18,.72],
  ['lvp_smoked_walnut','Smoked walnut','#6b4a35',.5,10.5,34,18,.78],
  ['lvp_glue_thin','Thin glue-down plank (2 mm)','#b48a62',.6,4.5,26,24,.66],
] as const) add(id,name,'Luxury vinyl plank',['floor'],'plank',color,rough,kg,price,labor,[.18,1.22],appeal,true,{plank});
add('sheet_vinyl_checker','Checkerboard sheet vinyl','Sheet vinyl',['floor'],'sheet','#efe8da',.45,2.6,14,12,[.6,.6],.55,true,{motif:'checker',color2:'#2b2b2b'});
add('laminate_hickory','Rustic hickory laminate','Laminate',['floor'],'plank','#a7774e',.5,8,24,20,[.19,1.29],.62,true,{motif:'knots',plank:{widths:[.19],lengths:[1.29]}});
add('hw_herringbone','Herringbone oak look','Hardwood-look',['floor'],'plank','#b88c5e',.5,9.5,48,35,[.09,.45],.88,true,{motif:'herringbone',plank:{widths:[.09],lengths:[.45]}});
add('engineered_oak','Engineered oak','Engineered wood',['floor'],'plank','#b9905f',.45,9.8,70,30,[.19,1.9],.9,true,{plank:{widths:[.19,.24],lengths:[1.9]}});
add('carpet_oatmeal','Oatmeal berber','Carpet',['floor'],'carpet','#cdbfa8',.97,2.6,18,15,[.5,.5],.42,true,{motif:'berber'});
add('carpet_plush','Plush cut pile','Carpet',['floor'],'carpet','#8e8f8a',.98,5.5,30,15,[.5,.5],.55,true,{motif:'plush'});
add('rubber_coin','Coin-grip rubber','Rubber',['floor'],'rubber','#3a3b3d',.7,7.5,28,12,[.3,.3],.32,true,{motif:'coin'});
add('cork_plank','Cork plank','Cork',['floor'],'cork','#b98f61',.8,5,40,20,[.3,.9],.7,true,{plank:{widths:[.3],lengths:[.9]}});
add('lvt_slate','Slate-look vinyl tile','Tile-look',['floor'],'tile','#5e6066',.65,6,30,25,[.3,.6],.66,true,{motif:'slate',color2:'#3a3c40'});
add('lvt_terrazzo','Terrazzo-look vinyl tile','Tile-look',['floor'],'tile','#e4ddd2',.5,6,34,25,[.6,.6],.74,true,{motif:'terrazzo',color2:'#9a8f80'});
add('marine_teak_holly','Teak & holly marine vinyl','Marine / RV',['floor'],'plank','#8a5a32',.55,3.2,55,18,[.1,1.2],.82,false,{motif:'teakholly',color2:'#e9dcc0'});

add('factory_wallboard','Floral wallboard (2004)','Factory',['wall','ceiling'],'wallpaper','#e6dac4',.85,.6,16,15,[.6,.6],.15,false,{motif:'floral_faded',color2:'#b9a07e'});
add('factory_hardboard','Faux-wood hardboard (1997)','Factory',['wall'],'wood','#9c7048',.6,3,18,25,[.2,2.4],.12,false,{motif:'hardboard',color2:'#7a5232'});
add('factory_ceiling','Padded ceiling vinyl (factory)','Factory',['ceiling'],'textured','#e9e0cc',.9,.5,12,15,[.6,.6],.2,false,{motif:'padded'});
add('paint_matte','Matte paint','Paint',['wall','ceiling','trim','cabinet'],'paint','#f2efe8',.85,.25,8,14,[1,1],.55,true);
add('paint_satin','Satin enamel','Paint',['wall','ceiling','trim','cabinet'],'paint','#ffffff',.4,.25,10,16,[1,1],.6,true);
for (const [id,name,motif,color,color2,r,price,repeat,appeal] of [
  ['wallpaper_pinstripe','Pinstripe wallpaper','stripe','#f0ebe0','#c9b99a',.8,18,[.25,.5],.6],
  ['wallpaper_botanical','Botanical wallpaper','botanical','#f3efe4','#5d7a5a',.8,24,[.53,.53],.72],
  ['wallpaper_geo','Geometric wallpaper','geometric','#2f3d4a','#d9b26a',.75,24,[.3,.3],.7],
] as const) add(id,name,'Wallpaper',['wall'],'wallpaper',color,r,.35,price,22,[...repeat],appeal,true,{motif,color2});
add('peel_subway','Peel-and-stick subway tile','Tile-look',['wall'],'tile','#f4f2ee',.25,1.2,40,25,[.15,.075],.74,true,{motif:'subway',color2:'#c8c6c2'});
add('fabric_wall_linen','Linen wall fabric','Fabric',['wall','ceiling'],'fabric','#d9cfbf',.95,.4,28,25,[.2,.2],.66,true,{motif:'linen'});
add('panel_birch','Birch plywood paneling','Wood paneling',['wall','ceiling'],'wood','#e3cda4',.6,3.2,35,30,[1.22,2.44],.76,false,{motif:'birchply'});
for (const [id,name,motif,color,r,kg,price,labor,repeat,appeal] of [
  ['shiplap_painted','Painted shiplap','shiplap','#f4f1ea',.7,4.5,30,35,.14,.78],
  ['beadboard','Beadboard','beadboard','#f2efe6',.65,3,26,30,.04,.7],
  ['cedar_tongue','Cedar tongue & groove','tng','#b57b4c',.7,4,45,35,.09,.82],
] as const) add(id,name,'Wood paneling',['wall','ceiling'],'plank',color,r,kg,price,labor,[repeat,2.4],appeal,true,{motif});
add('vinyl_wall_linen','Vinyl wallboard (linen)','Vinyl',['wall','ceiling'],'textured','#ece6da',.8,.6,16,15,[.5,.5],.42,true,{motif:'linen'});
add('textured_stipple','Stipple textured panel','Textured',['wall','ceiling'],'textured','#efe9de',.9,1,20,18,[.4,.4],.48,true,{motif:'stipple'});
add('accent_slats','Oak slat accent panel','Accent',['wall'],'plank','#b48a5a',.6,5.5,85,40,[.055,2.4],.88,true,{motif:'slats',color2:'#2a2622'});
add('factory_trim_oak','Honey oak trim (factory)','Trim',['trim'],'wood','#b9803f',.5,6,20,20,[.2,1],.25,false);
add('trim_walnut','Walnut trim','Trim',['trim'],'wood','#5d3f2b',.45,6,35,20,[.2,1],.8,false);
add('trim_aluminum','Brushed aluminum trim','Trim',['trim','metal'],'metal','#c8ccd0',.35,4,40,20,[.2,1],.7,false,{motif:'brushed',metalness:1});
for (const [id,name,color,r,price,appeal,motif] of [
  ['cab_honey_oak','Honey oak (factory)','#bb823f',.5,45,.25,'oak'],
  ['cab_walnut','Walnut veneer','#5b3c28',.45,65,.85,'walnut'],
  ['cab_white_oak','White oak veneer','#cdb48d',.5,60,.82,'oak'],
  ['cab_birch_ply','Birch plywood','#e0c9a0',.55,40,.75,'birchply'],
  ['cab_teak','Teak','#9a6b3f',.5,70,.82,'teak'],
] as const) add(id,name,'Cabinet wood',['cabinet','frame'],'wood',color,r,0,price,0,[.3,1],appeal,false,{motif});
add('cab_gloss_laminate','Gloss laminate','Cabinet laminate',['cabinet'],'plastic','#f5f5f2',.18,0,45,0,[1,1],.65,true);
for (const [id,name,pattern,motif,color,color2,r,kg,price,appeal,tintable] of [
  ['counter_factory','Beige laminate (factory)','laminate','speckle','#d9ccb0','#b8a888',.5,12,40,.22,false],
  ['counter_stone_laminate','Stone-look laminate','laminate','stone','#c9c6c0','#8f8b85',.4,12,55,.55,false],
  ['counter_butcher','Butcher block','plank','butcher','#c7955e',undefined,.45,17,120,.8,false],
  ['counter_solid_white','Solid surface','stone','solid','#f2f0ec','#d9d6d0',.3,20,180,.78,true],
  ['counter_quartz','Quartz composite','stone','veined','#ecebe8','#9b9a98',.2,30,320,.92,false],
  ['counter_stainless','Stainless steel','metal','brushed','#b9bdc1',undefined,.3,12,220,.74,false],
] as const) add(id,name,'Countertops',id==='counter_stainless'?['counter','appliance']:['counter'],pattern,color,r,kg,price,30,[.6,.6],appeal,tintable,{motif,color2,...(pattern==='metal'?{metalness:1}:{})});
for (const [id,name,pattern,motif,color,color2,r,price,appeal] of [
  ['uph_factory_tweed','Brown-green tweed (factory)','fabric','tweed','#6b6a4b','#8a6e4c',.95,30,.15],
  ['uph_linen','Linen','fabric','linen','#d8d0c2',undefined,.92,35,.7],
  ['uph_velvet','Velvet','fabric','velvet','#2f5a52',undefined,.75,55,.82],
  ['uph_boucle','Bouclé','fabric','boucle','#ece7dd',undefined,.98,60,.84],
  ['uph_canvas','Canvas','fabric','canvas','#b8a684',undefined,.9,28,.6],
  ['uph_plaid','Wool plaid','fabric','plaid','#7a2f2a','#2f3b2e',.92,45,.72],
  ['uph_ticking','Ticking stripe','fabric','stripe','#f1ede4','#3d5a7a',.9,32,.66],
  ['uph_leather','Leather','leather',undefined,'#7a4a2c',undefined,.45,120,.86],
  ['uph_faux_leather','Faux leather','leather','vinyl','#2e2e30',undefined,.35,45,.6],
] as const) add(id,name,'Upholstery',['uph_linen','uph_canvas','uph_ticking'].includes(id)?['upholstery','window']:['upholstery'],pattern,color,r,0,price,0,[.2,.2],appeal,id!=='uph_factory_tweed',{motif,color2,...(id==='uph_velvet'?{sheen:.8}:{}),...(id==='uph_leather'?{clearcoat:.3}:{}),...(['uph_linen','uph_canvas','uph_ticking'].includes(id)?{transmission:.3}:{})});
for (const [id,name,group,motif,color,color2,transmission,appeal] of [
  ['win_factory_print','Floral print (factory)','Curtain','floralprint','#c9b48c','#8a5a4a',.3,.12],
  ['win_factory_gingham','Gingham (homemade)','Curtain','check','#e8dcc8','#b8553a',.35,.18],
  ['win_factory_quilted','Quilted valance (factory)','Valance','quilted','#8a6d56','#c2a882',.05,.1],
  ['win_blackout','Blackout weave','Blackout','blackout','#4a4d52',undefined,.02,.68],
  ['win_blackout_linen','Linen-look blackout','Blackout','linen','#d9d0c0',undefined,.03,.72],
  ['win_solar_screen','Solar screen','Solar','screen','#3b3d40',undefined,.22,.62],
  ['win_sheer','Sheer voile','Sheer','sheer','#f7f5f0',undefined,.62,.6],
  ['win_linen','Linen curtain','Curtain','linen','#e4dccd',undefined,.3,.7],
  ['win_cotton_print','Cotton print','Curtain','print','#f0ebe1','#6a8a6a',.25,.68],
  ['win_thermal','Insulated quilted','Insulated','quilted','#5a6a72',undefined,.03,.6],
  ['win_pleat_light','Light-filtering pleat','Pleated','pleat','#efe8dc',undefined,.35,.6],
  ['win_pleat_blackout','Blackout pleat','Pleated','pleat','#d7cfc2',undefined,.02,.66],
] as const) add(id,name,group,['window'],'fabric',color,.9,0,0,0,[.3,.3],appeal,!id.startsWith('win_factory'),{motif,color2,transmission});
for (const [id,name,motif,color,r,metalness,appeal] of [
  ['metal_nickel','Brushed nickel','brushed','#b8b6b0',.35,1,.7],
  ['metal_black','Matte black','powder','#1d1d1f',.6,.6,.75],
  ['metal_brass','Brushed brass','brushed','#c4a062',.35,1,.78],
  ['metal_chrome','Polished chrome','polished','#e4e6e8',.08,1,.6],
  ['metal_bronze','Oil-rubbed bronze','powder','#4a3527',.45,.8,.66],
  ['metal_brass_factory','Polished brass (factory)','polished','#d2b05a',.15,1,.2],
] as const) add(id,name,'Metals',['metal','frame'],'metal',color,r,0,40,0,[.2,.2],appeal,false,{motif,metalness});
for (const [id,name,color,r,appeal,metalness] of [
  ['app_white','White','#f3f3f0',.35,.4,0],['app_almond','Almond (factory)','#e8dcc2',.4,.2,0],
  ['app_stainless','Stainless','#c3c6c9',.3,.75,1],['app_black','Black stainless','#3a3b3d',.35,.78,.9],
] as const) add(id,name,'Appliance shells',['appliance'],metalness?'metal':'plastic',color,r,0,40,0,[.2,.2],appeal,false,{metalness,...(metalness?{motif:'brushed'}:{})});
for (const [id,name,pattern,motif,color,color2,r,appeal] of [
  ['rug_kilim','Kilim wool','fabric','kilim','#b5452f','#2f4a5a',.95,.78],
  ['rug_jute','Jute','fabric','jute','#b9a06e',undefined,.98,.7],
  ['rug_shag','Shag','carpet','shag','#efe9df',undefined,1,.66],
  ['rug_stripe','Striped cotton','fabric','stripe','#e8e0d0','#2f4f6f',.95,.64],
] as const) add(id,name,'Rugs',['rug'],pattern,color,r,0,25,0,[.6,.9],appeal,true,{motif,color2});
for (const id of ['art_desert','art_mountains','art_botanical','art_abstract']) add(id,id.slice(4).replace('_',' '),'Art prints',['decor'],'wallpaper','#e4d6bc',.85,0,40,0,[.5,.4],.8,false,{motif:id});

export const MATERIAL_LIST: readonly MaterialDef[] = list;
export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(list.map(d=>[d.id,d]));
export function materialDef(id: string): MaterialDef {
  const def = MATERIALS[id];
  if (!def) throw new Error(`Unknown material ${id}`);
  return def;
}

export const PALETTE: readonly string[] = [
  '#ffffff','#f7f3ea','#eee5d3','#e5dccd','#d5cbbd','#c4b6a6','#ad9c8c','#908276',
  '#d8d9d6','#b9bcb9','#929895','#656b69','#3c4140','#242625','#151515','#c7955e',
  '#a87545','#795438','#5b3c28','#35251e','#bd7356','#a35238','#c39b42','#ad8439',
  '#d0d9c5','#9dab91','#7e8655','#405c43','#25463b','#6f9990','#a6c9d8','#bed0dc',
  '#537998','#263e62','#3d8b8b','#245b5b','#e4c2b6','#bd8d8e','#8e3e54','#9c7d8e',
  '#614457','#f0df9a','#e4bb3c','#d88539','#b65e30','#e8e0d0','#b9a06e','#6b4a35',
];

const coveringList: CoveringSpec[] = [
  {type:'none',name:'No covering',description:'Bare window.',basePrice:0,pricePerM2:0,kgPerM2:0,laborMin:5,fabrics:[],defaultFabric:''},
  {type:'curtains',name:'Curtains (pair)',description:'Gathered fabric curtains.',basePrice:25,pricePerM2:22,kgPerM2:.7,laborMin:15,fabrics:['Curtain','Blackout','Insulated','Upholstery'],defaultFabric:'win_linen'},
  {type:'sheer',name:'Sheer curtains',description:'Soft, light-filtering curtains.',basePrice:20,pricePerM2:18,kgPerM2:.3,laborMin:12,fabrics:['Sheer'],defaultFabric:'win_sheer'},
  {type:'blackout_roller',name:'Blackout roller shade',description:'A compact room-darkening roller.',basePrice:55,pricePerM2:45,kgPerM2:1,laborMin:20,fabrics:['Blackout'],defaultFabric:'win_blackout'},
  {type:'solar_roller',name:'Solar roller shade',description:'Filters sunlight while preserving the view.',basePrice:50,pricePerM2:40,kgPerM2:.8,laborMin:20,fabrics:['Solar'],defaultFabric:'win_solar_screen'},
  {type:'pleated',name:'Pleated shade',description:'An accordion shade.',basePrice:45,pricePerM2:70,kgPerM2:.7,laborMin:20,fabrics:['Pleated'],defaultFabric:'win_pleat_light'},
  {type:'day_night',name:'Day/night pleated shade',description:'Independent day and night layers.',basePrice:80,pricePerM2:110,kgPerM2:1.1,laborMin:25,fabrics:['Sheer','Solar','Pleated'],fabrics2:['Blackout','Pleated'],defaultFabric:'win_solar_screen',defaultFabric2:'win_pleat_blackout'},
  {type:'roman',name:'Roman shade',description:'Fabric folds into a neat stack.',basePrice:40,pricePerM2:75,kgPerM2:1.3,laborMin:25,fabrics:['Curtain','Blackout','Upholstery'],defaultFabric:'win_linen'},
  {type:'insulated',name:'Insulated cellular shade',description:'Quilted privacy and light control.',basePrice:60,pricePerM2:85,kgPerM2:1.2,laborMin:20,fabrics:['Insulated'],defaultFabric:'win_thermal'},
  {type:'privacy_screen',name:'Snap-in privacy screen',description:'A removable window privacy panel.',basePrice:15,pricePerM2:15,kgPerM2:.4,laborMin:8,fabrics:['Blackout','Solar','Insulated'],defaultFabric:'win_blackout'},
];
export const COVERINGS: Record<CoveringType, CoveringSpec> = Object.fromEntries(coveringList.map(d=>[d.type,d])) as Record<CoveringType,CoveringSpec>;
