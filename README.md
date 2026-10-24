# Rolling Home

A stylized 3D life simulation about living on the road in an RV. **Your home goes wherever you go, but you
cannot take everything with you.**

**Play in your browser:** https://nolancasama.github.io/rolling-home/ (desktop Chrome/Edge/Firefox, mouse + keyboard)

Earn money with deliveries, odd jobs and remote work; buy groceries and upgrades; manage every kilogram against
your vehicle's gross and axle ratings; drive between a desert crossroads town, a mountain lake village and a
mesa city; find campsites, hook up power and water, dump your tanks, cook, sleep, and turn an old camper into
a home.

## What is in it

- Two very different vehicles: an old high-roof camper van and a used Class C motorhome.
- Real weight model: gross weight, front/rear axle loads from item positions, compartment volume and weight
  limits, loose cargo that must be strapped down, fluids at 1 kg/L.
- Fresh / gray / black water, house battery, solar, shore power, propane, fuel, spoiling food.
- Third-person on foot, first-person RV interior, chase + cockpit driving, overhead furnishing editor with
  placement validation (overlaps, door clearance, plumbing zones, reachable access).
- Three towns, two serviced campgrounds, free dispersed camping, a truck stop, scenic overlooks, a hidden
  lakeshore site, traffic, pedestrians and three recurring travelers with their own rigs.
- Smartphone hub: GPS map with assisted travel, jobs, finances, RV status, inventory, journal.
- Save/load (3 slots + autosave), difficulty levels, onboarding checklist and a 30-day goal, then free play.
- No downloads: all models, textures, sounds and music are generated in code.

## Controls

| Key | Action |
|---|---|
| WASD / mouse | Move / look (click the view to capture the mouse) |
| Shift | Run |
| E | Interact |
| Tab | Phone (GPS only while driving) |
| M | Map |
| F | Furnishing mode (inside the RV) |
| C | Chase / cockpit camera |
| L | Headlights |
| Space | Hard brake |
| H | Hide HUD |
| Esc | Pause / close |

## Development

```bash
npm install
npm run dev        # http://localhost:5190
npm test           # Vitest: simulation (weight, water, jobs, furnishing, save/load...)
npm run typecheck  # tsc --noEmit (strict)
npm run build      # production build to dist/
```

`src/sim`, `src/data` and `src/world` are pure TypeScript (no DOM or three.js) so the whole simulation is unit
tested. See `CLAUDE.md`, `DESIGN_DECISIONS.md` and `CURRENT_STATE.md`.
