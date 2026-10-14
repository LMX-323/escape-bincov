/**
 * Player-requested fresh start from the station yard menu (issue #26 F12, candidate A).
 *
 * The reset is an ordinary confirmed import of a newly built record. The Runtime guard (another window, no lock,
 * failed storage, a pending base write, a pending settlement or a live raid), the compare-and-write commit and its
 * rollback therefore apply unchanged; nothing in this module writes the session key itself.
 *
 * Before the import, the current save is downloaded through the caller and kept in one local slot
 * (RESET_COPY_KEY), which the menu can restore through the existing preview/import confirmation. A save that is
 * still a pristine fresh start never replaces that slot, so resetting twice cannot destroy the real pre-reset copy.
 */
import * as D from './domain';
import { ATTRIBUTES, FACILITIES, newExpansion } from './expansion-state';
import { decodePortableBackup, encodeRecoveryBackup } from './save-backup';
import type { SessionRecord } from './recovery-store';
import type { HideoutRuntime, Result } from './hideout-runtime/contract';

/** One local copy of the save as it was before the latest real reset. Separate from the session record. */
export const RESET_COPY_KEY = 'escape-bincov.reset-copy.v1';
type CopyStorage = () => D.StorageLike;

/** A complete version-4 record equal to a new player's, keeping only the volume setting. */
export function freshStartRecord(volume: number, now: number): SessionRecord {
  const profile = D.newSave(); profile.settings.volume = volume;
  // Same station-boundary upgrade as SaveSession.enableRpg: the fresh record is already a v2 expansion.
  const expansion = newExpansion(now);
  expansion.version = 2; expansion.charm = null; expansion.awards = []; expansion.base.cursor = Math.max(expansion.base.cursor, now);
  return { format: 'escape-bincov-session', version: 4, revision: 1, savedAt: now, profile, raid: null, terminal: null,
    legacyBackup: null, migrationBackup: null, expansion, systemsBackup: null };
}
/** Portable backup text for the import pipeline; encoding validates the record with the strict session decoder. */
export function freshStartText(volume: number, now: number): string { return encodeRecoveryBackup(freshStartRecord(volume, now)); }

/** Owned goods per item and relief flag, wherever they sit: stash, bag, safe, the equipped gun and its magazine. */
function goods(p: D.SaveDataV1): string {
  const totals = new Map<string, number>();
  const add = (id: string, relief: boolean, qty: number) => { if (qty > 0) totals.set(`${id}:${relief}`, (totals.get(`${id}:${relief}`) ?? 0) + qty); };
  for (const inv of [p.stash, p.bag, p.safe]) for (const item of inv.items) add(item.id, !!item.relief, item.qty);
  const weapon = p.equipment.weapon, ammo = weapon ? D.WEAPONS[weapon]?.ammo : null;
  if (weapon) add(weapon, p.equipment.relief, 1);
  if (ammo) { add(ammo, true, p.equipment.ammoRelief); add(ammo, false, p.equipment.ammo - p.equipment.ammoRelief); }
  return JSON.stringify([...totals].sort(([a], [b]) => a.localeCompare(b)));
}
/**
 * Pristine means equal in substance to a fresh start, so resetting it again loses nothing:
 * no live raid; cash, stats, quests, stash size and pending relief as new; exactly the starter goods (positions, stack
 * splits, item ids and whether the starter pistol is equipped are ignored); no facilities, production, growth,
 * practice credit, reputation, luck change, charm, awards or extracted pearl.
 * Ignored on purpose: the volume setting, timestamps, and body values and timed effects, which regenerate in the
 * station with real time and carry no progress.
 */
export function isPristine(record: SessionRecord): boolean {
  const p = record.profile, fresh = D.newSave(), e = record.expansion, start = newExpansion(0);
  if (p.activeRun || record.raid || p.lastResult || p.reliefSupplies?.length || p.upgraded !== fresh.upgraded || p.cash !== fresh.cash) return false;
  if ((Object.keys(fresh.stats) as (keyof D.SaveDataV1['stats'])[]).some(k => p.stats[k] !== fresh.stats[k])) return false;
  if (Object.values(p.quests).some(Boolean) || goods(p) !== goods(fresh)) return false;
  if (!e) return true;
  const g = e.growth, b = e.base, t = b.training;
  return !e.raid && FACILITIES.every(f => !b.facilities[f]) && !b.queue.length && !b.completed.length && !b.extractedPearl
    && ATTRIBUTES.every(a => g.permanent[a] === start.growth.permanent[a] && g.progress[a] === start.growth.progress[a] && !t.credited[a])
    && !Object.keys(g.reputation).length && g.luck === start.growth.luck && !e.charm && !e.awards?.length && !t.quantity && !t.activeSeconds;
}
function pristineBackup(text: string): boolean {
  try { const data = decodePortableBackup(text); return data.kind === 'session' && isPristine(data.record); } catch { return false; }
}

/** The stored pre-reset copy, or null when there is none or browser storage cannot be read. */
export function readResetCopy(storage: CopyStorage): string | null {
  try { return storage().getItem(RESET_COPY_KEY) || null; } catch { return null; }
}

/**
 * Replace the whole save with a fresh start. Order: build the fresh record, preview it (the Runtime guard runs first,
 * so a blocked page writes nothing), export the current save, keep the local copy (stop if it cannot be written),
 * hand the backup to `download`, then import with the preview token as one compare-and-write commit.
 */
export function startOver(rt: HideoutRuntime, storage: CopyStorage, now: number, download: (backup: string) => void = () => {}): Result & { copied?: boolean } {
  let fresh: string;
  try { fresh = freshStartText(rt.snapshot().profile.settings.volume, now); } catch { return { ok: false, reason: 'rule', message: '操作数据无效，当前进度未改动。' }; }
  const preview = rt.previewImport(fresh);
  if (!preview.ok) return preview;
  if (!preview.token) return { ok: false, reason: 'stale', message: '请重新预览并确认覆盖。' };
  const copy = rt.exportBackup(), copied = !pristineBackup(copy);
  if (copied) {
    try {
      if (!copy) throw new Error('empty backup');
      const store = storage(); store.setItem(RESET_COPY_KEY, copy);
      if (store.getItem(RESET_COPY_KEY) !== copy) throw new Error('copy not stored');
    } catch { return { ok: false, reason: 'storage', message: '备份没有保存，存档没有清空。' }; }
  }
  download(copy);
  const result = rt.importBackup(fresh, preview.token);
  return result.ok ? { ...result, copied } : result;
}
