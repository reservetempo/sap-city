// buildingMeshes.js: placeholder voxel meshes for buildings, built from catalog data.
//
// API
//   createBuildingMesh({ type, x, z, rotation }) -> THREE.Group
//       already positioned on its footprint (x, z = min corner) and turned.
//       Nothing to dispose: geometry, materials and label textures are shared.
//   createGhost() -> { object, show(type, x, z, rotation, valid), hide() }
//       translucent footprint preview, green when valid and red when not, with
//       an arrow on top pointing to the front. Add `object` to the scene once.
//
// Facing: the front (door, plus a light ledge along the roof's front edge)
// points north at rotation 0, i.e. world -Z / towards tile z - 1 / away from
// the default camera. Each rotation step turns it a quarter clockwise seen
// from above: 1 east (+X), 2 south (+Z, towards the default camera), 3 west (-X).
import * as THREE from 'three';
import { getBuilding } from './catalog.js';
import { tileToWorld } from './scene.js';

const INSET = 0.1; // gap between the body and the footprint edge, per side
const TIER_STYLE = {
  1: { body: 0.55, step: 0.22, door: [0.26, 0.34], label: 1 },
  2: { body: 1.0, step: 0.34, door: [0.4, 0.55], label: 1.1 },
  3: { body: 1.45, step: 0.48, door: [0.6, 0.8], label: 1.2 },
};
const DOOR_COLOR = '#2a2f3b';
const LEDGE_COLOR = '#fbf4e2';

// Labels keep roughly the same size on screen: world height is LABEL_HEIGHT at
// LABEL_REF_DISTANCE (about the default zoom on a phone) and grows with
// distance ^ LABEL_ZOOM_POWER (1 = scale with the world, 0 = fixed pixel size),
// so zooming in 7x makes a label only about 2x bigger on screen.
// At the default phone zoom a gate's label is about 16 CSS px tall.
const LABEL_HEIGHT = 0.72;
const LABEL_REF_DISTANCE = 40;
const LABEL_ZOOM_POWER = 0.6;
const LABEL_FONT = '700 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const materials = new Map();
const labelMaterials = new Map();
const _pos = new THREE.Vector3();
const _cam = new THREE.Vector3();

