import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { app, saveSession } from '../src/app';
import { RecoveryStore, SESSION_KEY } from '../src/recovery-store';
import { initialCheckpoint } from '../src/checkpoint';
import { generateRun } from '../src/world';
const read = () => new RecoveryStore(localStorage).load().save;
function begin() { saveSession.beginRun(42); return app.loadout!; }
import { finish, retrySettlement, mutate, importSave, setOverlay, toast } from '../src/ui';
import { BACKUP_MAX_BYTES, decodeBackup, encodeBackup } from '../src/save-backup';

let stored: string | null;
let failWrites: boolean;
let writes: number;
const screen = { innerHTML: '', style: {}, querySelectorAll: () => [], querySelector: () => null };
const notification = { textContent: '', style: {} };
const globals = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  stored = null; failWrites = false; writes = 0;
  for (const key of ['document', 'localStorage']) globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { dataset: {} }, documentElement: { dataset: {}, classList: { remove() {}, add() {} } }, dispatchEvent() {}, getElementById: (id: string) => id === 'ui' ? screen : id === 'toast' ? notification : null } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => key === SESSION_KEY ? stored : null,
    setItem: (_key: string, value: string) => { if (failWrites) throw new Error('quota exceeded'); stored = value; writes++; },
  } });
  Object.assign(app, { checkpoint: null, pendingRecoveryImport: null, storageError: '', lastSavedAt: 0, game: null, save: D.newSave(), state: 'hideout', raid: null, loadout: null, tab: 'gear', overlay: '', selected: '', selectedSource: '', pendingSettlement: null, pendingImport: null, result: null, storageOK: true, recovery: false, conflict: false });
  saveSession.initialize(); writes = 0;
});
afterEach(() => {
  clearTimeout((toast as any).timer);
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

for (const outcome of ['extract', 'death', 'timeout'] as const) test(`${outcome}: failed settlement stays pending, retry saves exactly once and survives reload`, () => {
  app.loadout = begin();
  D.addItem(app.loadout.bag, 'sample');
  D.addItem(app.loadout.safe, 'pearl');
  saveSession.persist(app.save, initialCheckpoint(generateRun(42), app.loadout));
  app.state = 'run';
  let locked = false;
  app.raid = { syncMagazine() {}, releaseInput() {}, checkpoint() {}, lock() { locked = true; }, kills: 2 } as any;
  failWrites = true;
  finish(outcome);
  assert.equal(locked, true);
  assert.equal(app.state, 'run');
  assert.equal(app.result, null);
  assert.equal(app.pendingSettlement?.lastResult?.outcome, outcome);
  assert.match(screen.innerHTML, /结算尚未保存/);
  assert.ok(JSON.parse(stored!).profile.activeRun);
  assert.equal(app.save.stats.extracts, 0);
  setOverlay('');
  assert.equal(app.overlay, 'save-error', 'Escape cannot hide an unsaved settlement');
  finish('death');
  assert.equal(app.pendingSettlement?.lastResult?.outcome, outcome, 'The frozen outcome cannot be overwritten');
  const backup = decodeBackup(encodeBackup(app.pendingSettlement!));
  assert.equal(backup.activeRun, null);
  assert.equal(backup.stats.kills, 2);
  assert.equal(D.count(backup.safe, 'pearl'), 1);
  assert.equal(D.count(backup.bag, 'sample'), outcome === 'extract' ? 1 : 0);
  failWrites = false;
  assert.equal(retrySettlement(), true);
  assert.equal(retrySettlement(), false);
  assert.equal(writes, 3, 'Deployment, the updated checkpoint and one successful settlement were written');
  const reopened = read();
  assert.equal(D.recoverInterrupted(reopened), null);
  assert.equal(reopened.stats.runs, 1);
  assert.equal(reopened.stats.kills, 2);
  assert.equal(reopened.stats.extracts, outcome === 'extract' ? 1 : 0);
  assert.equal(app.state, 'result');
  assert.equal(app.pendingSettlement, null);
});

test('merchant purchases and quest submission roll back cash, items and rewards on storage failure', () => {
  D.addItem(app.save.stash, 'sample');
  const original = structuredClone(app.save);
  failWrites = true;
  assert.equal(mutate(() => D.buy(app.save, 'ammo9', 'arms')), false);
  assert.deepEqual(app.save, original);
  assert.equal(mutate(() => D.submitQuest(app.save, 'sample')), false);
  assert.deepEqual(app.save, original);
  failWrites = false;
  assert.equal(mutate(() => D.submitQuest(app.save, 'sample')), true);
  assert.equal(read().quests.sample, true);
  assert.equal(app.save.cash, original.cash + D.QUESTS.sample.reward);
});

test('failed safe transfers and medical use restore both inventories and player vitals', () => {
  D.addItem(app.save.safe, 'medkit');
  app.loadout = begin();
  app.state = 'run';
  app.raid = { releaseInput() {}, checkpoint() {}, hp: 10, stamina: 50, pollution: 20, bleeding: 1, carriedWeight: () => 2 } as any;
  const saveBefore = structuredClone(app.save), loadoutBefore = structuredClone(app.loadout);
  failWrites = true;
  assert.equal(mutate(() => D.transferItem(app.loadout!.safe, app.loadout!.bag, app.loadout!.safe.items[0].uid)), false);
  assert.deepEqual(app.save, saveBefore);
  assert.deepEqual(app.loadout, loadoutBefore);
  assert.equal(mutate(() => { D.removeItem(app.loadout!.safe, 'medkit', 1); app.raid!.hp = 65; app.raid!.bleeding = 0; }), false);
  assert.equal(app.raid!.hp, 10);
  assert.equal(app.raid!.bleeding, 1);
  assert.deepEqual(app.loadout, loadoutBefore);
});

test('another tab cannot be overwritten by a pending retry; backup remains exportable', () => {
  app.loadout = begin(); app.state = 'run'; failWrites = true;
  finish('extract'); app.conflict = true; failWrites = false;
  assert.equal(retrySettlement(), false);
  assert.equal(writes, 1, 'Only the deployment commit succeeded');
  assert.equal(decodeBackup(encodeBackup(app.pendingSettlement!)).stats.extracts, 1);
  assert.equal(mutate(() => { app.save.cash = 999; }), false);
});

test('backup import preserves the old save on failure and commits the full new save on success', () => {
  const original = structuredClone(app.save), backup = D.newSave();
  backup.cash = 1234; backup.settings.volume = .2;
  const candidate = decodeBackup(encodeBackup(backup));
  failWrites = true;
  assert.equal(importSave(candidate), false);
  assert.deepEqual(app.save, original);
  failWrites = false;
  assert.equal(importSave(candidate), true);
  assert.deepEqual(read(), candidate);
});

test('backup reader rejects unrelated, unsupported, truncated, oversized, overlapping and live-raid data', () => {
  for (const text of ['{}', '{', JSON.stringify({ version: 2 }), ' '.repeat(BACKUP_MAX_BYTES + 1)]) assert.throws(() => decodeBackup(text));
  const save = D.newSave();
  save.bag.items[1].x = save.bag.items[0].x; save.bag.items[1].y = save.bag.items[0].y;
  assert.throws(() => decodeBackup(JSON.stringify(save)));
  const live = D.newSave(); D.beginRun(live, 42);
  assert.throws(() => encodeBackup(live));
  assert.throws(() => decodeBackup(JSON.stringify(live)));
  const valid = D.newSave();
  assert.deepEqual(decodeBackup(encodeBackup(valid)), valid);
  assert.deepEqual(decodeBackup(JSON.stringify(valid)), valid, 'Version-one raw saves may be migrated from older HTML files');
});
