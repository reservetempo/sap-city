// placement.js: what a tap does with the build and erase tools, plus the ghost.
//   Build: a tap places tools' buildingId + rotation with its footprint centred
//          on the tapped tile. If it doesn't fit (blocked or off the grid) a red
//          ghost flashes for FLASH_MS and nothing is placed. With a mouse, a
//          ghost follows the hover: green when it fits, red when not.
//   Erase: a tap removes the whole object covering the tapped tile.
//   Pan and road: taps are ignored here.
//
// API
//   initPlacement(scene)          call once after initInput; adds the ghost to the scene
//   footprintOrigin(type, tile) -> {x, z}   min corner of a footprint centred on tile;
//                                 for even sizes tile is the one just up-left of centre
import { getBuilding } from './catalog.js';
import { on } from './input.js';
import * as tools from './tools.js';
import * as city from './city.js';
import { createGhost } from './buildingMeshes.js';

const FLASH_MS = 600;

export function footprintOrigin(type, tile) {
  const k = Math.floor((getBuilding(type).size - 1) / 2);
  return { x: tile.x - k, z: tile.z - k };
}

export function initPlacement(scene) {
  const ghost = createGhost();
  scene.add(ghost.object);
  let hoverTile = null; // mouse only
  let flashTimer = 0;

  function refresh() {
    if (flashTimer) return;
    const { tool, buildingId, rotation } = tools.getState();
    if (tool !== 'build' || !buildingId || !hoverTile) {
      ghost.hide();
      return;
    }
    const { x, z } = footprintOrigin(buildingId, hoverTile);
    ghost.show(buildingId, x, z, rotation, city.canPlaceBuilding(buildingId, x, z));
  }

  function stopFlash() {
    clearTimeout(flashTimer);
    flashTimer = 0;
  }

  function flash(type, x, z, rotation) {
    stopFlash();
    ghost.show(type, x, z, rotation, false);
    flashTimer = setTimeout(() => {
      flashTimer = 0;
      refresh();
    }, FLASH_MS);
  }

  on('tap', ({ tile }) => {
    if (!tile) return;
    const { tool, buildingId, rotation } = tools.getState();
    if (tool === 'build' && buildingId) {
      const { x, z } = footprintOrigin(buildingId, tile);
      if (!city.placeBuilding(buildingId, x, z, rotation)) flash(buildingId, x, z, rotation);
    } else if (tool === 'erase') {
      city.removeAt(tile.x, tile.z);
    }
  });

  on('hover', ({ tile }) => {
    hoverTile = tile;
    refresh();
  });

  tools.subscribe(() => {
    stopFlash();
    refresh();
  });
  city.subscribe(refresh);
}
