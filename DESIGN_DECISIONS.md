# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.
Git is the source of truth for detailed code-change history.

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

---

## 2026-10-25 — Analysis of the original "Rolling Home" plan

The project started from a long design prompt (21 parts). It was reviewed as product lead before any code was
written. Summary of what was accepted, modified, rejected/deferred and added:

### Accepted as written
- Core philosophy ("your home goes wherever you go, but you cannot take everything with you") and the loop
  *earn → buy → manage weight/space → travel → discover → camp/live → improve → explore*.
- Browser game in TypeScript + Three.js, stylized (not photoreal), desktop Chrome first.
- Four camera/control modes: third-person on foot, first-person RV interior, driving (cockpit + chase),
  overhead/cutaway furnishing with time paused.
- MVP vehicles: an older camper van and a used Class C. The bigger one is **not** strictly better: it has more
  volume, a shower and propane, but similar payload, worse fuel economy, size restrictions and higher fees.
- Weight as the central mechanic: GVWR, front/rear axle ratings via moments about the front axle, storage
  volume per compartment, cargo securing, consequences for overloading, never silently exceeding a rating.
- Fresh/gray/black water, house battery, shore power, solar, fuel, propane (only for appliances configured to
  use it), service procedures that are instructive the first time and quick afterwards.
- Needs: hunger, energy, hygiene + slower mood. No bladder meter.
- Three towns (Dusty Junction, Pine Lake, Mesa City), two serviced campgrounds, a free dispersed site, a truck
  stop, overlooks, simple traffic/pedestrians and three recurring NPC travelers.
- Jobs: delivery, odd jobs, remote work. Never pay for an uncompleted job.
- Time: 6× on foot/interior, route-compressed while driving, paused in menus/furnishing; every time skip pays
  its costs (needs, power, food, fees, deadlines).
- 30-day guided objective, onboarding checklist, then open-ended free play with no forced upgrade path.

### Modified
- **Drive length.** The plan suggested ~5 real minutes for a 45-mile leg. MVP legs are ~1.5–2.5 real minutes.
  Highways carry a per-segment *compression* factor (≈18–25×) that scales fictional distance, fuel, wear
  and game time together, so the speedometer stays honest in game time. Towns run at the base 6×.
  *Why:* a compact, lively region beats long empty roads, and the core loop has to be testable in one sitting.
- **Physics.** Custom arcade vehicle (bicycle model + grip limit + grade/drag/rolling resistance) and 2D
  oriented-box collision with height ranges instead of a physics engine. *Why:* "approachable, not hardcore",
  deterministic and cheap to tune. Rejected: Rapier/cannon (WASM size, tuning cost).
- **Shops and buildings.** Doors open functional shop/service screens; the RV is the only walkable interior in
  the MVP. *Why:* walkable shop interiors multiply modeling work without adding decisions.
- **Furnishing validation** is a 2D floor-plan model in vehicle space: footprints, per-item access zones, a
  protected entry-door zone, plumbing zones for plumbed fixtures, and a grid path-finding check that every
  access zone and the cab are reachable with a 0.45 m wide body. System items (batteries, solar, tanks,
  generator) install into capacity-limited slots instead of the floor.
- **Cargo loading** uses a loading screen at the dock (assign crates to compartments) with immediate
  compartment/GVWR/axle validation. Crates are then visible in the vehicle. Physical carrying is used for
  odd jobs and outdoor furniture.
- **Securing.** Items in open floor space must be strapped (cargo straps item) before driving; a pre-trip check
  lists hookups, awning, leveling blocks, outdoor items, unsecured cargo and ratings, and offers one
  "pack up" action that costs game time.
- **Overload policy.** Up to 15% over a rating you may drive with clear warnings and real penalties (accel,
  braking, handling, fuel, wear). Beyond 15% driving is refused until weight is removed.
- **Breakdowns.** No random failures and no flat tires (as the plan asked). Very low engine condition gives
  "limp mode" (capped speed) rather than stranding the player.

### Rejected / deferred from the MVP
- Fifth-wheels/towing, buses, semis, expedition vehicles (the vehicle config system supports adding them).
- Freight hauling, seasonal work, RV repair work for others, restoration/resale (listed as later expansion).
- Bladder meter, relationship simulation, weather, temperature.
- Walkable shop interiors and mirror rendering in the cockpit.

### Added
- **Road access by physical size:** a narrow forest track to a hidden lakeshore site that only narrow vehicles
  fit through (and GPS routing respects vehicle width), plus campsite length limits.
- **Signal strength** per location, needed for remote work, with a cell booster upgrade (off-grid progression).
- **Food spoilage** tied to the fridge having power, so electricity matters for food.
- **Procedural audio and music** (Web Audio synthesis) and procedural/instanced geometry — no external asset
  downloads, so the game works offline and on restricted networks.
