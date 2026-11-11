// Builds a spot-the-difference puzzle from a seed. The same seed always
// gives the same puzzle, so both players get an identical one.

const SCENE_WIDTH = 400;
const SCENE_HEIGHT = 300;
const COLS = 8;
const ROWS = 5;
const CELL_WIDTH = 50;
const CELL_HEIGHT = 60;
// Side of the square an object is drawn in, at size 1.
const OBJECT_BOX = 28;
const HIT_RADIUS = 26;
const DIFFERENCE_COUNT = 7;
const MAX_USES_PER_KIND = 2;

// Three shades per family, light to deep. The client keeps a copy of these
// values in client/src/components/spotObjects.jsx; change both together.
const PALETTE = {
  pink: ['#f9c6d8', '#f08fb4', '#d6457f'],
  coral: ['#fbd0bd', '#f59e7a', '#dd6b42'],
  yellow: ['#fbeab0', '#f3cc54', '#d99a1c'],
  green: ['#cfe8d5', '#86c79a', '#3f8f5f'],
  blue: ['#c9e2f5', '#82b8e4', '#3b7fbf'],
  purple: ['#dfd0f2', '#b294e0', '#7c57bd'],
};
const FAMILIES = Object.keys(PALETTE);
const THEMES = ['shelf', 'garden', 'picnic'];

// smallSecondColor: the second colour is only drawn on tiny parts (dots,
// buttons, veins), where a one-shade change cannot really be seen, so only
// the first colour may change.
function defineType(
  theme,
  { turn = false, count = false, detail = false, smallSecondColor = false } = {}
) {
  const changes = ['color', 'move', 'size'];
  if (turn) changes.push('turn');
  if (count) changes.push('count');
  if (detail) changes.push('detail');
  return {
    theme,
    changes,
    hasCount: count,
    hasDetail: detail,
    colorSlots: smallSecondColor ? [0] : [0, 1],
  };
}

// Which changes can actually be seen on each kind of object. A ball, for
// example, looks the same however it is turned.
const OBJECT_TYPES = {
  ball: defineType('shelf', { count: true }),
  block: defineType('shelf', { turn: true }),
  teddy: defineType('shelf', { detail: true }),
  robot: defineType('shelf', { count: true, detail: true, smallSecondColor: true }),
  book: defineType('shelf', { turn: true, count: true }),
  car: defineType('shelf', { detail: true }),
  rocket: defineType('shelf', { turn: true, count: true }),
  drum: defineType('shelf', { count: true }),

  flower: defineType('garden', { count: true, detail: true }),
  tulip: defineType('garden', { turn: true }),
  mushroom: defineType('garden', { count: true, smallSecondColor: true }),
  butterfly: defineType('garden', { turn: true, detail: true }),
  snail: defineType('garden', { detail: true }),
  ladybird: defineType('garden', { turn: true, count: true, smallSecondColor: true }),
  leaf: defineType('garden', { turn: true, smallSecondColor: true }),
  carrot: defineType('garden', { turn: true, count: true }),

  cup: defineType('picnic', { detail: true }),
  teapot: defineType('picnic', { detail: true }),
  cupcake: defineType('picnic', { count: true, detail: true }),
  apple: defineType('picnic', { turn: true, detail: true, smallSecondColor: true }),
  sandwich: defineType('picnic', { turn: true }),
  cheese: defineType('picnic', { turn: true, count: true }),
  // Round, so turning it only shifts the chips by a hair.
  cookie: defineType('picnic', { count: true, smallSecondColor: true }),
  bottle: defineType('picnic', { turn: true, detail: true }),
};

// Small seeded random number generator (mulberry32).
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createHelpers(random) {
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const pick = (list) => list[int(0, list.length - 1)];
  const shuffle = (list) => {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  return { int, pick, shuffle };
}

function cellOf(id) {
  return { col: id % COLS, row: Math.floor(id / COLS) };
}

function areNeighbours(idA, idB) {
  const a = cellOf(idA);
  const b = cellOf(idB);
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) <= 1;
}

function fitsInCell(object) {
  const { col, row } = cellOf(object.id);
  const half = (OBJECT_BOX * object.size) / 2;
  return (
    object.x - half >= col * CELL_WIDTH &&
    object.x + half <= (col + 1) * CELL_WIDTH &&
    object.y - half >= row * CELL_HEIGHT &&
    object.y + half <= (row + 1) * CELL_HEIGHT
  );
}

