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

### Existing code API (from task 1)

Tile (x, z) has its center at world (x − 15.5, 0, z − 15.5); the grass is the plane y = 0.

- `src/scene.js`: `GRID_SIZE`, `tileToWorld(x, z, out?)` → `Vector3`, `worldToTile(point)` → `{x, z}` or `null`, `screenToGround(camera, canvas, clientX, clientY, out?)`, `createScene(container)` → `{renderer, scene, camera}`.
- `src/controls.js` (adds no listeners itself): `initControls(camera, canvas)`, `setOneFingerPan(enabled)`, `resetView()`, `getView()` → `{x, z, distance, yaw}`, `setView(view)`. Gesture functions `pointerDown/pointerMove/pointerUp/zoomAt` are called only by `input.js`.
- `src/input.js` (the only owner of pointer and wheel listeners): `initInput(canvas, camera)`, `on('tap' | 'hover', fn)` → unsubscribe. Tap gives `{tile, clientX, clientY, pointerType}`; hover is mouse only and fires on tile change. `setDragHandler({dragstart, dragmove, dragend} | null)` claims one-finger / left-mouse drags; events give `{tile, clientX, clientY, pointerType, cancelled}`, and `dragstart.tile` is the pointer-down tile. `pickTile(clientX, clientY)`. Any `tile` is `{x, z}` or `null`.
- `index.html` has an empty `#ui` overlay (inset by safe areas) for the toolbar. `src/main.js` sets `window.sapCity = {renderer, scene, camera}` for console inspection, and has a `// TEMP` tap-highlight that task 3 removes.

### Existing code API (from task 2)

- `src/catalog.js`: `BUILDINGS` (10 entries `{id, code, name, tier, size, color}`; ids `and, or, not, xor, half-adder, full-adder, flip-flop, register, alu, memory`), `TIERS` (`[{tier, label, size}]`: Gates / Adders & latches / Units), `getBuilding(id)`.
- `src/tools.js`: `getState()`, `setState(partial)` (validates; rotation wraps 0–3; `'build'` needs a building), `subscribe(fn)` → calls `fn(state, prev)`, returns unsubscribe. Also `TOOLS`, `selectTool(tool)`, `selectBuilding(id)`, `rotate(step = 1)`. Console access: `await import('/src/tools.js')`.
- `src/ui.js`: `initUI(root)` → `{toolbar, actions, destroy}`; `actions` is an empty slot at the right end of row 1 reserved for task 5's Clear button. Called once from `main.js`.
- Toolbar is 118 px tall at 375×812 and floats 8 px above the bottom safe-area inset (covers the bottom ~126 px of the canvas).

## Next

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
- 1. Scaffold the 3D scene, camera gestures and tile picking — `6e1ae44` — 32×32 voxel island, custom touch/mouse camera, pointer router with tile picking (touch tested with synthetic events only)
- 2. Building catalog and toolbar UI — `28deb9b` — ten-building catalog in three tiers, tool state store, two-row phone toolbar with tier-grouped picker (look not yet checked on a real phone)
