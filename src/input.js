/**
 * input.js: the single owner of pointer and wheel listeners on the canvas.
 * It decides who gets each pointer: a tap, a claimed drag, or the camera
 * (forwarded to controls.js, which listens to nothing itself).
 *
 * API
 *   initInput(canvas, camera)       call once, after initControls
 *   on(type, fn) -> unsubscribe     type is 'tap' or 'hover'
 *     tap    { tile, clientX, clientY, pointerType }
 *            one finger or left click that moved < 10 px and lasted < 400 ms
 *     hover  { tile }   mouse only; fires when the tile under the mouse changes
 *   setDragHandler(handler | null)  claim one-finger / left-mouse drags
 *     handler = { dragstart(e), dragmove(e), dragend(e) }, each optional
 *     e = { tile, clientX, clientY, pointerType, cancelled }
 *     dragstart.tile is the tile where the pointer first went down;
 *     dragmove fires on every move; dragend.cancelled is true when a second
 *     finger (or the browser) interrupted the drag.
 *     With no handler set, these drags go to the camera instead.
 *   pickTile(clientX, clientY) -> {x, z} | null
 *
 *   `tile` is always {x, z} or null (off the grid / sky).
 *
 * Routing
 *   - The first finger (or a left click) starts as a possible tap. Once it
 *     moves 10 px it becomes a drag: to the drag handler if one is set,
 *     otherwise to the camera (which pans only if one-finger pan is on).
 *   - A second finger cancels any pending tap or claimed drag, and from then
 *     until every finger lifts all fingers belong to the camera
 *     (pan + pinch-zoom + twist-rotate).
 *   - Right drag rotates, middle drag pans, the wheel zooms (always camera).
 */
import * as THREE from 'three';
import { screenToGround, worldToTile } from './scene.js';
import * as controls from './controls.js';

const TAP_SLOP = 10;  // px
const TAP_TIME = 400; // ms

let canvas = null;
let camera = null;
let dragHandler = null;
const listeners = { tap: new Set(), hover: new Set() };

const active = new Map();     // pointerId -> { x, y, type }
const cameraIds = new Set();  // pointers currently forwarded to the camera
let primary = null;           // { id, type, startX, startY, startTime, mode: 'pending' | 'drag' }
let hoverKey = null;
const tmp = new THREE.Vector3();

export function initInput(canvasEl, cameraObj) {
  canvas = canvasEl;
  camera = cameraObj;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setHover(null); });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS Safari pinch-zooms the page despite user-scalable=no unless told not to.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

export function on(type, fn) {
  const set = listeners[type];
  if (!set) throw new Error(`input.on: unknown event "${type}"`);
  set.add(fn);
  return () => set.delete(fn);
}

export function setDragHandler(handler) {
  if (primary && primary.mode === 'drag') {
    const p = active.get(primary.id);
    emitDrag('dragend', p.x, p.y, primary.type, true);
    primary.mode = 'done'; // the rest of this gesture is ignored
  }
  dragHandler = handler || null;
}

export function pickTile(clientX, clientY) {
  const hit = screenToGround(camera, canvas, clientX, clientY, tmp);
  return hit ? worldToTile(hit) : null;
}

// ---- routing ------------------------------------------------------------

function onPointerDown(e) {
  if (active.has(e.pointerId)) return;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable; fine */ }
  active.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

  if (e.pointerType === 'mouse') {
    if (e.button === 0) { if (!primary) startPrimary(e); }
    else toCamera(e.pointerId, e.clientX, e.clientY, e.button === 2 ? 'rotate' : 'pan');
    return;
  }

  let fingers = 0;
  for (const p of active.values()) if (p.type !== 'mouse') fingers++;
  if (fingers === 1 && !primary) { startPrimary(e); return; }

  // Another finger joined: no tap, no claimed drag; the camera gets all fingers.
  if (primary) {
    if (primary.mode === 'drag') {
      const p = active.get(primary.id);
      emitDrag('dragend', p.x, p.y, primary.type, true);
    }
    primary = null;
  }
  for (const [id, p] of active) {
    if (p.type !== 'mouse' && !cameraIds.has(id)) toCamera(id, p.x, p.y, 'primary');
  }
}

function onPointerMove(e) {
  if (e.pointerType === 'mouse') setHover(pickTile(e.clientX, e.clientY));
  const p = active.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;

  if (cameraIds.has(e.pointerId)) {
    controls.pointerMove(e.pointerId, p.x, p.y);
    return;
  }
  if (!primary || primary.id !== e.pointerId) return;

  if (primary.mode === 'pending' &&
      Math.hypot(p.x - primary.startX, p.y - primary.startY) >= TAP_SLOP) {
    if (dragHandler) {
      primary.mode = 'drag';
      emitDrag('dragstart', primary.startX, primary.startY, primary.type, false);
    } else {
      // Unclaimed drag: hand it to the camera from where it started, so no motion is lost.
      toCamera(primary.id, primary.startX, primary.startY, 'primary');
      controls.pointerMove(primary.id, p.x, p.y);
      primary = null;
      return;
    }
  }
  if (primary.mode === 'drag') emitDrag('dragmove', p.x, p.y, primary.type, false);
}

function onPointerUp(e) {
  const p = active.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  active.delete(e.pointerId);
  if (cameraIds.delete(e.pointerId)) controls.pointerUp(e.pointerId);
  if (!primary || primary.id !== e.pointerId) return;

  const cancelled = e.type === 'pointercancel';
  if (primary.mode === 'drag') {
    emitDrag('dragend', p.x, p.y, primary.type, cancelled);
  } else if (primary.mode === 'pending' && !cancelled &&
             performance.now() - primary.startTime < TAP_TIME &&
             Math.hypot(p.x - primary.startX, p.y - primary.startY) < TAP_SLOP) {
    emit('tap', { tile: pickTile(p.x, p.y), clientX: p.x, clientY: p.y, pointerType: primary.type });
  }
  primary = null;
}

function onWheel(e) {
  e.preventDefault();
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;
  else if (e.deltaMode === 2) dy *= 400;
  // Trackpad pinch arrives as ctrl+wheel with small deltas.
  controls.zoomAt(e.clientX, e.clientY, Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)));
  setHover(pickTile(e.clientX, e.clientY));
}

function startPrimary(e) {
  primary = {
    id: e.pointerId,
    type: e.pointerType,
    startX: e.clientX,
    startY: e.clientY,
    startTime: performance.now(),
    mode: 'pending',
  };
}

function toCamera(id, x, y, kind) {
  cameraIds.add(id);
  controls.pointerDown(id, x, y, kind);
}

function emit(type, event) {
  for (const fn of listeners[type]) fn(event);
}

function emitDrag(type, x, y, pointerType, cancelled) {
  const fn = dragHandler && dragHandler[type];
  if (fn) fn({ tile: pickTile(x, y), clientX: x, clientY: y, pointerType, cancelled });
}

function setHover(tile) {
  const key = tile ? `${tile.x},${tile.z}` : '';
  if (key === hoverKey) return;
  hoverKey = key;
  emit('hover', { tile });
}
