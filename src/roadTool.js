// roadTool.js: painting roads with the road tool.
//   While the road tool is selected it claims one-finger / left-mouse drags and
//   turns off one-finger camera pan; leaving the tool releases both. Two fingers
//   (and right / middle mouse, wheel) still move the camera.
//   A drag lays road on every tile the pointer crosses, skipping occupied ones.
//   When the pointer jumps tiles between moves the gap is filled with a
//   4-connected line, so a diagonal step adds an in-between tile and the road
//   stays continuous. A tap lays one tile. A cancelled drag keeps what was laid.
//
// API
//   initRoadTool()   call once after initControls and initInput
//   line4(x0, z0, x1, z1) -> [[x, z], ...]   4-connected tiles from (x0, z0)
//                    (exclusive) to (x1, z1) (inclusive)
import * as city from './city.js';
import * as tools from './tools.js';
import { on, setDragHandler } from './input.js';
import { setOneFingerPan } from './controls.js';

export function line4(x0, z0, x1, z1) {
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = Math.sign(x1 - x0);
  const sz = Math.sign(z1 - z0);
  const out = [];
  let x = x0, z = z0, ix = 0, iz = 0;
  while (ix < dx || iz < dz) {
    // Step along whichever axis lags behind the ideal line.
    if ((0.5 + ix) * dz < (0.5 + iz) * dx) { x += sx; ix++; } else { z += sz; iz++; }
    out.push([x, z]);
  }
  return out;
}

export function initRoadTool() {
  let last = null;    // last tile painted in this drag
  let claimed = false;

  function paintTo(tile) {
    if (!tile) return; // off the grid: keep `last` so coming back joins up
    if (!last) city.placeRoad(tile.x, tile.z);
    else for (const [x, z] of line4(last.x, last.z, tile.x, tile.z)) city.placeRoad(x, z);
    last = tile;
  }

  const handler = {
    dragstart: ({ tile }) => { last = null; paintTo(tile); },
    dragmove: ({ tile }) => paintTo(tile),
    dragend: ({ tile, cancelled }) => {
      if (!cancelled) paintTo(tile);
      last = null;
    },
  };

  function apply({ tool }) {
    const want = tool === 'road';
    if (want === claimed) return;
    claimed = want;
    setDragHandler(want ? handler : null);
    setOneFingerPan(!want);
  }

  on('tap', ({ tile }) => {
    if (tile && tools.getState().tool === 'road') city.placeRoad(tile.x, tile.z);
  });
  tools.subscribe(apply);
  apply(tools.getState());
}
