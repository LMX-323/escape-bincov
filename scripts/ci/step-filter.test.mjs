import assert from 'node:assert/strict';
import test from 'node:test';
import { stepFilter } from '../step-filter.mjs';

const steps = ['A1 普通入口', 'A2 旧档', 'B1 键盘走动', 'G3 商店'];
const run = argv => { const f = stepFilter(['node', 'suite.mjs', ...argv]); const ran = steps.filter(s => f.selects(s)); return { ran, problems: f.problems(ran.length) }; };

test('without --only every step runs and nothing fails', () => {
  assert.deepEqual(run([]), { ran: steps, problems: [] });
  assert.deepEqual(run(['--out=x']).problems, []);
});

test('known prefixes select their steps and pass', () => {
  assert.deepEqual(run(['--only=A2']), { ran: ['A2 旧档'], problems: [] });
  assert.deepEqual(run(['--only=A,G3']), { ran: ['A1 普通入口', 'A2 旧档', 'G3 商店'], problems: [] });
  assert.deepEqual(run(['--only=A1', '--only= B1']).ran, ['A1 普通入口', 'B1 键盘走动']);
});

test('an unknown prefix fails and is named, even next to a known one', () => {
  assert.deepEqual(run(['--only=Z9']).problems, ['--only prefix "Z9" matched no step', '--only selected no step: 0 steps ran']);
  const mixed = run(['--only=A2,A9']);
  assert.deepEqual(mixed.ran, ['A2 旧档']);
  assert.deepEqual(mixed.problems, ['--only prefix "A9" matched no step']);
});

test('an empty selection fails', () => {
  assert.deepEqual(run(['--only=']), { ran: [], problems: ['--only= names no step prefix', '--only selected no step: 0 steps ran'] });
  assert.deepEqual(run(['--only=,']).problems, ['--only= names no step prefix', '--only selected no step: 0 steps ran']);
  const f = stepFilter(['node', 'suite.mjs', '--only=A1']);
  assert.ok(f.selects('A1 普通入口'));
  assert.deepEqual(f.problems(0), ['--only selected no step: 0 steps ran'], 'a selected step that never ran still fails');
  assert.throws(() => stepFilter(['node', 'suite.mjs', '--only', 'A1']), /--only=A1,G3/);
});
