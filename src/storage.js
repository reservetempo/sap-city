// storage.js: autosaves the city and the camera view to the browser's
// localStorage and restores them on startup.
//
//   initStorage({ city, getView, setView }) -> { clear, flush }
//     Loads the saved city (and view) right away, then saves about 300 ms after
//     each city change or camera gesture, and immediately when the page is hidden
//     or closed. clear() empties the city and forgets the saved city; the camera
//     stays where it is.
//
// Storage can be missing or full (private mode, blocked site data), and saved
// data can be stale or broken: every access is guarded, and any problem leaves
// an empty city plus one console warning.

const CITY_KEY = 'sap-city:v1';
const VIEW_KEY = 'sap-city:view:v1';
const SAVE_DELAY = 300; // ms

const VIEW_FIELDS = ['x', 'z', 'distance', 'yaw'];

export function initStorage({ city, getView, setView }) {
  const version = city.getState().version;
  let warned = false;
  let timer = 0;
  let cityDirty = false;
  let lastView = null; // JSON of the last view written, to skip unchanged writes

  function warn(message, err) {
    if (warned) return;
    warned = true;
    console.warn(`Sap City: ${message}`, err ?? '');
  }

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      warn('browser storage is unavailable, so the city will not be saved.', err);
      return null;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      warn('could not save to browser storage.', err);
    }
  }
  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      warn('could not clear browser storage.', err);
    }
  }

  // ---- load -------------------------------------------------------------

  const rawCity = read(CITY_KEY);
  if (rawCity !== null) {
    try {
      const state = JSON.parse(rawCity);
      if (!state || state.version !== version || !Array.isArray(state.objects)) {
        throw new Error('unexpected format');
      }
      city.loadState(state); // skips unknown building types and bad entries
    } catch (err) {
      warn('the saved city could not be read, so starting with an empty city.', err);
      city.clear();
    }
  }

  const rawView = read(VIEW_KEY);
  if (rawView !== null) {
    try {
      const view = JSON.parse(rawView);
      if (!view || !VIEW_FIELDS.every((k) => Number.isFinite(view[k])) || view.distance <= 0) {
        throw new Error('unexpected format');
      }
      setView(view);
      lastView = rawView;
    } catch (err) {
      warn('the saved camera view could not be read.', err);
    }
  }

  // ---- save -------------------------------------------------------------

  function flush() {
    clearTimeout(timer);
    timer = 0;
    if (cityDirty) {
      cityDirty = false;
      write(CITY_KEY, JSON.stringify(city.getState()));
    }
    const view = JSON.stringify(getView());
    if (view !== lastView) {
      lastView = view;
      write(VIEW_KEY, view);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
  }

  // Subscribed after loading, so the load itself does not trigger a save.
  city.subscribe(() => {
    cityDirty = true;
    schedule();
  });

  // Camera gestures end with a pointer release or a wheel turn; the view is
  // compared with the last saved one, so unrelated taps write nothing.
  for (const type of ['pointerup', 'pointercancel', 'wheel']) {
    window.addEventListener(type, schedule, { passive: true });
  }

  // Phones may close a hidden page without warning: save what's pending now.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  function clear() {
    city.clear();
    cityDirty = false; // nothing to write: the saved city is removed instead
    remove(CITY_KEY);
  }

  return { clear, flush };
}
