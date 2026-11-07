// tools.js: tiny store for the current tool, chosen building and rotation.
//   tool:       'pan' | 'road' | 'erase' | 'build'
//   buildingId: last picked building (kept while another tool is active)
//   rotation:   0..3 quarter turns clockwise
import { getBuilding } from './catalog.js';

export const TOOLS = Object.freeze(['pan', 'road', 'erase', 'build']);

let state = Object.freeze({ tool: 'pan', buildingId: null, rotation: 0 });
const listeners = new Set();

export function getState() {
  return state;
}

/**
 * Merge a partial update. Invalid values are ignored; rotation wraps to 0..3.
 * Switching to 'build' needs a building (given here or remembered).
 * Listeners get (state, prevState) only when something changed.
 */
export function setState(partial = {}) {
  const next = { ...state };
  if ('buildingId' in partial && getBuilding(partial.buildingId)) next.buildingId = partial.buildingId;
  if ('rotation' in partial && Number.isInteger(partial.rotation)) next.rotation = ((partial.rotation % 4) + 4) % 4;
  if ('tool' in partial && TOOLS.includes(partial.tool)) {
    if (partial.tool !== 'build' || next.buildingId) next.tool = partial.tool;
  }
  if (next.tool === state.tool && next.buildingId === state.buildingId && next.rotation === state.rotation) return state;

  const prev = state;
  state = Object.freeze(next);
  for (const fn of [...listeners]) fn(state, prev);
  return state;
}

/** Call fn(state, prevState) on every change. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Convenience actions used by the toolbar.
export function selectTool(tool) {
  return setState({ tool });
}

export function selectBuilding(id) {
  return setState({ tool: 'build', buildingId: id });
}

export function rotate(step = 1) {
  return setState({ rotation: state.rotation + step });
}
