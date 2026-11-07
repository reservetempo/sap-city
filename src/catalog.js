// catalog.js: the buildings you can place. Data only.
// Footprint (size × size tiles) grows with tier. Each tier shares a hue family
// so tiers read as groups: gates are blues, adders & latches are ambers,
// units are purples.

export const TIERS = Object.freeze([
  Object.freeze({ tier: 1, label: 'Gates', size: 1 }),
  Object.freeze({ tier: 2, label: 'Adders & latches', size: 2 }),
  Object.freeze({ tier: 3, label: 'Units', size: 3 }),
]);

export const BUILDINGS = Object.freeze([
  // Tier 1: gates, 1×1
  { id: 'and', code: 'AND', name: 'AND gate', tier: 1, size: 1, color: '#2f6fe0' },
  { id: 'or', code: 'OR', name: 'OR gate', tier: 1, size: 1, color: '#2fa8e8' },
  { id: 'not', code: 'NOT', name: 'NOT gate', tier: 1, size: 1, color: '#5a5fd6' },
  { id: 'xor', code: 'XOR', name: 'XOR gate', tier: 1, size: 1, color: '#22c3c9' },
  // Tier 2: adders & latches, 2×2
  { id: 'half-adder', code: 'HA', name: 'Half adder', tier: 2, size: 2, color: '#f5b335' },
  { id: 'full-adder', code: 'FA', name: 'Full adder', tier: 2, size: 2, color: '#ee8a2c' },
  { id: 'flip-flop', code: 'FF', name: 'Flip-flop', tier: 2, size: 2, color: '#f2d04a' },
  { id: 'register', code: 'REG', name: 'Register', tier: 2, size: 2, color: '#e0603a' },
  // Tier 3: units, 3×3
  { id: 'alu', code: 'ALU', name: 'Arithmetic logic unit', tier: 3, size: 3, color: '#8e56e0' },
  { id: 'memory', code: 'MEM', name: 'Memory', tier: 3, size: 3, color: '#c955b8' },
].map((b) => Object.freeze(b)));

const byId = new Map(BUILDINGS.map((b) => [b.id, b]));

/** The building with this id, or undefined. */
export function getBuilding(id) {
  return byId.get(id);
}