- **Storage locker** in Mesa City (weekly rent) as a legitimate place to leave belongings.
- **Mattress swap** on beds and bulky-but-light items (mattresses) vs compact-but-heavy items (batteries).
- **Acceptance harness** following the user's harness protocol (sections, `--only`, manifest), driving the real
  game in Chromium, plus a pure headless simulation tested with Vitest.

## 2026-10-25 — Implementation decisions

- **Vehicle shells** are built from side profiles: flat side panels with real window holes plus a rim strip
  around the outline, DoubleSide paint so the cab reads as painted metal from inside. Inner paneling only in
  the living area. *Why:* see-through windows both ways without modeling every inner surface.
- **Class C balance:** shell CG moved rearward (40/60 split) after the first pass started 68 kg over the front
  axle rating; rear GAWR tightened to 3,350 kg so loading the rear bay with full tanks is a real constraint.
- **Packed belongings** in loose floor space or on the roof render as boxes of their packed size, not as the
  assembled furniture. Roof cargo hides in the furnishing cutaway.
- **Junctions:** road ribbons overlap at intersections; shoulders and skirts sit below the asphalt so the
  depth test always favors asphalt. Rejected: trimming ribbons at nodes (left uncovered terrain wedges).
- **Pre-trip issues that cannot be fixed on the spot** (no straps, no room for outdoor gear) are warnings, not
  blockers, so the player can never be soft-locked in the driver's seat. Fixable ones must be packed first.
