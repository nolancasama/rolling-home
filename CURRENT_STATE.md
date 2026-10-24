# Current State

_Last updated: 2026-10-25_

## Status

Playable vertical slice in active development. Live build: https://nolancasama.github.io/rolling-home/
(GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main`; the workflow runs the unit
tests before building).

## What Exists

**Simulation (pure TS, `src/sim`, `src/data`, `src/world`; 28 Vitest tests pass)**
- Game state as one JSON object; save/load round-trips exactly (3 slots + autosave in localStorage).
- Two vehicles (1997 camper van, 2004 Class C) with GVWR, front/rear GAWR, tank positions, compartments,
  system slots, interior floor plans and default equipment. Van starts at 2,799 kg (601 kg payload); Class C at
  4,644 kg (556 kg payload).
- Weight: every item instance has a position; axle loads from moments about the front axle; compartment
  volume / weight / opening-size limits; loose storage needs cargo straps; overload > 15% refuses driving.
- Utilities: fresh/gray/black water liter-for-liter, battery Wh integration, solar by time of day and shade,
  shore power, alternator, generator, 3-way fridge on propane, butane canisters, food spoilage.
- Needs (hunger, energy, hygiene) + mood with factors; sleep quality from bed/mattress and stay type.
- Jobs: daily boards (deterministic per seed/day), fixed onboarding delivery, cargo loading validation,
  delivery pay with lateness/damage, deadline failure, odd jobs (visit/carry), remote work (signal, power).
- Camping: reservations, occupancy (NPCs + random campers), check-out charging, hookups, leveling, awning,
  outdoor items, pre-trip check + pack-up.
- Services: fuel, water fill, dump (procedure with mistakes), propane, car wash, showers, diner, canoe, fishing,
  campfire, storage locker. Mechanics with quotes, DIY parts. Shops (buy with storage + weight preview,
  sell, used stock, dealership trade-in). NPC travelers with weekly schedules, tips, a sale and jobs.
  Discoveries, onboarding objectives, 30-day goal, weekly bills, time integrator.
- Terrain/road model: 4 m height grid, flattened towns/pads, lake basin, canyon, mesas, road profiles with
  grade limits, GPS routing (respects narrow tracks), route compression (fictional km and game time).

**Game client (`src/render`, `src/game`, `src/ui`, `src/audio`)**
- Three.js world: chunked terrain with biome colors, lake shader, distant mountains, roads with markings,
  pads, buildings with signs, instanced vegetation/rocks, town props, sky with day/night, traffic,
  pedestrians, campers at occupied sites, NPC camps, markers.
- Procedural van and Class C (exteriors with real window openings, interiors, wheels, doors, awning, solar,
  rust/dirt), furniture models, character with animation.
- Modes: explore (3rd person), interior (1st person), drive (arcade physics, chase/cockpit), furnish
  (overhead cutaway editor with live validation and weight panel).
- UI: main menu (Red Rock Flats backdrop), new game (appearance, vehicle, difficulty), HUD, phone (map/GPS +
  assisted travel, jobs, finances, RV status, inventory, journal), shop, job board, dock + cargo loading,
  campground, hookups, fuel/water/dump/propane, mechanic, procedures, eat/cook/sleep, NPC dialog, pause,
  settings, save/load.
- Procedural audio (engine, road, ambience, one-shots, generative music).
- `window.__rh` test API (snapshot, teleport, act, autodrive with real physics, furnishing helpers).

## Current Work

Visual polish pass from screenshot review (done: menu backdrop, junction z-fighting, packed cargo, rust,
rear windows, cockpit fill light, HUD layout). Next: the Playwright acceptance harness for the 30-step
core loop.

## Known Issues

- The acceptance harness (`npm run acceptance`) is not written yet; the full 30-step loop has only been
  exercised piecewise (unit tests + manual browser checks of menu, explore, interior, furnish, drive, shop,
  job board, phone).
- Long drives (Dusty Junction → Pine Lake) and the Class C have not been visually reviewed in the browser yet.
- Bundle is ~1 MB (286 KB gzip); Vite warns about chunk size. Fine for now.
- Graphics quality changes apply only after reload.
- Pedestrians/NPCs are simple; no walkable shop interiors (by design for the MVP).

## Next Steps

1. Write `acceptance/run.mjs` following `~/.claude/workers/harness/PROTOCOL.md` (sections, `--only`,
   `--list-sections`, manifest) covering the plan's 30-step scenario + integration checks; prove it with one
   known-good pass and one known-bad fail.
2. Drive the routes in the browser (van and Class C), fix physics/visual issues found on mountain roads,
   campgrounds and the narrow track.
3. Review Pine Lake, Mesa City, the truck stop and campgrounds visually; add town dressing where sparse.
4. Balance pass with a scripted 30-day economy simulation.
5. Performance check at 1366×768 on the "low" preset.

## Codex / Delegated Work

None. The user asked for this to be built directly (no Codex available).
