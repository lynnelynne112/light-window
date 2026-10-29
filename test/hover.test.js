'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HoverController, preferences } = require('../src/core');
test('leaving hides the whole window; reentry reverses a running fade without flashing', () => {
  let visible = true, opacity;
  const controller = new HoverController({ visible: () => visible, regions: () => [{ x: 0, y: 0, width: 100, height: 100 }], alpha: a => opacity = a, show: () => visible = true, hide: () => visible = false }, preferences());
  controller.tick({ x: 150, y: 150 }, 0); controller.tick({ x: 150, y: 150 }, 101); controller.tick({ x: 150, y: 150 }, 180);
  const before = opacity; assert(before > 0 && before < .25);
  controller.tick({ x: 20, y: 20 }, 181); assert.equal(opacity, before);
  controller.tick({ x: 20, y: 20 }, 500); assert.equal(opacity, .25);
  controller.tick({ x: 150, y: 150 }, 600); controller.tick({ x: 150, y: 150 }, 701); controller.tick({ x: 150, y: 150 }, 1000);
  assert.equal(visible, false); assert.equal(opacity, 0);
});
