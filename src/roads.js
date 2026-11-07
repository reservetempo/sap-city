// roads.js: the road layer. One mesh per road tile, shaped by which of its four
// neighbours are roads too: isolated, dead end, straight, corner, T or cross.
// It listens to city events itself: adding or removing a road re-shapes the
// tiles around it, and a reset rebuilds everything.
//
// A piece is a few flat boxes merged into one geometry, shared by every tile
// with the same shape (geometries are cached by shape, one material for all):
//   - an asphalt slab covering the tile, SLAB_H above the grass
//   - a curb along each side that has no road neighbour
//   - a light dash from the centre towards each road neighbour
//   - a curb post in each inner corner (both sides connected, diagonal not road)
//
// API
//   initRoads(parent) -> THREE.Group   call once; adds a 'roads' group to parent
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as city from './city.js';
import { tileToWorld } from './scene.js';

const SLAB_H = 0.03;   // asphalt top above the grass
const CURB_W = 0.1;
const CURB_H = 0.05;   // above the asphalt
const DASH_W = 0.07;
const DASH_H = 0.012;  // above the asphalt
const ASPHALT = '#5c6169';
const CURB = '#d3cec3';
const DASH = '#f6f1e3';

// Neighbour bits. North is tile z - 1 (world -Z), east is x + 1 (world +X).
const N = 1, E = 2, S = 4, W = 8;
const DIRS = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]]; // [bit, dx, dz]
// Inner corners: [post bit, side a, side b, dx, dz]
const CORNERS = [[16, N, E, 1, -1], [32, E, S, 1, 1], [64, S, W, -1, 1], [128, W, N, -1, -1]];

const MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const geometries = new Map(); // shape key -> BufferGeometry

/** Shape key: neighbour bits N/E/S/W plus inner-corner post bits. */
function shapeAt(x, z) {
  let key = 0;
  for (const [bit, dx, dz] of DIRS) if (city.isRoad(x + dx, z + dz)) key |= bit;
  for (const [bit, a, b, dx, dz] of CORNERS) {
    if ((key & a) && (key & b) && !city.isRoad(x + dx, z + dz)) key |= bit;
  }
  return key;
}

/** A w×h×d box in tile-local space, bottom at y, centred on (x, z), painted one colour. */
function box(color, w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function buildGeometry(key) {
  const parts = [box(ASPHALT, 1, SLAB_H, 1, 0, 0, 0)];
  const edge = 0.5 - CURB_W / 2;
  // Curbs: north/south run the full side; east/west stop short of them so tops never overlap.
  if (!(key & N)) parts.push(box(CURB, 1, CURB_H, CURB_W, 0, SLAB_H, -edge));
  if (!(key & S)) parts.push(box(CURB, 1, CURB_H, CURB_W, 0, SLAB_H, edge));
  const z0 = key & N ? -0.5 : -0.5 + CURB_W;
  const z1 = key & S ? 0.5 : 0.5 - CURB_W;
  if (!(key & E)) parts.push(box(CURB, CURB_W, CURB_H, z1 - z0, edge, SLAB_H, (z0 + z1) / 2));
  if (!(key & W)) parts.push(box(CURB, CURB_W, CURB_H, z1 - z0, -edge, SLAB_H, (z0 + z1) / 2));
  // Dashes, one per connected arm, from 0.125 to 0.375 out: even spacing along a straight run.
  for (const [bit, dx, dz] of DIRS) {
    if (!(key & bit)) continue;
    const w = dx ? 0.25 : DASH_W;
    const d = dz ? 0.25 : DASH_W;
    parts.push(box(DASH, w, DASH_H, d, dx * 0.25, SLAB_H, dz * 0.25));
  }
  for (const [bit, , , dx, dz] of CORNERS) {
    if (key & bit) parts.push(box(CURB, CURB_W, CURB_H, CURB_W, dx * edge, SLAB_H, dz * edge));
  }
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

function geometryFor(key) {
  let g = geometries.get(key);
  if (!g) {
    g = buildGeometry(key);
    geometries.set(key, g);
  }
  return g;
}

export function initRoads(parent) {
  const group = new THREE.Group();
  group.name = 'roads';
  parent.add(group);
  const meshes = new Map(); // tile index -> { mesh, key }

  /** Make tile (x, z)'s mesh match the city: create, re-shape or drop it. */
  function refresh(x, z) {
    if (x < 0 || z < 0 || x >= city.CITY_SIZE || z >= city.CITY_SIZE) return;
    const i = z * city.CITY_SIZE + x;
    const entry = meshes.get(i);
    if (!city.isRoad(x, z)) {
      if (entry) {
        group.remove(entry.mesh);
        meshes.delete(i);
      }
      return;
    }
    const key = shapeAt(x, z);
    if (entry) {
      if (entry.key !== key) {
        entry.mesh.geometry = geometryFor(key);
        entry.mesh.userData.shape = key;
        entry.key = key;
      }
      return;
    }
    const mesh = new THREE.Mesh(geometryFor(key), MATERIAL);
    mesh.name = `road ${x},${z}`;
    mesh.userData.shape = key; // for debugging: neighbour + corner-post bits
    tileToWorld(x, z, mesh.position);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    meshes.set(i, { mesh, key });
  }

  /** The tile and its 8 neighbours (diagonals affect corner posts). */
  function refreshAround(x, z) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) refresh(x + dx, z + dz);
  }

  function rebuild(objects) {
    for (const { mesh } of meshes.values()) group.remove(mesh);
    meshes.clear();
    for (const o of objects) if (o.kind === 'road') refresh(o.x, o.z);
  }

  rebuild(city.getObjects());
  city.subscribe((e) => {
    if (e.type === 'reset') rebuild(e.objects);
    else if (e.object.kind === 'road') refreshAround(e.object.x, e.object.z);
  });
  return group;
}
