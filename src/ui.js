// ui.js: the bottom toolbar. Row 1 holds the tools, row 2 a sideways-scrolling
// building picker grouped by tier. It only reads and writes the tools.js store.
import { BUILDINGS, TIERS } from './catalog.js';
import { getState, subscribe, selectTool, selectBuilding, rotate } from './tools.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 24×24 stroke icons, drawn in currentColor.
const ICONS = {
  pan: '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  road: '<path d="M8 21L10.5 3M16 21L13.5 3"/><path d="M12 5v2M12 10.5v2.5M12 16.5v3"/>',
  erase: '<path d="M14.5 4.5l5 5L11 18H7l-3-3z"/><path d="M9.5 9.5l5 5"/><path d="M12 21h8"/>',
  // Points "up" at rotation 0; the whole icon turns with the rotation.
  rotate: '<rect x="4" y="4" width="16" height="16" rx="3"/>'
    + '<path d="M12 6.5l4.5 5h-3v5.5h-3v-5.5h-3z" fill="currentColor" stroke="none"/>',
};

const TOOL_BUTTONS = [
  { tool: 'pan', label: 'Pan' },
  { tool: 'road', label: 'Road' },
  { tool: 'erase', label: 'Erase' },
];

const FACING = ['north', 'east', 'south', 'west'];

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name}`);
  svg.innerHTML = ICONS[name];
  return svg;
}

function toolButton(name, label) {
  const btn = el('button', 'tool', { type: 'button', 'data-tool': name });
  const text = el('span', 'tool-label');
  text.textContent = label;
  btn.append(icon(name), text);
  return btn;
}

/**
 * Build the toolbar inside `root` (the #ui overlay).
 * Returns { toolbar, actions, destroy }: `actions` is the empty right-hand end
 * of row 1, kept free for later buttons (e.g. Clear).
 */
export function initUI(root = document.getElementById('ui')) {
  const toolbar = el('nav', 'toolbar', { 'aria-label': 'Toolbar' });

  // Row 1: tools.
  const row = el('div', 'toolbar-row', { role: 'group', 'aria-label': 'Tools' });
  const toolButtons = new Map();
  for (const { tool, label } of TOOL_BUTTONS) {
    const btn = toolButton(tool, label);
    btn.addEventListener('click', () => selectTool(tool));
    toolButtons.set(tool, btn);
    row.append(btn);
  }
  row.append(el('span', 'toolbar-sep', { 'aria-hidden': 'true' }));
  const rotateBtn = toolButton('rotate', 'Rotate');
  const rotateIcon = rotateBtn.querySelector('svg');
  rotateBtn.addEventListener('click', () => rotate(1));
  const actions = el('div', 'toolbar-actions');
  row.append(rotateBtn, actions);

  // Row 2: building picker, one group per tier.
  const picker = el('div', 'picker', { role: 'group', 'aria-label': 'Buildings' });
  const cards = new Map();
  for (const t of TIERS) {
    const group = el('div', 'picker-tier', { role: 'group', 'aria-label': t.label });
    const heading = el('span', 'picker-label', { 'aria-hidden': 'true' });
    heading.textContent = t.label;
    const list = el('div', 'picker-cards');
    for (const b of BUILDINGS.filter((x) => x.tier === t.tier)) {
      const card = el('button', 'card', {
        type: 'button',
        'data-building': b.id,
        'aria-label': `${b.name} (${b.code}), ${b.size}×${b.size}`,
      });
      const swatch = el('span', 'card-swatch', { 'aria-hidden': 'true' });
      swatch.style.setProperty('--c', b.color);
      const text = el('span', 'card-text', { 'aria-hidden': 'true' });
      const code = el('span', 'card-code');
      code.textContent = b.code;
      const name = el('span', 'card-name');
      name.textContent = b.name;
      text.append(code, name);
      card.style.setProperty('--c', b.color);
      card.append(swatch, text);
      card.addEventListener('click', () => selectBuilding(b.id));
      cards.set(b.id, card);
      list.append(card);
    }
    group.append(heading, list);
    picker.append(group);
  }

  // Mouse wheels scroll the picker sideways (touch and trackpads already do).
  picker.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    picker.scrollLeft += e.deltaY;
  }, { passive: false });

  // Keep long-presses on the toolbar from opening menus.
  toolbar.addEventListener('contextmenu', (e) => e.preventDefault());

  toolbar.append(row, picker);
  root.append(toolbar);

  // Scroll a card fully into view inside the picker (never the page).
  function reveal(card) {
    const p = picker.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const pad = 8;
    if (c.left < p.left) picker.scrollBy({ left: c.left - p.left - pad, behavior: 'smooth' });
    else if (c.right > p.right) picker.scrollBy({ left: c.right - p.right + pad, behavior: 'smooth' });
  }

  let turns = 0; // visual turns, so 3 → 0 keeps spinning clockwise
  function render(s, prev) {
    for (const [tool, btn] of toolButtons) btn.setAttribute('aria-pressed', String(s.tool === tool));
    for (const [id, card] of cards) card.setAttribute('aria-pressed', String(s.tool === 'build' && s.buildingId === id));

    turns += (s.rotation - (turns % 4) + 4) % 4;
    rotateIcon.style.transform = `rotate(${turns * 90}deg)`;
    rotateBtn.setAttribute('aria-label', `Rotate, facing ${FACING[s.rotation]}`);

    if (s.tool === 'build' && (!prev || prev.buildingId !== s.buildingId || prev.tool !== 'build')) {
      const card = cards.get(s.buildingId);
      if (card) reveal(card);
    }
  }
  render(getState(), null);
  const unsubscribe = subscribe(render);

  return {
    toolbar,
    actions,
    destroy() { unsubscribe(); toolbar.remove(); },
  };
}
