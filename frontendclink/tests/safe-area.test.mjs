import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSafeArea } from './helpers/safe-area.mjs';

test('native safe-area spacing preserves minimums, offsets and floating-bar clearance', () => {
  for (const platform of ['ios', 'android']) {
    const { safeAreaInset } = loadSafeArea(platform);
    assert.equal(safeAreaInset('top', 59, { offset: 24 }), 83);
    assert.equal(safeAreaInset('bottom', 34, { min: 8, base: 112 }), 146);
    assert.equal(safeAreaInset('bottom', 0, { min: 20 }), 20);
    assert.equal(safeAreaInset('left', 44, { min: 16 }), 44);
  }
});

test('web safe-area spacing uses CSS env even when Router returns zero numeric insets', () => {
  const { safeAreaInset } = loadSafeArea('web');
  assert.equal(safeAreaInset('bottom', 0, { min: 8, base: 102 }),
    'calc(102px + max(8px, calc(env(safe-area-inset-bottom, 0px) + 0px)))');
  assert.equal(safeAreaInset('top', 0, { min: 24, offset: 16 }),
    'calc(0px + max(24px, calc(env(safe-area-inset-top, 0px) + 16px)))');
});