- **Menu backdrop:** the van camped at Red Rock Flats at golden hour (the game's fantasy in one shot).
- **Publishing:** public GitHub repo with GitHub Pages via Actions (tests → build → deploy), as requested.
- **Engine force model:** below 12 m/s the engine gives a torque plateau (P / 12 m/s) that scales with engine
  condition; above it, constant power; tires cap force at 0.75·m·g·grip. *Why:* the first model was
  traction-limited at low speed, so a worn engine accelerated almost like a healthy one (acceptance caught
  it: 13.7 vs 13.1 m/s after 5 s). Now 0-60 mph ≈ 11 s (van) / 13 s (Class C) and worn engines are clearly
  slower (21.0 vs 13.8 m/s after 8 s with limp mode).
- **Economy tuning** (`tools/balance.test.ts`, a scripted 30-day player): delivery pay cut ~25%
  (base 30, 1.15/km, 0.24/kg). An always-working bot (one delivery per day) ends Balanced at ~$3.3-4.7k, Hard
  at ~$2-3k; real players who explore and upgrade land near the $1,500 goal. RV condition drifts to ~50% by
  day 30, so the goal's condition check makes at least one repair worthwhile.

- **Class C cab sits a step below the coach** (`cabFloorY` 0.6 m vs coach floor 0.85 m, cab headliner 2.12 m),
  as on real cutaway-chassis motorhomes. *Why:* with one shared floor the seats sat so high that the cockpit
  eye point was level with the headliner and half the windshield was blocked. The cab-over bunk is open to
  the coach (platform on the cab roof, mattress, side windows) instead of a solid bulkhead; the van keeps its
  bulkhead. Walking forward into either cab steps down and crouches under the headliner and mirror.
- **Night is a readable, stylized moonlit blue**, not physically dark: moon key light 0.4 and sky fill 0.85
  (previously ~1/45 of daylight, too dark to drive). Street lamps get additive ground light pools instead of
  real point lights. *Not done yet:* real lamp lights (dozens of point lights); worth revisiting for the High
  preset now that desktop is the target (see below).
- **Cargo loading opens on a suggestion that fits** (the Auto-arrange result; the button sits at the top of the
  crate list). Fridges are offered only for keep-cold crates. *Why:* the old default put every crate in the
  top-ranked compartment, so the very first delivery opened all red with the fix scrolled out of view at
  1366×768. Limits stay visible: the panel shows the resulting weights and any crate can be moved.
- **Distance culling:** instanced vegetation/rock tiles entirely beyond the fog are hidden each frame (no visual
  change). Terrain chunks are not culled or LOD'd: fully fogged distant terrain forms the hazy skyline
  silhouettes, and chunk LOD would open seam cracks against the sky.

- **Target hardware: desktop, visual quality first** (user decision). Rolling Home is not optimized for
  Chromebooks; the user prefers higher-end graphics for the visual experience. High is the default graphics
  preset; Medium/Low stay as fallbacks for weaker machines. *Rejected:* tuning for school Chromebooks
  (that constraint belongs to the ESL classroom games, not this project). Earlier cost-driven choices (no
  real lamp lights, short shadow range, no post-processing) are open to revisit for High.

### Architecture
- `src/data` (content), `src/sim` (rules + state) and `src/world` (terrain/road/collider model) are pure TS:
  no DOM, no three.js, no `Math.random`, no `Date.now`. The renderer, controllers and UI read state and call
  the `Sim` API only. *Why:* the whole resource/weight/economy simulation is unit-testable and save/load is a
  JSON round trip of one plain object.
- One item-instance table holds every object the player owns; an instance's `where` says whether it is stored
  in a compartment, installed on the floor plan, in a system slot, on a bed (mattress), in a locker or placed
  outdoors. Mass is therefore counted exactly once, wherever an item is.

## 2026-10-25 — Analysis of the "Advanced Vehicle Customization & Interior Design" plan

A second long design prompt (22 parts) asked for a Sims-4-class build/buy mode for the RV interior. Reviewed as
product lead against the running game before implementation; the detailed implementation contract lives in the
work orders, the durable decisions are here.

### Accepted
- **Design Mode** (replaces the furnishing editor) as a flagship feature: orbit / top / cutaway / first-person walk
  preview, drag-and-drop with hybrid snapping (5 cm grid, wall/edge magnets, unsnapped fine placement, 1 cm nudges),
  multi-select, duplicate, undo/redo, measuring, a searchable catalog, material editing, time-of-day preview, and
  placement errors that say why. Nothing is bought or changed until the player confirms.
- Four customization levels (cosmetic → furniture/equipment → functional → layout). The shell, cab, entry door,
  wheel wells and chassis are protected by construction: they are not items, so ordinary edits cannot touch them.
- Independent finish groups: floor zones, wall segments, ceiling zones and one trim group per vehicle, plus
  per-item material slots (cabinets never inherit wall materials). Finishes are recolorable with adjustable scale,
  direction, plank size and gloss.
- Window treatments per window (curtains, sheers, blackout/solar rollers, pleated, day/night, roman, insulated,
  privacy screens, valances) that open and close and really control light.
- A parametric cabinet family (base, upper, tall, wardrobe, drawers, open shelf) with sizes, fronts, door styles,
  handles and countertops; storage and mass derived from the dimensions. Upholstery slots on seating and beds.
  Transformable furniture with travel states (folding table, jackknife sofa, murphy bed, recliners, dinette bed).
- Lighting fixtures as real lights with color temperature, dimming and electrical draw.
- Every finish and object has mass at its position. A finish's weight is the difference from the factory finish
  (which is part of the shell mass), so nothing is counted twice.
- Life and Creative game types; blueprints saved locally and applied only to the same interior.
- The plan's 40-step renovation scenario becomes acceptance sections.

### Modified
- **"A standalone PC game, not a browser game."** The engine stays TypeScript + Three.js. Switching engines has no
  compelling technical reason and would throw away the working game. Read as: no browser-driven compromises in
  this feature (desktop-class materials and lighting) and no browser-only dependencies in the simulation. Blueprints
  go through a small storage adapter with JSON export/import so a desktop wrapper (Electron/Tauri) can store them as
  files later. Packaging the game as a desktop app is a separate, deferred step.
- **Vehicles.** The vertical slice is the existing Class C (the showcase, fully customizable) and the camper van
  (same system, tighter limits: lower ceiling, no gas line, no black tank). Fifth wheels, buses, semis, Class A and
  slide-outs stay deferred; surfaces, zones and openings are per-vehicle data, so new types are data plus models.
- **Layout remodeling** means relocating and replacing modules (galley, wet bath, wardrobe, cabinets, beds) within
  plumbing and gas zones. The shell has no partition walls, so "remove nonstructural partitions" waits for
  partition items.
- **Rotation stays in quarter turns.** RV interiors are rectilinear and axis-aligned footprints keep validation
  exact; fine placement comes from 1 cm nudges and unsnapped dragging.
- **Where you can renovate.** Anywhere the RV is parked. The catalog can be ordered anywhere, with a delivery fee
  unless parked at an RV supply shop. Professional installation (costs money, saves time) is only offered at a
  mechanic or RV shop; DIY costs game time. Moving furniture you already own is free and instant, so a curtain
  swap or rearranging stays trivial while a bathroom or battery job is a real trade-off.
- **Removed equipment** goes to storage if it fits, otherwise it is sold secondhand or discarded; chosen in the
  review step. (Before this, large factory pieces such as the dinette could not be removed at all: they never fit
  in storage.)
- **Resale.** An interior appeal score (finishes, coverings, furnishings, condition) adds a bounded amount to the
  trade-in value and a little comfort, instead of adding the cost of whatever was bought.
- **Insulated coverings** have no thermal effect (there is no temperature system); coverings affect light and
  sleep quality.
- **Cloth physics rejected:** coverings use procedural folds and animated open/close states.

### Rejected / deferred
- Online blueprint sharing, environment presets beyond time of day, slide-outs, structural modification,
  partition walls, per-pipe/per-wire utility design (utility zones instead), new vehicle types.

### Added
- **Fits-through-the-door check.** Appliances and other items that do not ship knocked-down must pass through an
  entry opening. An 18 cu ft residential fridge does not fit through a Class C door: the classic RV renovation
  surprise, and an honest compatibility warning.
- **Gas zones** next to plumbing zones: propane appliances stay on the factory gas line.
- **Interior light model.** Sky light reaching interior materials is attenuated by window openness and coverings,
  so an RV interior is dimmer than outdoors, closed blackout shades darken the room and the fixtures matter at
  night. *Why:* before this the interior looked the same at noon and at 8 PM.
- **Dated factory interiors** (mauve berber, floral wallboard, honey oak, quilted valances; faux-wood hardboard in
  the homemade van conversion) with low appeal, so a renovation has a visible before and after.
- **Overhead cabinets become real items.** The Class C's 300 L "overhead" storage was invisible; it becomes three
  upper cabinets you can open, repaint, move or remove. A new game's weights and axle loads stay the same (shell
  mass compensated) and saves migrate.
