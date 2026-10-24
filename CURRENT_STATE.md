# Current State

_Last updated: 2026-10-25_

## Status

Playable vertical slice in active development. Live build: https://nolancasama.github.io/rolling-home/
(GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main`; the workflow runs the unit
tests before building). Repo: https://github.com/nolancasama/rolling-home (public).

## What Exists

**Simulation (pure TS, `src/sim`, `src/data`, `src/world`)**
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
  rust/dirt; Class C cab a step below the coach with an open cab-over bunk), furniture models, character with
  animation.
- Modes: explore (3rd person), interior (1st person), drive (arcade physics with an engine torque plateau,
  chase/cockpit), furnish (overhead cutaway editor with live validation and weight panel).
- UI: main menu (Red Rock Flats backdrop), new game (appearance, vehicle, difficulty), HUD, phone (map/GPS +
  destination list + assisted travel, jobs, finances, RV status, inventory, journal), shop, job board, dock +
  cargo loading, campground, hookups, fuel/water/dump/propane, mechanic, procedures, eat/cook/sleep, NPC
  dialog, pause, settings, save/load.
- Procedural audio (engine, road, ambience, one-shots, generative music).
- `window.__rh` test API (snapshot, teleport, act, autodrive/speedRun with real physics, furnishing helpers).

**Verification**
- `npm test`: 32 Vitest tests (terrain, simulation, vehicle physics). Run in CI before every deploy.
- `npm run acceptance`: Playwright harness (`acceptance/run.mjs`, follows `~/.claude/workers/harness/PROTOCOL.md`)
  driving the real game in Chromium at 1366×768. 12 sections / 39 checks covering the plan's 30-step loop
  (startup → explore → interior → shopping → cargo → driving → delivery → camping → living → furnishing →
  save/load → integration). Trusted: known-good full run PASS 39/39 (≈216 s); known-bad probe (injected
  gray-water bug) → PRODUCT_FAILURE, exit 1. Manifest at `.tmp/acceptance/<full|section>/manifest.json`.
- `npx vitest run --config vitest.tools.config.ts`: 30-day scripted-player economy report (manual, not CI).
  Latest: Balanced ends ~$3.3–4.7k, Hard ~$2–3k, RV condition ~50% by day 30.

## Current Work

Visual review pass done (screenshots of both vehicles on Route 89, the byway, Highway 60, Pine Lake, the
campground, Mesa City, the truck stop and Red Rock Flats, by day and night). Fixed: Class C cockpit (cab now
a step below the coach), open cab-over bunk, cab/coach opening, mirrors, headliner overhang, walking eye in
cabs, night too dark (moonlit keys + lamp light pools), vegetation culled beyond the fog, lake at grazing
angles and at night. UI review of all screens at 1366×768: cargo loading now opens on a valid suggestion,
RV Status axle bars match the diagram order.

## Known Issues

- Traffic cars are plain low-poly boxes when seen up close (in keeping with the style; cosmetic).
- Real Chromebook GPU performance not measured. Desktop Chromium, low preset, 1366×768: ~2 ms CPU per frame,
  9–12 ms with 4× CPU throttling (still 60 fps); worst view ~0.9 M triangles / ~210 draw calls (Pine Lake).
- Bundle is ~1 MB (286 KB gzip); Vite warns about chunk size. Fine for now.
- Graphics quality changes apply only after reload.
- Pedestrians/NPCs are simple; no walkable shop interiors (by design for the MVP).

## Next Steps

1. Try the live build on a real school Chromebook (low preset); if slow, reduce vegetation density/draw
   distance on low first.
2. Town dressing where sparse (truck stop, Mesa City side streets); rounder traffic car models.
3. A hands-on playtest of the first in-game day by a person (onboarding clarity, pacing, prices).
4. Re-run `npm run acceptance` after gameplay changes (use `--only <section>` while iterating).

## Codex / Delegated Work

None. The user asked for this to be built directly (no Codex available).
