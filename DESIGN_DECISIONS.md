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
  deterministic, light on Chromebook-class GPUs. Rejected: Rapier/cannon (WASM size, tuning cost).
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
  real point lights. *Rejected:* dozens of real lamp lights (too costly on Chromebook-class GPUs).
- **Distance culling:** instanced vegetation/rock tiles entirely beyond the fog are hidden each frame (no visual
  change). Terrain chunks are not culled or LOD'd: fully fogged distant terrain forms the hazy skyline
  silhouettes, and chunk LOD would open seam cracks against the sky.

### Architecture
- `src/data` (content), `src/sim` (rules + state) and `src/world` (terrain/road/collider model) are pure TS:
  no DOM, no three.js, no `Math.random`, no `Date.now`. The renderer, controllers and UI read state and call
  the `Sim` API only. *Why:* the whole resource/weight/economy simulation is unit-testable and save/load is a
  JSON round trip of one plain object.
- One item-instance table holds every object the player owns; an instance's `where` says whether it is stored
  in a compartment, installed on the floor plan, in a system slot, on a bed (mattress), in a locker or placed
  outdoors. Mass is therefore counted exactly once, wherever an item is.
