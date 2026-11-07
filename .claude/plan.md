# Sap City plan

## Project context (applies to every task)

Sap City is a phone-first web game for learning computer architecture through city building. The long-term idea: a hierarchy of buildings (gates → adders/flip-flops → ALU/memory) forms a new visual language for schematic diagrams. **For now the only goal is placing buildings and roads.** Every building is a simple placeholder. Do not add game rules, wiring, signals, scoring, costs, or any mechanic beyond placement.

- Plain HTML/CSS/JS ES modules, no build step, no npm. three.js `0.170.0` from jsDelivr via an import map (`three` → `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js`, `three/addons/` → `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/`).
- Served by GitHub Pages from the `main` branch root (https://reservetempo.github.io/sap-city/), so all paths must be relative.
- Local preview: launch config `static` in `.claude/launch.json` (`python -m http.server 8010`), created in task 1.
- Voxel style: chunky boxes, flat colors, flat shading, soft shadows, bright sky. Placeholders only.
- Phone-first: full-screen canvas, works in portrait at 375×812, touch gestures, also usable with a mouse on desktop.
- Grid: 32×32 tiles, 1 world unit per tile, tile coordinates `(x, z)` are integers 0–31.

### Decisions from the user

- Buildings (the "full ladder"), footprints grow with tier:
  - Tier 1, gates, 1×1: AND, OR, NOT, XOR
  - Tier 2, 2×2: Half adder (HA), Full adder (FA), Flip-flop (FF), Register (REG)
  - Tier 3, 3×3: ALU, Memory (MEM)
- Touch: with the road tool on, one-finger drag paints road; otherwise one finger pans. Two fingers always pan, pinch-zoom and twist-rotate.
- Autosave the city to the phone's browser storage after every change, with a Clear button to start over.

## Next

### 1. Scaffold the 3D scene, camera gestures and tile picking

Replace the placeholder `index.html` with the app shell and build the scene. Files: `index.html`, `style.css`, `src/main.js`, `src/scene.js`, `src/controls.js`, `src/input.js`, `.claude/launch.json`, `README.md`.

- `.claude/launch.json`: `{"version":"0.0.1","configurations":[{"name":"static","runtimeExecutable":"python","runtimeArgs":["-m","http.server","8010"],"port":8010}]}`.
- `index.html`: import map as in the project context, viewport meta with `viewport-fit=cover` and no user scaling, full-screen canvas container, a fallback message if import maps aren't supported.
- `style.css`: full-screen, no page scroll, `touch-action: none` and `overscroll-behavior: none` on the canvas (no pull-to-refresh, no double-tap zoom), respects safe-area insets.
- `src/scene.js`: renderer (pixel ratio capped at 2, shadows on, resizes on window resize and orientation change), sky-colored background, hemisphere + directional light with soft shadows, a 32×32 grass ground with subtle visible tile lines, slightly raised dirt edge around it. Export helpers `tileToWorld(x, z)` (tile center in world space) and `worldToTile(point)` (returns `{x, z}` or `null` outside the grid). Document the coordinate convention in a comment.
- `src/controls.js`: a small custom camera controller (not OrbitControls, so one-finger behavior can be switched later). Perspective camera looking down at about 50°, orbiting a ground target. Touch: one finger pans; two fingers pan (midpoint move), pinch-zoom (distance) and twist-rotate around the vertical axis, all at once. Mouse: left-drag pans, right-drag rotates, wheel zooms. Clamp zoom distance and keep the target inside the grid. Export a way to turn one-finger pan off and on (`setOneFingerPan(enabled)`).
- `src/input.js`: pointer router on the canvas. Classifies a one-finger touch or left-click as a **tap** (moved < 10 px, < 400 ms) or a **drag**. Emits `tap` with the tile under the pointer, and `dragstart` / `dragmove` / `dragend` with tiles, but only to a drag handler that has claimed one-finger drags; otherwise one-finger drags go to the camera. Also emits `hover` (mouse only) with the tile. Raycasts against the ground plane using `worldToTile`. Keep the API small and documented at the top of the file, since tasks 3 and 4 build on it.
- `src/main.js`: wires it together and runs the render loop. As a temporary check, highlight the tapped tile with a translucent box (task 3 removes it).
- `README.md`: update the project description (one paragraph: what Sap City is, that placement is the only feature for now), file layout, and run locally on port 8010.

Done when: on a 375×812 viewport the grid fills the view, a tap highlights the right tile, pan/zoom/rotate work by mouse (and touch gestures are implemented), and there are no console errors.

### 2. Building catalog and toolbar UI

Add the building catalog and a phone toolbar for choosing a tool. Files: `src/catalog.js`, `src/tools.js`, `src/ui.js`, `style.css`, `index.html` (markup hook only), `src/main.js` (one-line wiring).

- `src/catalog.js`: data only. Each entry `{ id, code, name, tier, size, color }` for the ten buildings in the project context (codes: AND, OR, NOT, XOR, HA, FA, FF, REG, ALU, MEM; sizes 1/2/3 by tier). Give each building a distinct flat color, with each tier sharing a hue family so tiers read as groups. Export the list and a `getBuilding(id)` lookup.
- `src/tools.js`: tiny state store with `subscribe`. State: `tool` (`'pan' | 'road' | 'erase' | 'build'`), `buildingId` (when tool is `build`), `rotation` (0/1/2/3 quarter turns). Default tool `pan`.
- `src/ui.js`: bottom toolbar fixed to the screen, above the safe-area inset, thumb-friendly (44 px minimum hit areas). Row 1: Pan, Road, Erase, and Rotate (rotate cycles `rotation` and its icon shows the current facing). Row 2: horizontally scrolling building picker grouped by tier with small tier labels; each card shows a color swatch, the code and the name. The active tool or building is clearly highlighted. Use simple inline SVG or text icons, no icon library. The toolbar must not let touches fall through to the canvas.
- Nothing needs to happen on the grid yet when a tool is picked.

Done when: on a 375×812 viewport the toolbar looks clean, the picker scrolls sideways, picking tools updates the highlight and state, the canvas still pans above the toolbar, and there are no console errors.

### 3. Place, rotate and erase buildings

Make the build and erase tools work for buildings. Files: `src/city.js`, `src/buildingMeshes.js`, `src/placement.js`, `src/main.js`.

- `src/city.js`: the city data model, independent of three.js. A tile occupancy map plus a list of objects. Buildings `{ id, type, x, z, rotation }` where `(x, z)` is the footprint's minimum corner. Roads will also live here in task 4 (plan for a `road` kind that occupies one tile). Functions: `canPlaceBuilding(type, x, z)` (in bounds and every footprint tile free), `placeBuilding`, `removeAt(x, z)` (removes the whole object covering that tile), `objectAt(x, z)`, `getState()`, `loadState(state)`, `clear()`, and a change `subscribe` so rendering and (later) saving can react.
- `src/buildingMeshes.js`: placeholder voxel meshes built from catalog data. Footprint `size × size` tiles with a small inset so neighbors read as separate; height grows with tier; a stepped roof or one or two voxel details at most; a door or front marker on the facing side so rotation is visible; a camera-facing text label (canvas-texture sprite) showing the code, readable at the default zoom. Cast and receive shadows. Share geometries/materials where easy.
- `src/placement.js`: with the build tool on, a tap places the selected building with its footprint centered on the tapped tile (for even sizes, the tapped tile is the one just up-left of center). Valid → place it. Blocked or out of bounds → show a red ghost of the footprint for about 0.6 s and place nothing. With a mouse, a ghost follows the hover (green when valid, red when not). The ghost uses the current rotation. With the erase tool on, a tap removes the building under the tile. Pan and road tools ignore taps here.
- `src/main.js`: remove the temporary tap highlight from task 1, wire in city, meshes and placement; keep meshes in sync with the city through its `subscribe`.

Done when: every building in the picker can be placed at its footprint size, overlap and out-of-bounds placement are refused with the red ghost, rotation shows on the door/front, erase removes a whole building from any of its tiles, and there are no console errors.

### 4. Paint and erase roads

Make the road tool work. Files: `src/roads.js`, `src/city.js` (road support), `src/placement.js` (erase covers roads), `src/main.js`.

- `src/city.js`: add roads as one-tile objects: `placeRoad(x, z)` (only if the tile is free), and `removeAt` also removes roads. Roads and buildings never overlap. Include roads in `getState` / `loadState` / `clear`.
- `src/roads.js`: road meshes that auto-connect to neighboring road tiles (4 neighbors): isolated, dead end, straight, corner, T and cross. Gray asphalt slab barely above the grass, with simple light lane markings or curbs built from thin boxes so the shape reads clearly. When a road is added or removed, update its neighbors' pieces too. No connection to buildings (no game rules).
- Painting: when the road tool is selected, claim one-finger drags through `src/input.js` and call `setOneFingerPan(false)` in `src/controls.js`; turn it back on when leaving the road tool. Dragging lays road on each tile the finger crosses, skipping occupied tiles, and fills gaps when the finger skips tiles so roads stay 4-connected (diagonal moves add an in-between tile). A single tap also places one road tile. Two-finger gestures still move the camera.
- Erase tool: a tap removes a road tile too.

Done when: dragging paints a continuous road that forms correct straights, corners, T-junctions and crossings, roads go around buildings without overwriting them, erasing a road re-shapes its neighbors, the camera still pans with two fingers in road mode and with one finger in pan mode, and there are no console errors.

### 5. Autosave and Clear

Persist the city in the browser. Files: `src/storage.js`, `src/main.js`, `src/ui.js`, `style.css`.

- `src/storage.js`: save the city state to `localStorage` under `sap-city:v1` as `{ version: 1, buildings: [...], roads: [...] }`, debounced to about 300 ms after each change. Load on startup before the first render. Wrap every read and write in try/catch; if storage is unavailable or the saved data is invalid, start with an empty city and log one warning. Ignore saved buildings whose type isn't in the catalog.
- Clear button: add it to the toolbar (visually separate from the tools, e.g. at the end of row 1) that asks with `confirm()` and then clears the city and the saved data.
- Optional if simple: also save and restore the camera target/zoom/angle.

Done when: placing buildings and roads, reloading, and seeing the same city works; Clear empties the city and survives a reload; corrupt saved data doesn't break the page; no console errors.

## Done

- Initial repo and GitHub Pages setup — `e217f53` — placeholder page live at https://reservetempo.github.io/sap-city/
