# Rolling Home

Stylized 3D RV life-simulation (TypeScript + Three.js + Vite). See `DESIGN_DECISIONS.md` for why things are the
way they are and `CURRENT_STATE.md` for what is true right now.

## Run / test

- `npm run dev` (or `start.bat`) → http://localhost:5190
- `npm test` — Vitest unit/integration tests for the pure simulation (`test/`).
- `npm run typecheck` — `tsc --noEmit` (strict).
- `npm run acceptance` — Playwright acceptance harness (`acceptance/`), follows the workflow harness protocol
  (`--list-sections`, `--only <name>`, manifest at `.tmp/acceptance/<run>/manifest.json`).

## Architecture rules

- `src/data/` (content), `src/sim/` (rules + state) and `src/world/` (terrain/road/collider model) are **pure**:
  no DOM, no three.js, no `Math.random`, no `Date.now`. Randomness comes from `sim/rng.ts` seeded by the save.
- All game state is one JSON object (`GameState` in `sim/types.ts`). Save/load is a JSON round trip.
- Every owned object is an `ItemInstance` in `state.items`; `where` says where it is (stored / floor / slot /
  mattress / locker / outdoor / carried). Mass is counted once, from wherever the item is.
- The renderer (`src/render/`), controllers (`src/game/`) and UI (`src/ui/`) read state and call the `Sim`
  facade (`sim/sim.ts`). Successful timed actions advance game time through `sim/time.ts` only.
- Balance numbers live in `src/data/config.ts`; vehicles in `src/data/vehicles.ts`; the world in `src/data/map.ts`.
- Vehicle-local frame: +Z forward, +X = vehicle left (driver side), -X = curb/door side. Axle loads use
  `d` = meters behind the front axle.
