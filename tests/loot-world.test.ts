import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { addItem, createInventory, ITEMS, weight } from '../src/domain';
import { WORLD, TILE, findPath, generateRun, generateRunBase, isWalkable, partitionRunLoot, type GroundLoot, type Point } from '../src/world';

const point = (x: number, y: number): Point => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
const region = (p: Point) => WORLD.zones.findIndex(z => p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h);
const tide = (p: Point) => WORLD.tiles[Math.floor(p.y / TILE)][Math.floor(p.x / TILE)] === 4;
function totals(items: { id: string; qty: number }[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const item of items) total[item.id] = (total[item.id] ?? 0) + item.qty;
  return total;
}

test('the original 100-seed run generation keeps its pre-container baseline fingerprint', () => {
  // Captured from committed 702692a src/world.ts, before any loot grouping.
  const runs = Array.from({ length: 100 }, (_, seed) => generateRunBase(seed));
  const fingerprint = createHash('sha256').update(JSON.stringify(runs)).digest('hex');
  assert.equal(fingerprint, '94413a9271855f9fbb8196774d43f358f7487198d55b1276f80cd968d7badbd3');
});

test('100 seeds conserve all loot while crates stay nearby, dry and clear of interactions', () => {
  for (let seed = 0; seed < 100; seed++) {
    const base = generateRunBase(seed), untouched = structuredClone(base), run = generateRun(seed);
    const originalSettings = { ...base, loot: undefined };
    const groupedSettings = { ...run, loot: undefined, containers: undefined };
    delete (groupedSettings as Partial<typeof groupedSettings>).containers;
    assert.deepEqual(groupedSettings, originalSettings);
    assert.deepEqual(run, generateRun(seed));
    assert.ok(run.containers.length > 0 && run.containers.length <= 10, `crate count, seed ${seed}`);
    assert.ok(run.loot.length >= 40);
    assert.equal(run.loot.length + run.containers.length * 2, 60);
    const combined = [...run.loot, ...run.containers.flatMap(crate => crate.items)];
    assert.deepEqual(totals(combined), totals(base.loot), `conservation, seed ${seed}`);
    for (const field of ['weight', 'sell'] as const) {
      const sum = (items: { id: string; qty: number }[]) => items.reduce((total, item) => total + ITEMS[item.id][field] * item.qty, 0);
      assert.ok(Math.abs(sum(combined) - sum(base.loot)) < 1e-8, `${field}, seed ${seed}`);
    }
    assert.deepEqual(run.loot.filter(p => p.id === 'sample' || p.id === 'ledger'), base.loot.filter(p => p.id === 'sample' || p.id === 'ledger'));
    assert.deepEqual(run.loot.filter(tide), base.loot.filter(tide), `flood supplies, seed ${seed}`);

    // Tag ordinary entries without changing positions to independently inspect each source pair.
    const tagged = base.loot.map((p, i) => ({ ...p, id: p.id === 'sample' || p.id === 'ledger' ? p.id : `source-${i}` }));
    const groups = partitionRunLoot(tagged).containers;
    assert.equal(groups.length, run.containers.length);
    for (const [i, crate] of run.containers.entries()) {
      const sources = groups[i].items.map(item => base.loot[Number(item.id.slice('source-'.length))]);
      const [anchor, partner] = sources;
      assert.equal(crate.x, anchor.x);
      assert.equal(crate.y, anchor.y);
      assert.ok(region(anchor) >= 0);
      assert.equal(region(anchor), region(partner));
      assert.deepEqual(crate.items, sources.map(({ id, qty }) => ({ id, qty })));
      assert.ok(isWalkable(crate.x, crate.y, false) && isWalkable(crate.x, crate.y, true));
      const route = findPath(anchor, partner, true);
      assert.ok(route.length > 0 && route.length <= 7, `six-step permanent route, seed ${seed}`);
      for (const source of sources) {
        assert.ok(!tide(source));
        assert.ok(WORLD.exits.every(exit => Math.hypot(exit.x - source.x, exit.y - source.y) >= 48));
        assert.ok(WORLD.notes.every(note => Math.hypot(note.x - source.x, note.y - source.y) >= 43));
      }
      for (const high of [false, true]) assert.ok(findPath(run.spawn, crate, high).length, `reachable crate, seed ${seed}`);
      const inventory = createInventory(6, 5);
      for (const item of crate.items) assert.equal(addItem(inventory, item.id, item.qty), 0);
      assert.ok(weight(inventory) >= 0);
    }
    assert.deepEqual(base, untouched, 'partitioning does not mutate its input');
  }
});

test('partition picks shortest routes, breaks ties by coordinates and respects walls and named regions', () => {
  const entries: GroundLoot[] = [
    { ...point(19, 13), id: 'bandage', qty: 1 },
    { ...point(22, 13), id: 'food', qty: 2 },
    { ...point(20, 13), id: 'water', qty: 1 },
    { ...point(18, 13), id: 'scrap', qty: 2 },
  ];
  const snapshot = structuredClone(entries), grouped = partitionRunLoot(entries);
  assert.deepEqual(grouped.containers[0].items, [{ id: 'bandage', qty: 1 }, { id: 'scrap', qty: 2 }]);
  assert.deepEqual(entries, snapshot);

  const separatedByWall = [{ ...point(9, 8), id: 'scrap', qty: 1 }, { ...point(11, 8), id: 'wire', qty: 1 }];
  assert.ok(findPath(separatedByWall[0], separatedByWall[1], true).length > 7);
  assert.deepEqual(partitionRunLoot(separatedByWall), { loot: separatedByWall, containers: [] });
  const outsideDistricts = [{ ...point(3, 12), id: 'scrap', qty: 1 }, { ...point(3, 13), id: 'wire', qty: 1 }];
  assert.equal(partitionRunLoot(outsideDistricts).containers.length, 0);
  const nearNote = [{ ...point(20, 33), id: 'scrap', qty: 1 }, { ...point(19, 33), id: 'wire', qty: 1 }];
  assert.equal(partitionRunLoot(nearNote).containers.length, 0);
});
