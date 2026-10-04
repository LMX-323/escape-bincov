import * as D from './domain';
import { validateCheckpoint, type RaidCheckpoint } from './checkpoint';
import { decodeBackup } from './save-backup';

/** A separate versioned record isolates old clients that silently discard unknown fields. */
export const SESSION_KEY = 'escape-bincov.session.v2';
export const SESSION_MAX_BYTES = 2 * 1024 * 1024;
export interface SessionRecord {
  format: 'escape-bincov-session'; version: 2; revision: number; savedAt: number;
  profile: D.SaveDataV1; raid: RaidCheckpoint | null;
  terminal: { runId: string; outcome: D.Outcome } | null;
  /** Exact pre-migration bytes. Retained even if an old tab later changes the old key. */
  legacyBackup: string | null;
}
const failure = (): never => { throw new Error('无法读取这份存档。请导出原始备份后使用兼容版本，当前进度未被覆盖。'); };
export function decodeSession(text: string): SessionRecord {
  if (new TextEncoder().encode(text).length > SESSION_MAX_BYTES) return failure();
  let r: SessionRecord;
  try { r = JSON.parse(text); } catch { return failure(); }
  if (!r || r.format !== 'escape-bincov-session' || r.version !== 2 || !Number.isSafeInteger(r.revision)
      || r.revision < 1 || !Number.isSafeInteger(r.savedAt) || r.savedAt < 0
      || (r.legacyBackup !== null && typeof r.legacyBackup !== 'string') || !r.profile || r.profile.version !== 1) return failure();
  const active = r.profile.activeRun;
  // Profile fields retain the existing strict inventory and economy validation.
  decodeBackup(JSON.stringify({ ...r.profile, activeRun: null }));
  if (active) {
    if (typeof active.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(active.runId) || r.terminal !== null) return failure();
    r.raid = validateCheckpoint(r.raid, r.profile);
  } else if (r.raid !== null) return failure();
  if (r.terminal !== null && (!r.terminal || typeof r.terminal.runId !== 'string'
      || !['death', 'timeout', 'extract'].includes(r.terminal.outcome) || r.profile.lastResult?.outcome !== r.terminal.outcome)) return failure();
  return structuredClone(r);
}

/** Synchronous single-record commit. A failed setItem leaves the previous revision intact. */
export class RecoveryStore {
  private expected: string | null = null;
  record: SessionRecord | null = null;
  private legacy: string | null = null;
  private loaded = false;
  writable = true;
  constructor(private storage: D.StorageLike, private now = () => Date.now()) {}
  load(): { save: D.SaveDataV1; raid: RaidCheckpoint | null; legacyRecovery: boolean } {
    const text = this.storage.getItem(SESSION_KEY);
    if (text !== null) {
      const record = decodeSession(text); // Unknown/corrupt is never treated as missing.
      this.expected = text; this.record = record; this.legacy = record.legacyBackup; this.loaded = true;
      return { save: structuredClone(record.profile), raid: structuredClone(record.raid), legacyRecovery: false };
    }
    this.legacy = this.storage.getItem(D.SAVE_KEY);
    let save: D.SaveDataV1;
    if (this.legacy !== null) {
      let raw: any;
      try { raw = JSON.parse(this.legacy); } catch { return failure(); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![undefined, 0, 1].includes(raw.version)
          || (!raw.stash && !raw.inventory)) return failure();
      save = D.migrateSave(raw);
    } else save = D.newSave();
    const legacyRecovery = !!save.activeRun;
    D.recoverInterrupted(save); // Only a legacy run without a checkpoint uses the old failure rule.
    this.loaded = true; this.expected = null;
    return { save, raid: null, legacyRecovery };
  }
  commit(profile: D.SaveDataV1, raid: RaidCheckpoint | null, terminal?: SessionRecord['terminal']): SessionRecord {
    if (!this.loaded || !this.writable) throw new Error('存档未就绪或另一窗口正在使用。');
    if (this.storage.getItem(SESSION_KEY) !== this.expected) throw new Error('另一窗口已修改存档，请刷新以加载新进度。');
    const candidate: SessionRecord = { format: 'escape-bincov-session', version: 2, revision: (this.record?.revision ?? 0) + 1,
      savedAt: this.now(), profile: structuredClone(profile), raid: structuredClone(raid),
      terminal: terminal === undefined ? (profile.activeRun ? null : this.record?.terminal ?? null) : terminal,
      legacyBackup: this.legacy };
    const text = JSON.stringify(candidate);
    decodeSession(text);
    this.storage.setItem(SESSION_KEY, text);
    this.expected = text; this.record = candidate;
    return structuredClone(candidate);
  }
  original(): string | null { return this.storage.getItem(SESSION_KEY) ?? this.storage.getItem(D.SAVE_KEY); }
}

/** A page-lifetime exclusive lock also protects the read/compare/write critical section. */
export async function ownSession(locks: LockManager | undefined): Promise<{ owned: boolean; release(): void }> {
  if (!locks) return { owned: false, release() {} };
  return new Promise(resolve => {
    void locks.request(SESSION_KEY, { ifAvailable: true }, lock => {
      if (!lock) { resolve({ owned: false, release() {} }); return; }
      return new Promise<void>(release => resolve({ owned: true, release }));
    }).catch(() => resolve({ owned: false, release() {} }));
  });
}
