import test from 'node:test';
import assert from 'node:assert/strict';
import { createHilbert, clampReveal } from '../src/hilbert.js';

for (let order = 1; order <= 6; order++) {
  test(`order ${order}: complete grid, unique vertices, continuous unit steps`, () => {
    const positions = createHilbert(order);
    const side = 2 ** order;
    const total = 8 ** order;
    assert.equal(positions.length, total * 3);
    const visited = new Set();
    let previous;
    for (let i = 0; i < total; i++) {
      const cell = Array.from(positions.subarray(i * 3, i * 3 + 3), value => {
        const coordinate = (value + 1) * (side - 1) / 2;
        assert.ok(Math.abs(coordinate - Math.round(coordinate)) < 0.0001);
        assert.ok(coordinate >= -0.0001 && coordinate <= side - 1 + 0.0001);
        return Math.round(coordinate);
      });
      visited.add(cell.join(','));
      if (previous) assert.equal(cell.reduce((sum, coordinate, axis) => sum + Math.abs(coordinate - previous[axis]), 0), 1);
      previous = cell;
    }
    assert.equal(visited.size, total);
  });
}
test('invalid orders and reveal boundaries', () => {
  for (const order of [0, 7, 1.5, NaN, '3']) assert.throws(() => createHilbert(order), RangeError);
  assert.equal(clampReveal(-1, 512), 0);
  assert.equal(clampReveal(0, 512), 0);
  assert.equal(clampReveal(1, 512), 1);
  assert.equal(clampReveal(15.9, 512), 15);
  assert.equal(clampReveal(900, 512), 512);
  assert.equal(clampReveal(NaN, 512), 0);
});
