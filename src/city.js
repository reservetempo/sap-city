// city.js: the city data model. Plain data only, no three.js.
//
// Objects are frozen plain data with an integer id unique within the city:
//   building  { id, kind: 'building', type, x, z, rotation }
//             type: a catalog id; (x, z): the footprint's minimum corner, so it
//             covers x..x+size-1 and z..z+size-1; rotation: 0..3 quarter turns
//             clockwise seen from above (0 faces north, i.e. towards tile z - 1).
//   road      { id, kind: 'road', x, z }   one tile.
// Every tile holds at most one object.
//
// API
//   canPlaceBuilding(type, x, z) -> boolean   in bounds and every footprint tile free
//   placeBuilding(type, x, z, rotation = 0) -> object | null
//   placeRoad(x, z) -> object | null        only if in bounds and the tile is free
//   isRoad(x, z) -> boolean
//   removeAt(x, z) -> object | null           removes the whole object (building or road) covering that tile
//   objectAt(x, z) -> object | null
//   getObjects() -> [object, ...]             live (frozen) objects, in placement order
//   sizeOf(object) -> footprint side in tiles
//   getState() -> { version: 1, objects: [{ id, kind, ... }, ...] }   JSON-safe copy
//   loadState(state) -> number of objects loaded (invalid or overlapping ones are
//                       skipped; ids are renumbered)
//   clear()
//   subscribe(fn) -> unsubscribe              fn(event) after every change:
//     { type: 'add', object }
//     { type: 'remove', object }
//     { type: 'reset', objects }   after loadState / clear: drop everything, rebuild from `objects`
import { getBuilding } from './catalog.js';

/** Tiles per side. Must match GRID_SIZE in scene.js (kept here so this file needs no three.js). */
export const CITY_SIZE = 32;
const STATE_VERSION = 1;

const tiles = new Array(CITY_SIZE * CITY_SIZE).fill(null); // tile index -> object
const objects = new Map(); // id -> object, in insertion order
const listeners = new Set();
let nextId = 1;

// Per-kind rules: footprint size, and how to rebuild an object from saved data
// (returns its fields without the id, or null when invalid).
const KINDS = {
  building: {
    size: (o) => getBuilding(o.type).size,
    fromData: (d) => (getBuilding(d.type)
      ? { kind: 'building', type: d.type, x: d.x, z: d.z, rotation: wrapRotation(d.rotation) }
      : null),
  },
  road: {
    size: () => 1,
    fromData: (d) => ({ kind: 'road', x: d.x, z: d.z }),
  },
};

function wrapRotation(r) {
  return Number.isInteger(r) ? ((r % 4) + 4) % 4 : 0;
}

function inBounds(x, z) {
  return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < CITY_SIZE && z < CITY_SIZE;
}

function areaFree(x, z, size) {
  if (!inBounds(x, z) || !inBounds(x + size - 1, z + size - 1)) return false;
  for (let dz = 0; dz < size; dz++) {
    for (let dx = 0; dx < size; dx++) {
      if (tiles[(z + dz) * CITY_SIZE + x + dx]) return false;
    }
  }
  return true;
}

function fill(obj, value) {
  const size = sizeOf(obj);
  for (let dz = 0; dz < size; dz++) {
    for (let dx = 0; dx < size; dx++) tiles[(obj.z + dz) * CITY_SIZE + obj.x + dx] = value;
  }
}

/** Store fields as a new object if its footprint is free. Returns it or null. No event. */
function insert(fields) {
  if (!areaFree(fields.x, fields.z, KINDS[fields.kind].size(fields))) return null;
  const obj = Object.freeze({ id: nextId++, ...fields });
  objects.set(obj.id, obj);
  fill(obj, obj);
  return obj;
}

function reset() {
  tiles.fill(null);
  objects.clear();
  nextId = 1;
}

function emit(event) {
  for (const fn of [...listeners]) fn(event);
}

export function sizeOf(obj) {
  return KINDS[obj.kind].size(obj);
}

export function canPlaceBuilding(type, x, z) {
  const def = getBuilding(type);
  return !!def && areaFree(x, z, def.size);
}

export function placeBuilding(type, x, z, rotation = 0) {
  if (!canPlaceBuilding(type, x, z)) return null;
  const obj = insert({ kind: 'building', type, x, z, rotation: wrapRotation(rotation) });
  emit({ type: 'add', object: obj });
  return obj;
}

export function placeRoad(x, z) {
  const obj = insert({ kind: 'road', x, z });
  if (obj) emit({ type: 'add', object: obj });
  return obj;
}

export function isRoad(x, z) {
  const obj = objectAt(x, z);
  return !!obj && obj.kind === 'road';
}

export function objectAt(x, z) {
  return inBounds(x, z) ? tiles[z * CITY_SIZE + x] : null;
}

export function removeAt(x, z) {
  const obj = objectAt(x, z);
  if (!obj) return null;
  fill(obj, null);
  objects.delete(obj.id);
  emit({ type: 'remove', object: obj });
  return obj;
}

export function getObjects() {
  return [...objects.values()];
}

export function getState() {
  return { version: STATE_VERSION, objects: getObjects().map((o) => ({ ...o })) };
}

export function loadState(state) {
  reset();
  const list = state && Array.isArray(state.objects) ? state.objects : [];
  for (const data of list) {
    const kind = data && Object.hasOwn(KINDS, data.kind) ? KINDS[data.kind] : null;
    const fields = kind && kind.fromData(data);
    if (fields) insert(fields);
  }
  emit({ type: 'reset', objects: getObjects() });
  return objects.size;
}

export function clear() {
  reset();
  emit({ type: 'reset', objects: [] });
}

/** Call fn(event) after every change. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
