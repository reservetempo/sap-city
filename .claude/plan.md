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

### Existing code API (from task 3)

- `src/city.js` (no three.js): `CITY_SIZE` (32), `canPlaceBuilding(type, x, z)`, `placeBuilding(type, x, z, rotation = 0)` → object or null, `removeAt(x, z)` → object or null, `objectAt(x, z)`, `getObjects()`, `sizeOf(obj)`, `getState()`, `loadState(state)` → count loaded (skips overlapping/invalid entries, sends one reset event), `clear()`, `subscribe(fn)` → unsubscribe.
  - Objects are frozen `{id, kind: 'building', type, x, z, rotation}` with integer `id`; `(x, z)` is the footprint's min corner.
  - `getState()` → `{version: 1, objects: [{id, kind, type, x, z, rotation}, ...]}`.
  - Events: `{type: 'add', object}`, `{type: 'remove', object}`, `{type: 'reset', objects}` (after `loadState` and `clear`).
  - Adding roads: one entry in the `KINDS` table (size, plus `fromData`) and a `placeRoad` that calls `insert`.
- `src/buildingMeshes.js`: `createBuildingMesh({type, x, z, rotation})` → positioned `THREE.Group` (all shared resources, nothing to dispose); `createGhost()` → `{object, show(type, x, z, rotation, valid), hide()}`.
- `src/placement.js`: `initPlacement(scene)`, `footprintOrigin(type, tile)` → `{x, z}`. Handles build-tool taps, hover ghost, 0.6 s red flash, and erase-tool taps.
- `src/main.js`: one mesh per city object via `city.subscribe`, using a kind → mesh-maker table (add `road` there). `window.sapCity` includes `city`.
- Rotation 0 faces north (world −Z); each step turns a quarter clockwise seen from above (1 east, 2 south, 3 west). The front shows a dark door and a light roof ledge.

### Existing code API (from task 4)

- `src/city.js`: `placeRoad(x, z)` → object or null, `isRoad(x, z)`. Roads are `{id, kind: 'road', x, z}` and round-trip through `getState` / `loadState` / `clear`; `removeAt` removes roads too.
- `src/roads.js`: `initRoads(parent)` adds a "roads" layer that listens to city events itself (16 shared shape geometries, one material).
- `src/roadTool.js`: `initRoadTool()` claims drags and turns off one-finger pan while the road tool is selected; `line4(x0, z0, x1, z1)` fills gaps with 4-connected tiles.

## Open questions for the user

- Rotation 0 faces away from the default camera, so new buildings show their back (only the roof ledge shows the facing). Should the default be south, toward the camera? (That would also change the rotate icon and labels in `ui.js`.)
- Gate labels are about 32 px wide at the default phone zoom, more than a 22 px tile, so labels on gates placed side by side overlap. Fine for placeholders, or shrink/hide them?
- A press held still for more than 400 ms places nothing (a building or a road), because `input.js` only counts quick presses as taps. Should a long press also place?

## Next

### 5. Autosave and Clear

Persist the city in the browser. Files: `src/storage.js`, `src/main.js`, `src/ui.js`, `style.css`.

- `src/storage.js`: save `city.getState()` (`{ version: 1, objects: [...] }`, buildings and roads together) to `localStorage` under `sap-city:v1`, debounced to about 300 ms after each change. Load on startup before the first render. Wrap every read and write in try/catch; if storage is unavailable or the saved data is invalid, start with an empty city and log one warning. Ignore saved buildings whose type isn't in the catalog.
- Clear button: add it to the toolbar (visually separate from the tools, e.g. at the end of row 1) that asks with `confirm()` and then clears the city and the saved data.
- Optional if simple: also save and restore the camera target/zoom/angle.

Done when: placing buildings and roads, reloading, and seeing the same city works; Clear empties the city and survives a reload; corrupt saved data doesn't break the page; no console errors.

## Done

- Initial repo and GitHub Pages setup — `e217f53` — placeholder page live at https://reservetempo.github.io/sap-city/
- 1. Scaffold the 3D scene, camera gestures and tile picking — `6e1ae44` — 32×32 voxel island, custom touch/mouse camera, pointer router with tile picking (touch tested with synthetic events only)
- 2. Building catalog and toolbar UI — `28deb9b` — ten-building catalog in three tiers, tool state store, two-row phone toolbar with tier-grouped picker (look not yet checked on a real phone)
- 3. Place, rotate and erase buildings — `b1e4366` — city data model, placeholder voxel buildings with door and code label, tap-to-place with hover/red-flash ghost, erase
- 4. Paint and erase roads — `dbeeacb` — drag/tap road painting with 4-connected gap filling, auto-connecting road pieces, roads skip buildings and round-trip through city state