function buildScene(theme, { int, pick, shuffle }) {
  const types = Object.keys(OBJECT_TYPES).filter((type) => OBJECT_TYPES[type].theme === theme);
  const cellCount = int(32, 38);
  const cells = shuffle(Array.from({ length: COLS * ROWS }, (_, id) => id))
    .slice(0, cellCount)
    .sort((a, b) => a - b);

  return cells.map((id) => {
    const { col, row } = cellOf(id);
    const type = pick(types);
    const spec = OBJECT_TYPES[type];
    const [familyA, familyB] = shuffle(FAMILIES);
    return {
      id,
      type,
      x: col * CELL_WIDTH + CELL_WIDTH / 2 + int(-2, 2),
      y: row * CELL_HEIGHT + CELL_HEIGHT / 2 + int(-7, 7),
      size: pick([0.85, 0.9, 0.95, 1]),
      rotation: spec.changes.includes('turn') ? int(-8, 8) : 0,
      colors: [
        { family: familyA, shade: int(0, 2) },
        { family: familyB, shade: int(0, 2) },
      ],
      count: spec.hasCount ? int(3, 5) : null,
      detail: spec.hasDetail ? true : null,
    };
  });
}

// Returns the changed copy of an object, or null if this kind of change
// cannot be applied to it.
function applyChange(object, kind, { int, pick, shuffle }) {
  const changed = { ...object, colors: object.colors.map((c) => ({ ...c })) };

  if (kind === 'color') {
    const slot = changed.colors[pick(OBJECT_TYPES[object.type].colorSlots)];
    slot.shade = slot.shade === 1 ? pick([0, 2]) : 1;
    return changed;
  }
  if (kind === 'move') {
    const distance = int(7, 9);
    const directions = shuffle([
      [distance, 0],
      [-distance, 0],
      [0, distance],
      [0, -distance],
    ]);
    for (const [dx, dy] of directions) {
      const moved = { ...changed, x: object.x + dx, y: object.y + dy };
      if (fitsInCell(moved)) return moved;
    }
    return null;
  }
  if (kind === 'turn') {
    changed.rotation = object.rotation + pick([-1, 1]) * int(18, 25);
    return changed;
  }
  if (kind === 'size') {
    changed.size = Number((object.size * pick([0.8, 1.2])).toFixed(3));
    return fitsInCell(changed) ? changed : null;
  }
  if (kind === 'detail') {
    if (object.detail !== true) return null;
    changed.detail = false;
    return changed;
  }
  // count
  const options = [object.count - 1, object.count + 1].filter((n) => n >= 3 && n <= 6);
  changed.count = pick(options);
  return changed;
}

function tryBuildPuzzle(random) {
  const helpers = createHelpers(random);
  const theme = helpers.pick(THEMES);
  const sceneA = buildScene(theme, helpers);
  const changedById = new Map();
  const differences = [];
  const uses = {};

  for (const object of helpers.shuffle(sceneA)) {
    if (differences.length === DIFFERENCE_COUNT) break;
    if (differences.some((d) => areNeighbours(d.id, object.id))) continue;

    const kinds = helpers
      .shuffle(OBJECT_TYPES[object.type].changes)
      .filter((kind) => (uses[kind] || 0) < MAX_USES_PER_KIND);
    for (const kind of kinds) {
      const changed = applyChange(object, kind, helpers);
      if (!changed) continue;
      changedById.set(object.id, changed);
      uses[kind] = (uses[kind] || 0) + 1;
      differences.push({ id: object.id, kind, x: object.x, y: object.y, r: HIT_RADIUS });
      break;
    }
  }

  if (differences.length < DIFFERENCE_COUNT) return null;
  return {
    theme,
    sceneA,
    sceneB: sceneA.map((object) => changedById.get(object.id) || object),
    differences: differences.map((d, index) => ({ index, ...d })),
  };
}

function generatePuzzle(seed) {
  const random = createRandom(seed);
  // A layout can occasionally leave fewer than 7 usable objects; drawing
  // again from the same generator keeps the result tied to the seed.
  for (;;) {
    const puzzle = tryBuildPuzzle(random);
    if (puzzle) return puzzle;
  }
}

module.exports = {
  generatePuzzle,
  OBJECT_TYPES,
  PALETTE,
  SCENE_WIDTH,
  SCENE_HEIGHT,
  COLS,
  ROWS,
  CELL_WIDTH,
  CELL_HEIGHT,
  OBJECT_BOX,
  HIT_RADIUS,
  DIFFERENCE_COUNT,
};
