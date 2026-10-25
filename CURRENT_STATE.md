# Current State

_Last updated: 2026-10-25_

## Status

Playable vertical slice in active development. Live build: https://nolancasama.github.io/rolling-home/
(GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main`; the workflow runs the unit
tests before building). Repo: https://github.com/nolancasama/rolling-home (public).

**In progress on branch `design-mode` (not merged to `main`, so not live):** Design Mode, a Sims-style
renovation editor for RV interiors, built from the "Advanced Vehicle Customization & Interior Design" plan.
What was accepted, changed or rejected from that plan is in `DESIGN_DECISIONS.md` (2026-10-25). The full frozen
contract is `.ai/design-mode-spec.md`. `.ai/` is gitignored, so it exists only on this machine.

**Target:** desktop browsers with a decent GPU; visual quality over low-end performance. Not optimized for
Chromebooks (that constraint is for the ESL classroom games only). High is the default graphics preset.

## What Exists

**Simulation (pure TS, `src/sim`, `src/data`, `src/world`)**
- Game state as one JSON object; save/load round-trips exactly (3 slots + autosave in localStorage). Saves are
  version 2; v1 saves migrate (`src/sim/save.ts`).
- Two vehicles (1997 camper van, 2004 Class C) with GVWR, front/rear GAWR, tank positions, compartments,
  system slots, interior floor plans, named surfaces/windows/openings and factory finishes. The van starts at
  2,799 kg (601 kg payload); the Class C at 4,644 kg (556 kg payload).
- Weight: every item instance has a position; axle loads from moments about the front axle; compartment
  volume / weight / opening-size limits; finishes add weight; overload > 15% refuses driving.
- Utilities, needs, jobs, camping, services, shops, NPCs, terrain and routing: unchanged from the vertical slice
  (water, battery, solar, shore power, propane fridge, food spoilage; hunger/energy/hygiene/mood; delivery and
  odd jobs; reservations and hookups; fuel/dump/propane/mechanics/shops; GPS routing with route compression).

**Design Mode (branch `design-mode`)**
- S1, data and simulation: materials catalog, parametric families (cabinets, sofas, rugs, light strips), finishes
  on surfaces and item slots, window treatments, fixture lighting with power draw, appeal, Life/Creative game
  types (`gameType`, `creativeRelaxed`), save migration.
- S2, drafts: `src/sim/renovation.ts`. Every edit runs on a draft copy with undo/redo; a summary prices goods,
  delivery, DIY or pro labor, sales of removed pieces, weight, storage and night power; commit is atomic, with a
  stale check. Blueprints: `src/sim/blueprints.ts`.
- S3, rendering: procedural PBR materials (`src/render/materials`), a surface-based interior shell, window
  coverings, a pooled fixture-light system, bloom on High, eye adaptation. There is a material gallery at
  `material-gallery.html` (`npm run gallery:shot`) and interior shots via `npm run shots:interior`.
- S5, editor: `src/game/design/` (mode, camera, snapping, overlay) and `src/ui/screens/design/` (panel, review).
  It has placement with live validation and explained issues, wall snapping, edge magnets, live dimensions,
  measuring, resizing, fit to gap, walls up/cut/down, a top view, walking the design, a time-of-day preview, and a
  review dialog with keep/sell/discard and DIY/Pro choices. It replaced the old furnish mode (`F` opens it; the
  test API alias `setMode('furnish')` still works).
- S6, partly done (this checkpoint): tabs for Surfaces (material picker with swatches, palette, custom color,
  plank sizes, direction, scale, gloss), Windows (covering types with prices, fabrics, day/night layers, valance,
  hardware, mount, length, open/half/closed preview), Lights (per-fixture mode, dimming, color temperature, RGB,
  all-lights switches, time preview) and Blueprints (save, load, rename, duplicate, delete, export/import JSON,
  restore the factory layout). Item material slots are editable in the inspector, and Creative games get a
  Relaxed-rules toggle. Test hooks are in `src/debug/designApi.ts` (`window.__rh.design`).

**Game client (`src/render`, `src/game`, `src/ui`, `src/audio`)**
- Three.js world, procedural van and Class C, furniture models (still the old boxy ones; see S4), character.
- Modes: explore (third person), interior (first person), drive (arcade physics), design (above).
- UI: menus, HUD, phone, shops, jobs, cargo, camping, services, eat/cook/sleep, dialogs, settings, save/load.
- Procedural audio. `window.__rh` test API.

**Verification**
- `npm test`: 126 Vitest tests (simulation, Design Mode data/drafts/blueprints/pricing, a catalog snapshot,
  terrain, physics). CI runs them before every deploy.
- `npm run acceptance`: Playwright harness (`acceptance/run.mjs`), 12 sections / 39 checks at 1366×768. The last
  full run was 39/39 after the S3 merge. After S5, the furnishing, interior, saveload and living sections passed;
  the furnishing section now drives Design Mode and confirms its draft. Use `--only <section>` while iterating.
- S6 has not had a full acceptance run yet.

## Current Work

S6 is partly done (see above). This session found and fixed a bug that dated from S5: the editor's root
caught every mouse click and dimmed the 3D view (details in `DESIGN_DECISIONS.md`, S6). Clicking a floor in
the view now selects it. Screenshots of the new tabs from `probe-s6.mjs` (scratchpad) were mostly not
reviewed yet.

## Known Issues

- Design Mode furniture still uses the old boxy models, light fixtures are placeholder boxes, and some
  fabric motifs are faint (plaid scale, tweed flecks, quartz veins). All of this is S4.
- The acceptance harness drives Design Mode only through `window.__rh.design`; nothing tests real mouse
  input there yet (that is how the click bug got through).
- Graphics quality changes apply only after a reload. The bundle is about 1 MB, and Vite warns about chunk
  size. Traffic cars are plain boxes up close.
- Performance reference (dev desktop, High): 60 fps, about 2 ms CPU per frame, at most about 2.0 M triangles
  and 280 draw calls (Pine Lake), before Design Mode rendering changes. Re-measure in S7.

## Next Steps

1. **Finish S6.** Add first-person interactions in `src/game/interior.ts`:
   - fold/unfold transformable furniture (`sim.setItemState`);
   - open/close window coverings (`sim.setCovering`);
   - a light switch (`sim.setAllLights`);
   - open storage (`vv.setItemOpen` once S4 provides it).

   Also add the microwave option to the cook screen (`sim.microwaveCook`, `cookCheck` method `'microwave'`), handle
   `ok: false` from convertible sleeping in `doSleep`, and offer a Life/Creative choice on New Game
   (`opts.gameType`). Then review the tab screenshots at 1920×1080 and run the furnishing acceptance section.

   Also from the S6 probe:
   - Point the camera at the selected window; from the default angle a new covering is hard to see.
   - Check the refinishing price. Refinishing the frame of an owned double bed came to $176.64, which looks high.
2. **S4, furniture and fixture models: delegate it** (Codex was usage-limited until 2026-10-25 08:19 UTC). The
   order is drafted in `.ai/work-order-s4.json`. Before dispatching, add:
   - a per-piece fade API (finish materials are shared, so fades must not leak to other pieces);
   - `vv.setItemOpen`;
   - a model gallery with screenshots;
   - motif polish.

   Run it in a worktree and review it visually.
3. **S7, acceptance.** Add harness sections for the plan's 40-step scenario, edge cases and performance,
   including real mouse clicks in Design Mode. Then run the full `npm run acceptance`.
4. Merge `design-mode` into `main` and push (that deploys Pages). Update this file.
5. Clean up the merged worktrees `../rolling-home-s3` (branch `design-mode-s3`) and `../rolling-home-data`
   (branch `design-mode-data`) with `git worktree remove` and delete their branches.
6. Later, from before Design Mode: High-preset visual upgrades (street-lamp and campfire lights, softer
   shadows, AO, denser vegetation), town dressing, better traffic models, and a hands-on playtest of day one.

## Codex / Delegated Work

- No worker run is in flight. Codex built S1, S2, the S2 fix, the content refactor and S3; all were reviewed
  and merged into `design-mode`. Do not re-dispatch them.
- S5 and S6 were done directly by Claude while Codex was usage-limited.
- S4 is drafted (`.ai/work-order-s4.json`) and has not been dispatched.
