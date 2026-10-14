// Issue #26 F12 part B / F04: run the same relief scenarios through two copies of src/domain.ts.
// Usage (from the repo root):
//   git show e9cbaa5:src/domain.ts > test-results/relief-old/domain-e9cbaa5.ts
//   node --import tsx docs/issue26-20261014/relief/relief-outcomes.mts test-results/relief-old/domain-e9cbaa5.ts src/domain.ts
// Writes relief-outcomes.json and relief-outcomes.md next to this file.
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

type D = typeof import('../../../src/domain');
type Save = ReturnType<D['newSave']>;
const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) throw new Error('usage: relief-outcomes.mts <old domain.ts> <new domain.ts>');
const load = async (path: string): Promise<D> => import(pathToFileURL(resolve(path)).href);
const before = await load(oldPath), after = await load(newPath);

function broke(d: D, cash: number): Save {
  const save = d.newSave();
  save.cash = cash;
  save.equipment = { weapon: null, relief: false, ammo: 0, ammoRelief: 0 };
  save.bag = d.createInventory(6, 5); save.stash = d.createInventory(10, 6); save.safe = d.createInventory(2, 2);
  return save;
}
function armed(d: D, cash: number, relief: boolean): Save {
  const save = broke(d, cash);
  save.equipment = { weapon: 'pistol', relief, ammo: 0, ammoRelief: 0 };
  return save;
}
/** Relief-marked rounds/bandages in the bag and stash, i.e. what a claim actually delivered. */
const reliefCount = (s: Save, id: string) => [s.bag, s.stash, s.safe].reduce((n, inv) => n + inv.items.filter(i => i.id === id && i.relief).reduce((m, i) => m + i.qty, 0), 0);
const relief = (d: D) => (s: Save) => d.grantRelief(s);
interface Scenario { id: string; state: string; setup: (d: D) => Save; act?: (d: D) => (s: Save) => void }
const scenarios: Scenario[] = [
  { id: 'S1', state: 'no gun, cash ¥199, nothing to sell (old rule)', setup: d => broke(d, 199) },
  { id: 'S1', state: 'no gun, cash ¥200, nothing to sell (old pinned boundary)', setup: d => broke(d, 200) },
  { id: 'S1', state: 'no gun, cash ¥250, nothing to sell', setup: d => broke(d, 250) },
  { id: 'S1', state: 'no gun, cash ¥319, nothing to sell', setup: d => broke(d, 319) },
  { id: 'S1', state: 'no gun, cash ¥320, nothing to sell (new boundary)', setup: d => broke(d, 320) },
  { id: 'S1', state: 'no gun, cash ¥250 + pocket watch (sells for ¥240)', setup: d => { const s = broke(d, 250); d.addItem(s.stash, 'watch'); return s; } },
  { id: 'S1', state: 'no gun, cash ¥150 + pocket watch (old cash < ¥200 rule)', setup: d => { const s = broke(d, 150); d.addItem(s.stash, 'watch'); return s; } },
  { id: 'S1', state: 'no gun, cash ¥250 + red-tide sample needed by an unfinished quest', setup: d => { const s = broke(d, 250); d.addItem(s.stash, 'sample'); return s; } },
  { id: 'S2', state: 'empty relief pistol equipped, no 9mm anywhere, cash ¥50', setup: d => armed(d, 50, true) },
  { id: 'S2', state: 'empty relief pistol, no 9mm, cash ¥83', setup: d => armed(d, 83, true) },
  { id: 'S2', state: 'empty relief pistol, no 9mm, cash ¥84 (one 12-round pack)', setup: d => armed(d, 84, true) },
  { id: 'S2', state: 'relief pistol with 1 round loaded, cash ¥0', setup: d => { const s = armed(d, 0, true); s.equipment.ammo = 1; s.equipment.ammoRelief = 1; return s; } },
  { id: 'S2', state: 'empty relief pistol + 1 ordinary 9mm round in the stash, cash ¥0', setup: d => { const s = armed(d, 0, true); d.addItem(s.stash, 'ammo9', 1); return s; } },
  { id: 'S2', state: 'empty relief pistol + an ordinary shotgun, no ammo, cash ¥0', setup: d => { const s = armed(d, 0, true); d.addItem(s.stash, 'shotgun'); return s; } },
  { id: 'S2', state: 'extract (settleRun) after emptying the relief pistol, cash ¥50', setup: d => { const s = armed(d, 50, true); s.equipment.ammo = 8; s.equipment.ammoRelief = 8; return s; },
    act: d => s => {
      const run = d.beginRun(s, 905);
      if (d.grantRelief(s)) throw new Error('relief applied inside a raid');
      run.ammo = 0; run.ammoRelief = 0; d.settleRun(s, run, 'extract', 0);
    } },
  { id: 'S2', state: 'empty relief pistol, cash ¥0, bag and stash full; grantRelief called 4 times', setup: d => {
      const s = armed(d, 0, true); d.addItem(s.bag, 'bandage', 120, true); d.addItem(s.stash, 'bandage', 240, true); return s;
    }, act: d => s => { d.grantRelief(s); if ([1, 2, 3].map(() => d.grantRelief(s)).some(Boolean)) throw new Error('repeated call changed the save'); } },
  { id: 'S3', state: 'ordinary pistol, no ammo, cash ¥60 (before selling)', setup: d => armed(d, 60, false) },
  { id: 'S3', state: 'same player sells that pistol (cash ¥60 + ¥150 = ¥210), then relief runs', setup: d => armed(d, 60, false),
    act: d => s => { d.unequip(s); if (!d.sell(s, s.stash.items.find(i => i.id === 'pistol')!.uid)) throw new Error('sale failed'); d.grantRelief(s); } },
  { id: 'raid', state: 'no gun, cash ¥0, during an active raid', setup: d => broke(d, 0), act: d => s => { d.beginRun(s, 906); d.grantRelief(s); } },
];
function outcome(d: D, scenario: Scenario) {
  const save = scenario.setup(d), pre = structuredClone(save);
  (scenario.act ?? relief)(d)(save);
  const issued = save.equipment.relief && save.equipment.weapon && !(pre.equipment.relief && pre.equipment.weapon);
  const ammo9 = reliefCount(save, 'ammo9') - reliefCount(pre, 'ammo9'), bandage = reliefCount(save, 'bandage') - reliefCount(pre, 'bandage');
  const pending = (save.reliefSupplies ?? []).map(p => ({ ...p }));
  const parts = [issued ? 'relief pistol issued' : '', ammo9 ? `${ammo9} relief 9mm delivered` : '', bandage ? `${bandage} relief bandage delivered` : '',
    pending.length ? `pending ${pending.map(p => `${p.qty}× ${p.id}`).join(' + ')}` : ''].filter(Boolean);
  return { cash: save.cash, equipment: save.equipment.weapon ? `${save.equipment.weapon}${save.equipment.relief ? ' (relief)' : ''}` : null,
    reliefPistolIssued: !!issued, reliefAmmo9Delivered: ammo9, reliefBandageDelivered: bandage, pending, summary: parts.join('; ') || 'nothing' };
}
const rows = scenarios.map(sc => ({ scenario: sc.id, state: sc.state, before: outcome(before, sc), after: outcome(after, sc) }));
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(resolve(here, 'relief-outcomes.json'), JSON.stringify({
  item: 'issue #26 F12 part B / F04 relief extension', before: 'src/domain.ts at e9cbaa5', after: 'src/domain.ts on wip/i26-relief',
  generatedBy: 'docs/issue26-20261014/relief/relief-outcomes.mts', rows,
}, null, 2) + '\n');
const md = ['# Relief outcomes before and after (issue #26 F12 part B / F04)', '',
  'Generated by `relief-outcomes.mts`, which runs every case through the real `grantRelief`, `settleRun`, `beginRun`, `unequip` and `sell` of both versions of `src/domain.ts`.',
  '"Before" is e9cbaa5 (main); "after" is this branch. Only relief-marked items that the case added are counted.', '',
  '| Case | State | Before (e9cbaa5) | After (this branch) |', '| --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.scenario} | ${r.state} | ${r.before.summary} | ${r.after.summary} |`), ''];
writeFileSync(resolve(here, 'relief-outcomes.md'), md.join('\n'));
console.log(md.join('\n'));