function material(color, shade = 1) {
  const key = `${color}*${shade}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(shade), flatShading: true });
    materials.set(key, m);
  }
  return m;
}

/** A w×h×d box standing on y, centred on (x, z). */
function box(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function placeOnFootprint(obj3d, x, z, size, rotation) {
  tileToWorld(x + (size - 1) / 2, z + (size - 1) / 2, obj3d.position);
  obj3d.rotation.y = -rotation * Math.PI / 2; // clockwise seen from above
}

export function createBuildingMesh({ type, x, z, rotation = 0 }) {
  const def = getBuilding(type);
  const st = TIER_STYLE[def.tier];
  const s = def.size;
  const w = s - 2 * INSET;
  const h = st.body;
  const group = new THREE.Group();
  group.name = `building:${type}`;

  // Built facing local -Z (north at rotation 0).
  group.add(box(material(def.color), w, h, w, 0, 0, 0));
  // One roof step, set back towards the rear.
  const sw = w * 0.6;
  const sd = w * 0.45;
  group.add(box(material(def.color, 0.75), sw, st.step, sd, 0, h, w / 2 - sd / 2 - w * 0.1));
  // Front: a light ledge on the roof's front edge (seen from above) and a door.
  const ld = 0.1 + 0.05 * s;
  group.add(box(material(LEDGE_COLOR), w - 0.1, 0.06, ld, 0, h, -w / 2 + ld / 2 + 0.05));
  group.add(box(material(DOOR_COLOR), st.door[0], st.door[1], 0.06, 0, 0, -w / 2));

  const label = makeLabel(def, LABEL_HEIGHT * st.label);
  label.position.y = h + st.step + 0.15;
  group.add(label);

  placeOnFootprint(group, x, z, s, rotation);
  return group;
}

function labelMaterial(def) {
  let entry = labelMaterials.get(def.id);
  if (entry) return entry;

  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  g.font = LABEL_FONT;
  const ch = 84;
  const cw = Math.ceil(g.measureText(def.code).width + 30);
  canvas.width = cw; // resizing resets the context state
  canvas.height = ch;

  // White rounded tag with a rim in the building's colour, dark text.
  const lw = 7;
  const r = 20;
  g.beginPath();
  g.moveTo(lw / 2 + r, lw / 2);
  g.arcTo(cw - lw / 2, lw / 2, cw - lw / 2, ch - lw / 2, r);
  g.arcTo(cw - lw / 2, ch - lw / 2, lw / 2, ch - lw / 2, r);
  g.arcTo(lw / 2, ch - lw / 2, lw / 2, lw / 2, r);
  g.arcTo(lw / 2, lw / 2, cw - lw / 2, lw / 2, r);
  g.closePath();
  g.fillStyle = 'rgba(255, 255, 255, 0.94)';
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = def.color;
  g.stroke();
  g.font = LABEL_FONT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1d2433';
  g.fillText(def.code, cw / 2, ch / 2 + 2);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  entry = {
    material: new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }),
    aspect: cw / ch,
  };
  labelMaterials.set(def.id, entry);
  return entry;
}

function makeLabel(def, baseHeight) {
  const { material: mat, aspect } = labelMaterial(def);
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0); // grows upwards from its anchor
  sprite.renderOrder = 5;
  sprite.scale.set(baseHeight * aspect, baseHeight, 1);
  sprite.onBeforeRender = (renderer, scene, camera) => {
    _pos.setFromMatrixPosition(sprite.matrixWorld);
    const d = _cam.setFromMatrixPosition(camera.matrixWorld).distanceTo(_pos);
    const hgt = baseHeight * Math.pow(d / LABEL_REF_DISTANCE, LABEL_ZOOM_POWER);
    sprite.scale.set(hgt * aspect, hgt, 1);
    sprite.updateMatrixWorld();
  };
  return sprite;
}

// Ghost: one translucent box over the footprint plus a white arrow on top.
// Drawn over everything (no depth test) so it also shows on top of taller buildings.
const GHOST_OPTS = { transparent: true, opacity: 0.5, depthTest: false, depthWrite: false };
const ghostMaterials = {
  valid: new THREE.MeshLambertMaterial({ color: '#3ddc84', ...GHOST_OPTS }),
  invalid: new THREE.MeshLambertMaterial({ color: '#ff4040', ...GHOST_OPTS }),
  arrow: new THREE.MeshBasicMaterial({ color: '#ffffff', ...GHOST_OPTS, opacity: 0.9, side: THREE.DoubleSide }),
};
// Unit arrow lying flat, pointing to local -Z (the front).
const ARROW = new THREE.ShapeGeometry(new THREE.Shape([
  [0, 0.5], [0.4, 0.05], [0.15, 0.05], [0.15, -0.45], [-0.15, -0.45], [-0.15, 0.05], [-0.4, 0.05],
].map(([px, py]) => new THREE.Vector2(px, py)))).rotateX(-Math.PI / 2);

export function createGhost() {
  const object = new THREE.Group();
  object.name = 'ghost';
  object.visible = false;
  const body = new THREE.Mesh(BOX, ghostMaterials.valid);
  body.renderOrder = 10;
  const arrow = new THREE.Mesh(ARROW, ghostMaterials.arrow);
  arrow.renderOrder = 11;
  object.add(body, arrow);

  return {
    object,
    show(type, x, z, rotation, valid) {
      const def = getBuilding(type);
      if (!def) return;
      const s = def.size;
      const h = TIER_STYLE[def.tier].body + 0.05;
      body.material = valid ? ghostMaterials.valid : ghostMaterials.invalid;
      body.scale.set(s - 0.06, h, s - 0.06);
      body.position.y = h / 2;
      arrow.scale.setScalar(s * 0.7);
      arrow.position.y = h + 0.01;
      placeOnFootprint(object, x, z, s, rotation);
      object.visible = true;
    },
    hide() {
      object.visible = false;
    },
  };
}
