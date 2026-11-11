// server/__tests__/spotPuzzle.test.js
const { generatePuzzle, OBJECT_TYPES, OBJECT_BOX } = require('../spotPuzzle');

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const cellOf = (id) => ({ col: id % 8, row: Math.floor(id / 8) });

it('returns the same puzzle for the same seed', () => {
  expect(generatePuzzle(12345)).toEqual(generatePuzzle(12345));
});
it('returns different puzzles for different seeds', () => {
  expect(generatePuzzle(1)).not.toEqual(generatePuzzle(2));
});
it('uses every theme across the seed list', () => {
  expect(new Set(SEEDS.map((s) => generatePuzzle(s).theme))).toEqual(new Set(['shelf', 'garden', 'picnic']));
});

describe.each(SEEDS)('seed %i', (seed) => {
  const { theme, sceneA, sceneB, differences } = generatePuzzle(seed);
  const byId = (scene) => new Map(scene.map((o) => [o.id, o]));

  it('fills 32 to 38 cells with objects of its theme, each inside its cell', () => {
    expect(sceneA.length).toBeGreaterThanOrEqual(32);
    expect(sceneA.length).toBeLessThanOrEqual(38);
    expect(new Set(sceneA.map((o) => o.id)).size).toBe(sceneA.length);
    for (const scene of [sceneA, sceneB]) {
      for (const o of scene) {
        expect(OBJECT_TYPES[o.type].theme).toBe(theme);
        const { col, row } = cellOf(o.id);
        const half = (OBJECT_BOX * o.size) / 2;
        expect(o.x - half).toBeGreaterThanOrEqual(col * 50);
        expect(o.x + half).toBeLessThanOrEqual(col * 50 + 50);
        expect(o.y - half).toBeGreaterThanOrEqual(row * 60);
        expect(o.y + half).toBeLessThanOrEqual(row * 60 + 60);
      }
    }
  });

  it('changes exactly the 7 listed objects and nothing else', () => {
    expect(differences.map((d) => d.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const changed = new Set(differences.map((d) => d.id));
    expect(changed.size).toBe(7);
    const b = byId(sceneB);
    expect(sceneB.map((o) => o.id)).toEqual(sceneA.map((o) => o.id));
    for (const a of sceneA) {
      if (changed.has(a.id)) expect(b.get(a.id)).not.toEqual(a);
      else expect(b.get(a.id)).toEqual(a);
    }
  });

  it('applies one supported change of the stated amount to each', () => {
    const a = byId(sceneA); const b = byId(sceneB);
    for (const d of differences) {
      const before = a.get(d.id); const after = b.get(d.id);
      expect(OBJECT_TYPES[before.type].changes).toContain(d.kind);
      const same = (keys) => keys.forEach((k) => expect(after[k]).toEqual(before[k]));
      const others = ['x', 'y', 'size', 'rotation', 'colors', 'count', 'detail', 'type'];
      if (d.kind === 'color') {
        same(others.filter((k) => k !== 'colors'));
        const diffs = [0, 1].filter((i) => after.colors[i].shade !== before.colors[i].shade);
        expect(diffs).toHaveLength(1);
        const i = diffs[0];
        expect(after.colors[i].family).toBe(before.colors[i].family);
        expect(Math.abs(after.colors[i].shade - before.colors[i].shade)).toBe(1);
      } else if (d.kind === 'move') {
        same(others.filter((k) => k !== 'x' && k !== 'y'));
        const dx = Math.abs(after.x - before.x); const dy = Math.abs(after.y - before.y);
        expect(Math.min(dx, dy)).toBe(0);
        expect([7, 8, 9]).toContain(Math.max(dx, dy));
      } else if (d.kind === 'turn') {
        same(others.filter((k) => k !== 'rotation'));
        const delta = Math.abs(after.rotation - before.rotation);
        expect(delta).toBeGreaterThanOrEqual(18);
        expect(delta).toBeLessThanOrEqual(25);
      } else if (d.kind === 'size') {
        same(others.filter((k) => k !== 'size'));
        expect([0.8, 1.2]).toContainEqual(Number((after.size / before.size).toFixed(4)));
      } else if (d.kind === 'detail') {
        same(others.filter((k) => k !== 'detail'));
        expect([before.detail, after.detail]).toEqual([true, false]);
      } else {
        same(others.filter((k) => k !== 'count'));
        expect(Math.abs(after.count - before.count)).toBe(1);
        expect(after.count).toBeGreaterThanOrEqual(3);
        expect(after.count).toBeLessThanOrEqual(6);
      }
    }
  });

  it('uses no kind of change more than twice', () => {
    const uses = {};
    for (const d of differences) uses[d.kind] = (uses[d.kind] || 0) + 1;
    expect(Math.max(...Object.values(uses))).toBeLessThanOrEqual(2);
  });

  it('keeps differences out of neighbouring cells and their circles apart', () => {
    for (let i = 0; i < 7; i += 1) {
      for (let j = i + 1; j < 7; j += 1) {
        const p = cellOf(differences[i].id); const q = cellOf(differences[j].id);
        expect(Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row))).toBeGreaterThan(1);
        const dist = Math.hypot(differences[i].x - differences[j].x, differences[i].y - differences[j].y);
        expect(dist).toBeGreaterThan(52);
      }
    }
  });

  it('centres each hit circle on the object as drawn in A, inside the scene', () => {
    const a = byId(sceneA);
    for (const d of differences) {
      expect(d.r).toBe(26);
      expect([d.x, d.y]).toEqual([a.get(d.id).x, a.get(d.id).y]);
      expect(d.x).toBeGreaterThan(0); expect(d.x).toBeLessThan(400);
      expect(d.y).toBeGreaterThan(0); expect(d.y).toBeLessThan(300);
    }
  });
});

it('gives every type the three universal changes and a consistent table', () => {
  expect(Object.keys(OBJECT_TYPES)).toHaveLength(24);
  for (const t of Object.values(OBJECT_TYPES)) {
    expect(t.changes).toEqual(expect.arrayContaining(['color', 'move', 'size']));
    expect(t.changes.includes('count')).toBe(t.hasCount);
    expect(t.changes.includes('detail')).toBe(t.hasDetail);
  }
});