- **Draft-based editing.** Design Mode works on a deep copy of the game state; the save changes only on Confirm, in
  one atomic commit, so cancelling can never lose money or corrupt inventory.

### Implementation notes (Design Mode S1)

- Family defaults retain their specified dimensions even when a default is off the adjustment grid (upper depth
  0.33 m). Other supplied dimensions snap to the specified steps, so the factory 0.48 m upper resolves to 0.50 m.
  Height normalization still clamps to the supplied vehicle clearance; placement separately enforces headroom.
- Wall-backed transformable furniture keeps its back edge fixed when changing states. Its center moves by half
  the depth change, including when packing up; this lets an installed wall table or Murphy bed unfold into the room.
- High storage uses a 0.40 m reachability margin (the walking body's diameter), rather than the floor furniture's
  0.12 m margin. The rear factory upper can therefore be reached over the bed without making the bed walkable.
- Dome fixtures draw 5 W in every vehicle, so the van's factory pair draws 10 W at night instead of the old 14 W
  lump (a small battery gain for the van). *Rejected:* a van-only 6 W override, which made the same item behave
  differently per vehicle. Existing LED retrofit equipment (string lights) keeps its additional evening load.
- Countertop finishes on fixed furniture and appliances change mass and value by the material difference from
  the catalog slot default, using width × (depth + 0.02 m); cabinet families use the full specified construction formula.
- Trim run length includes floor and ceiling perimeters plus window and entry-door frames. The van bulkhead's
  finish area starts above its cab headliner. Slot-only materials with unspecified numeric content use zero mass
  and simple repeat/price defaults; covering type determines window-fabric mass and price.
- Migrated installed items matching factory definitions receive the factory slot finishes when no finish exists.
  The pre-migration installed-definition set controls since-v2 additions, allowing all three new uppers and all
  factory lights to be added while keeping existing uids and their storage references unchanged.
- Microwave meals retain the existing sink, kitchenware and washing-water requirements, replacing stove fuel,
  cooking duration and electrical consumption. Blocked convertible sleeping returns a zero-minute summary with
  `ok: false` and `reason`, preserving the existing summary fields for callers.

### Design Mode editor (S2-S5)
- **Pricing of new purchases:** a non-default finish on a new item costs only its material premium (no
  refinishing labor), and countertops are already in the item's price. Refinishing labor applies to owned pieces.
  *Rejected:* billing every chosen finish as a refinishing job (it double-charged new cabinets).
- **Edits that cut something off are refused at once** ("Would block the way to Double bed frame.") instead of
  being allowed and only blocking the confirm. Problems that existed before an edit (e.g. after applying a
  blueprint) do not refuse unrelated edits.
- **Wall pieces face the room.** Wall-backed and wall-hung items snap to the nearest wall and turn to face into
  the room; R does not rotate them (drag them to another wall). Resizing a new cabinet keeps its back on its wall,
  so a deeper cabinet grows into the room.
- **Cutaway readability:** with the walls cut or down, pieces hung above 0.95 m (upper cabinets, shelves,
  microwaves) turn translucent but stay clickable. *Rejected:* hiding them, which made placed uppers vanish.
- **Done** leaves directly when nothing changed and otherwise opens the review; Discard asks first. The
  existing furnishing acceptance section now confirms its draft before checking weight and comfort, because
  nothing reaches the real game until the review is confirmed.
- Default view: from behind the door side, about 0.7 × the vehicle length away; time-of-day preview drives the
  sky and the auto-lights rule only (never the game clock).
