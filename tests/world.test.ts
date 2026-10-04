import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, COLS, ROWS, TILE, createWorld, findPath, findDryRefuge, generateRun, isWalkable, lineOfSight } from '../src/world';

test('hand-authored map dimensions and five named districts are stable', () => {
  assert.equal(WORLD.tiles.length, ROWS);
  assert.ok(WORLD.tiles.every(row => row.length === COLS));
  assert.equal(WORLD.zones.length, 5);
  assert.deepEqual(createWorld(), WORLD);
  assert.equal(WORLD.exits.length, 3);
});

// Independent flood fill checks every walkable tile, not only the spawn routes.
function reachable(high: boolean, start = WORLD.exits[0]): Set<number> {
  const sx = Math.floor(start.x / TILE), sy = Math.floor(start.y / TILE);
  const visited = new Set<number>([sy * COLS + sx]);
  const queue = [[sx, sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, key = ny * COLS + nx;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || visited.has(key)) continue;
      const tile = WORLD.tiles[ny][nx];
      if (tile === 2 || tile === 3 || (high && tile === 4)) continue;
      visited.add(key); queue.push([nx, ny]);
    }
  }
  return visited;
}

test('every permanent walkable tile and every exit are connected at both tides', () => {
  for (const high of [false, true]) for (const exit of WORLD.exits) {
    const connected = reachable(high, exit);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const tile = WORLD.tiles[y][x];
      if ([0, 1, 5, 6].includes(tile) || (!high && tile === 4)) assert.ok(connected.has(y * COLS + x), `stranded tile ${x},${y}; high=${high}; exit=${exit.id}`);
    }
  }
});

test('100 seeds: both chosen exits remain reachable before and after tide change', () => {
  const seenSpawns = new Set<string>();
  const exitPairs = new Set<string>();
  const tides = new Set<boolean>();
  for (let seed = 0; seed < 100; seed++) {
    const run = generateRun(seed);
    assert.equal(run.enemies.length, 25);
    assert.equal(run.loot.length, 60);
    assert.equal(run.exits.length, 2);
    assert.ok(run.enemies.every(p => isWalkable(p.x, p.y, true)));
    assert.ok(run.enemies.every(p => Math.hypot(p.x - run.spawn.x, p.y - run.spawn.y) > 240));
    assert.ok(run.loot.every(p => isWalkable(p.x, p.y, false)));
    assert.ok(run.loot.some(p => p.id === 'sample'));
    assert.ok(run.loot.some(p => p.id === 'ledger'));
    for (const high of [false, true]) for (const exit of run.exits) {
      const path = findPath(run.spawn, exit, high);
      assert.ok(path.length > 0, `seed=${seed}; high=${high}; exit=${exit.id}`);
      assert.deepEqual(path[0], run.spawn);
      assert.deepEqual(path.at(-1), { x: exit.x, y: exit.y });
      assert.ok(path.every(p => isWalkable(p.x, p.y, high)));
    }
    seenSpawns.add(`${run.spawn.x},${run.spawn.y}`);
    exitPairs.add(run.exits.map(e => e.id).sort().join(','));
    tides.add(run.initialHigh);
  }
  assert.equal(seenSpawns.size, 3);
  assert.equal(exitPairs.size, 3);
  assert.equal(tides.size, 2);
});

test('every flood tile can reach nearby permanent land at low tide', () => {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (WORLD.tiles[y][x] !== 4) continue;
    let refuge = false;
    for (let dy = -4; dy <= 4 && !refuge; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (WORLD.tiles[y + dy]?.[x + dx] === undefined) continue;
      const from = { x: x * TILE + 16, y: y * TILE + 16 };
      const to = { x: (x + dx) * TILE + 16, y: (y + dy) * TILE + 16 };
      if (isWalkable(to.x, to.y, true) && findPath(from, to, false).length) { refuge = true; break; }
    }
    assert.ok(refuge, `no nearby refuge for flood tile ${x},${y}`);
    const from = { x: x * TILE + 16, y: y * TILE + 16 };
    const dry = findDryRefuge(from);
    assert.ok(dry, `no transition refuge for flood tile ${x},${y}`);
    assert.ok(isWalkable(dry.x, dry.y, true));
    const path = findPath(from, dry, false);
    assert.ok(path.length > 0 && path.length <= 10);
    for (let step = 1; step < path.length; step++) assert.ok(lineOfSight(path[step - 1], path[step], false, 10));
  }
  const halfOut = { x: 63 * TILE - 1, y: 10 * TILE + 16 };
  assert.equal(isWalkable(halfOut.x, halfOut.y, true), false);
  const refuge = findDryRefuge(halfOut);
  assert.ok(refuge && isWalkable(refuge.x, refuge.y, true), 'half-overlapping flood border has a dry refuge');
  assert.equal(findDryRefuge({ x: -1, y: -1 }), null);
});

test('seeds reproduce all run choices and different seeds vary them', () => {
  assert.deepEqual(generateRun('滨科夫'), generateRun('滨科夫'));
  assert.deepEqual(generateRun(42), generateRun(42));
  assert.deepEqual(generateRun('42'), generateRun(42));
  assert.deepEqual(generateRun(' 42 '), generateRun(42));
  assert.notDeepEqual(generateRun(42), generateRun(43));
});

test('collision, boundaries, tide gates and line of sight respect walls', () => {
  assert.equal(isWalkable(-10, 100), false);
  assert.equal(isWalkable(NaN, 100), false);
  assert.equal(isWalkable(200, 200, false, NaN), false);
  assert.equal(isWalkable(10 * TILE + 16, 7 * TILE + 16), false);
  assert.equal(isWalkable(39 * TILE + 16, 36 * TILE + 16, false), true);
  assert.equal(isWalkable(39 * TILE + 16, 36 * TILE + 16, true), false);
  assert.equal(lineOfSight({ x: 6 * TILE + 16, y: 5 * TILE + 16 }, { x: 6 * TILE + 16, y: 20 * TILE + 16 }), true);
  assert.equal(lineOfSight({ x: 9 * TILE + 16, y: 8 * TILE + 16 }, { x: 18 * TILE + 16, y: 8 * TILE + 16 }), false);
  assert.equal(lineOfSight({ x: NaN, y: 100 }, { x: 200, y: 200 }), false);
  const wallEdgeStart = { x: 10 * TILE - 16, y: 7 * TILE + 11 };
  const wallEdgeEnd = { x: 10 * TILE + 11, y: 7 * TILE - 16 };
  assert.ok(isWalkable(wallEdgeStart.x, wallEdgeStart.y) && isWalkable(wallEdgeEnd.x, wallEdgeEnd.y));
  assert.equal(lineOfSight(wallEdgeStart, wallEdgeEnd), true);
  assert.equal(lineOfSight(wallEdgeStart, wallEdgeEnd, false, 10), false, 'visual clearance is narrower than actor clearance');
  assert.deepEqual(findPath({ x: -100, y: -100 }, WORLD.exits[0]), []);
});
