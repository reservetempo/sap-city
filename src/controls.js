/**
 * controls.js: camera controller. The camera orbits a target point on the
 * ground, looking down at a fixed PITCH; the user changes the target (pan),
 * the distance (zoom) and the yaw (rotate around the vertical axis).
 *
 * This module adds NO event listeners. input.js owns every pointer/wheel
 * listener on the canvas and forwards the pointers that belong to the camera
 * through the gesture sink below, so nothing is handled twice.
 *
 * API
 *   initControls(camera, canvas)   call once; frames the grid for the current aspect
 *   setOneFingerPan(enabled)       when false, a lone finger / left-drag does not pan
 *   resetView()                    back to the default framing
 *   getView() -> {x, z, distance, yaw}, setView(view)   plain data, e.g. for saving
 *
 * Gesture sink (used by input.js):
 *   pointerDown(id, clientX, clientY, kind)  kind: 'primary' (finger / left mouse),
 *                                            'pan' (middle mouse), 'rotate' (right mouse)
 *   pointerMove(id, clientX, clientY)
 *   pointerUp(id)
 *   zoomAt(clientX, clientY, factor)         factor > 1 zooms out, about that screen point
 *
 * With one 'primary' pointer: pan. With two: pan (midpoint), pinch-zoom and
 * twist-rotate together, all pivoting on the ground point under the fingers,
 * so the ground stays under the fingers.
 */
import * as THREE from 'three';
import { GRID_SIZE, screenToGround } from './scene.js';

const PITCH = THREE.MathUtils.degToRad(50);
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 80;
const ROTATE_SPEED = 0.008; // radians per pixel for right-drag
const HALF = GRID_SIZE / 2;
const UP = new THREE.Vector3(0, 1, 0);

let camera = null;
let canvas = null;
const target = new THREE.Vector3();
let distance = 40;
let yaw = 0;
let oneFingerPan = true;

const pointers = new Map(); // id -> { x, y, kind }, in insertion order

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const pivot = new THREE.Vector3();
const offset = new THREE.Vector3();

export function initControls(cam, canvasEl) {
  camera = cam;
  canvas = canvasEl;
  resetView();
}

export function setOneFingerPan(enabled) {
  oneFingerPan = !!enabled;
}

export function resetView() {
  target.set(0, 0, 0);
  yaw = 0;
  distance = defaultDistance();
  apply();
}

export function getView() {
  return { x: target.x, z: target.z, distance, yaw };
}

export function setView(view) {
  target.set(view.x ?? target.x, 0, view.z ?? target.z);
  distance = view.distance ?? distance;
  yaw = view.yaw ?? yaw;
  apply();
}

// ---- gesture sink -------------------------------------------------------

export function pointerDown(id, x, y, kind = 'primary') {
  pointers.set(id, { x, y, kind });
}

export function pointerUp(id) {
  pointers.delete(id);
}

export function pointerMove(id, x, y) {
  const p = pointers.get(id);
  if (!p) return;
  const px = p.x;
  const py = p.y;

  if (p.kind === 'rotate') {
    p.x = x; p.y = y;
    rotateAround(target, -(x - px) * ROTATE_SPEED);
    apply();
    return;
  }
  if (p.kind === 'pan') {
    p.x = x; p.y = y;
    pan(px, py, x, y);
    return;
  }

  const fingers = [];
  for (const q of pointers.values()) if (q.kind === 'primary' && fingers.length < 2) fingers.push(q);

  if (fingers.length === 2 && (fingers[0] === p || fingers[1] === p)) {
    const before = measure(fingers[0], fingers[1]);
    p.x = x; p.y = y;
    const after = measure(fingers[0], fingers[1]);
    twoFinger(before, after);
  } else {
    p.x = x; p.y = y;
    if (fingers.length === 1 && oneFingerPan) pan(px, py, x, y);
    // A third finger is ignored until one of the first two lifts.
  }
}

export function zoomAt(x, y, factor) {
  const hit = screenToGround(camera, canvas, x, y, pivot);
  zoomAround(hit || target, factor);
  apply();
}

// ---- internals ----------------------------------------------------------

function measure(a, b) {
  return {
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
    dist: Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

function twoFinger(before, after) {
  pan(before.mx, before.my, after.mx, after.my);
  let turn = after.angle - before.angle;
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  // Pivot on the ground point now under the midpoint, so it stays put.
  const hit = screenToGround(camera, canvas, after.mx, after.my, pivot) || target;
  rotateAround(hit, turn);
  zoomAround(hit, before.dist / after.dist);
  apply();
}

/** Drag the ground: the point under (x0, y0) moves to be under (x1, y1). */
function pan(x0, y0, x1, y1) {
  const a = screenToGround(camera, canvas, x0, y0, tmpA);
  const b = screenToGround(camera, canvas, x1, y1, tmpB);
  if (!a || !b) return;
  target.add(a.sub(b));
  apply();
}

/** Orbit the whole camera rig around a ground point (positive = screen clockwise). */
function rotateAround(point, angle) {
  if (!angle) return;
  offset.subVectors(target, point).applyAxisAngle(UP, angle);
  target.copy(point).add(offset);
  yaw += angle;
}

/** Scale the camera distance, keeping `point` fixed on screen. */
function zoomAround(point, factor) {
  const next = THREE.MathUtils.clamp(distance * factor, MIN_DISTANCE, MAX_DISTANCE);
  const k = next / distance;
  offset.subVectors(target, point).multiplyScalar(k);
  target.copy(point).add(offset);
  distance = next;
}

function defaultDistance() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const byWidth = 9 / (t * camera.aspect); // about 18 tiles across on a portrait phone
  const byHeight = 18.6 / t;               // near edge stays on screen (landscape)
  return THREE.MathUtils.clamp(Math.max(byWidth, byHeight), MIN_DISTANCE, MAX_DISTANCE);
}

function apply() {
  target.x = THREE.MathUtils.clamp(target.x, -HALF, HALF);
  target.z = THREE.MathUtils.clamp(target.z, -HALF, HALF);
  target.y = 0;
  const h = distance * Math.cos(PITCH);
  camera.position.set(
    target.x + Math.sin(yaw) * h,
    distance * Math.sin(PITCH),
    target.z + Math.cos(yaw) * h,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
