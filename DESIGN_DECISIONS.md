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

### Architecture
- `src/data` (content), `src/sim` (rules + state) and `src/world` (terrain/road/collider model) are pure TS:
  no DOM, no three.js, no `Math.random`, no `Date.now`. The renderer, controllers and UI read state and call
  the `Sim` API only. *Why:* the whole resource/weight/economy simulation is unit-testable and save/load is a
  JSON round trip of one plain object.
- One item-instance table holds every object the player owns; an instance's `where` says whether it is stored
  in a compartment, installed on the floor plan, in a system slot, on a bed (mattress), in a locker or placed
  outdoors. Mass is therefore counted exactly once, wherever an item is.
