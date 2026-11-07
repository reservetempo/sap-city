/**
 * scene.js: renderer, camera, lights and the ground.
 *
 * Coordinate convention
 *   - The grid is GRID_SIZE x GRID_SIZE tiles (32 x 32), 1 world unit per tile,
 *     centred on the world origin. Y is up.
 *   - Tile (x, z), integers 0..31, covers world X in [x - 16, x - 15) and
 *     Z in [z - 16, z - 15). Its centre is (x - 15.5, 0, z - 15.5).
 *     Tile x grows along world +X, tile z along world +Z.
 *   - The grass surface is the plane y = 0, so anything standing on a tile
 *     starts at y = 0.
 *   - With the default camera (yaw 0, looking towards -Z) tile (0, 0) is the
 *     far-left corner and tile (31, 31) the near-right corner.
 */
import * as THREE from 'three';

export const GRID_SIZE = 32;
const HALF = GRID_SIZE / 2;

const SKY_TOP = '#5ab4f2';
const SKY_BOTTOM = '#d4f0ff';

/** World-space centre of tile (x, z), on the ground (y = 0). */
export function tileToWorld(x, z, out = new THREE.Vector3()) {
  return out.set(x - HALF + 0.5, 0, z - HALF + 0.5);
}

/** Tile containing a world point ({x, z} used, y ignored), or null outside the grid. */
export function worldToTile(point) {
  const x = Math.floor(point.x + HALF);
  const z = Math.floor(point.z + HALF);
  if (x < 0 || z < 0 || x >= GRID_SIZE || z >= GRID_SIZE) return null;
  return { x, z };
}

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/**
 * Where a screen point (clientX/clientY) hits the ground plane y = 0, or null
 * if the ray misses it (pointing at the sky). Not limited to the grid.
 */
export function screenToGround(camera, canvas, clientX, clientY, out = new THREE.Vector3()) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(groundPlane, out);
}

/**
 * Builds the renderer, scene and camera inside `container` and keeps them
 * sized to it. The camera is positioned by controls.js.
 */
export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);

  // Lights: soft sky fill plus a sun whose shadow box covers the whole grid.
  scene.add(new THREE.HemisphereLight(0xdff2ff, 0x8a7350, 1.7));
  const sun = new THREE.DirectionalLight(0xfff2db, 2.6);
  sun.position.set(16, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24;
  sc.near = 1; sc.far = 90;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  scene.add(buildGround(renderer));

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  // Some phones report the new size a moment after the rotation event.
  window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 300); });

  return { renderer, scene, camera };
}

function buildGround(renderer) {
  const group = new THREE.Group();
  group.name = 'ground';

  const grassTop = new THREE.MeshLambertMaterial({ map: makeGrassTexture(renderer) });
  const grassSide = new THREE.MeshLambertMaterial({ color: 0x5aa83e });
  const dirt = new THREE.MeshLambertMaterial({ color: 0x9c6b3e, flatShading: true });

  // Grass slab, top face at y = 0. Box face order: +x, -x, +y, -y, +z, -z.
  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(GRID_SIZE, 0.4, GRID_SIZE),
    [grassSide, grassSide, grassTop, dirt, grassSide, grassSide],
  );
  grass.position.y = -0.2;
  grass.receiveShadow = true;
  group.add(grass);

  // Slightly raised dirt rim around the grid, deep enough to read as an island.
  const RIM = 0.5;
  const RIM_TOP = 0.15;
  const RIM_DEPTH = 2;
  const rimH = RIM_TOP + RIM_DEPTH;
  const rimY = RIM_TOP - rimH / 2;
  const long = GRID_SIZE + RIM * 2;
  const sides = [
    [long, RIM, 0, HALF + RIM / 2],
    [long, RIM, 0, -HALF - RIM / 2],
    [RIM, GRID_SIZE, HALF + RIM / 2, 0],
    [RIM, GRID_SIZE, -HALF - RIM / 2, 0],
  ];
  for (const [w, d, x, z] of sides) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, rimH, d), dirt);
    m.position.set(x, rimY, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

/** Grass with a faint per-tile shade variation and subtle tile lines. */
function makeGrassTexture(renderer) {
  const px = 32;
  const size = GRID_SIZE * px;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');

  let seed = 12345; // deterministic, so the field looks the same on every load
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const light = 47 + (rand() - 0.5) * 3;
      g.fillStyle = `hsl(98, 52%, ${light}%)`;
      g.fillRect(x * px, z * px, px, px);
    }
  }
  g.fillStyle = 'rgba(20, 60, 10, 0.16)';
  for (let i = 0; i <= GRID_SIZE; i++) {
    g.fillRect(i * px - 1, 0, 2, size);
    g.fillRect(0, i * px - 1, size, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(1, SKY_BOTTOM);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
