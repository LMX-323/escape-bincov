import * as D from './domain';
import { validateCheckpoint, type RaidCheckpoint } from './checkpoint';
import { decodeStoredProfile, identity, utf8Bytes, whole, UINT32_MAX } from './profile-codec';
import { validateExpansion, type ExpansionState, type WorldResolver, type EndReason } from './expansion-state';
import { resolveExpansionWorld } from './expansion-worlds';

/** A separate versioned record isolates old clients that silently discard unknown fields. */
export const SESSION_KEY = 'escape-bincov.session.v2';
export const SESSION_MAX_BYTES = 2 * 1024 * 1024;
/** Record 5 is Perk-only, 6 enemy-only, 7 both. Historical live raids retain their own rule identity. */
export interface SessionRecord {
  format: 'escape-bincov-session'; version: 3 | 4 | 5 | 6 | 7; revision: number; savedAt: number;
  profile: D.SaveDataV1; raid: RaidCheckpoint | null;
  terminal: { runId: string; outcome: D.Outcome; reason?: EndReason } | null;
  /** Exact pre-migration bytes. Retained even if an old tab later changes the old key. */
  legacyBackup: string | null;
  /** Exact v2 session bytes retained on the first rotation-format migration. */
  migrationBackup: string | null;
  /** Present from v4. It is part of this same atomic record, never a second key. */
  expansion?: ExpansionState;
  /** Exact pre-v4 main-record bytes, retained once rather than recursively nesting v4. */
  systemsBackup?: string | null;
  /**
   * Present only in v5: the exact v4 record text that the first v5 write replaced (null when the store held no v4
   * record then), retained once and never replaced by a v5 text. A later explicit v4 import starts a new cycle.
   */
  perksBackup?: string | null;
  /** Exact bytes before enabling enemy rules, retained once in v6/v7. */
  enemyBackup?: string | null;
}
/** Preserve an already-enabled system through settlement; only explicit old imports start a fresh cycle. */
export function recordVersion(expansion: ExpansionState | null, previous = 3): SessionRecord['version'] {
  if (!expansion) return 3;
  const enemies = previous >= 6 || expansion.raid?.version === 4 || expansion.raid?.version === 5;
  return expansion.version === 3 ? enemies ? 7 : 5 : enemies ? 6 : 4;
}
/** Shared by candidate validation, pending exports and durable writes; never nests the same generation again. */
export function recordUpgradeFields(expansion: ExpansionState | null, previous: SessionRecord | null, raw: string | null) {
  const version = recordVersion(expansion, previous?.version);
  return { version,
    perksBackup: version === 5 || version === 7
      ? previous && (previous.version === 5 || previous.version === 7) ? previous.perksBackup! : previous && [4, 6].includes(previous.version) ? raw : null
      : undefined,
    enemyBackup: version >= 6 ? previous && previous.version >= 6 ? previous.enemyBackup! : raw : undefined };
}
const failure = (): never => { throw new Error('无法读取这份存档。请导出原始备份后使用兼容版本，当前进度未被覆盖。'); };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function decodeSession(text: string, resolveWorld: WorldResolver = resolveExpansionWorld): SessionRecord {
  if (utf8Bytes(text) > SESSION_MAX_BYTES) return failure();
  let r: any;
  try { r = JSON.parse(text); } catch { return failure(); }
  if (!r || r.format !== 'escape-bincov-session' || ![2, 3, 4, 5, 6, 7].includes(r.version) || !Number.isSafeInteger(r.revision)
      || r.revision < 1 || !Number.isSafeInteger(r.savedAt) || r.savedAt < 0
      || (r.legacyBackup !== null && typeof r.legacyBackup !== 'string') || !r.profile || r.profile.version !== (r.version === 2 ? 1 : 2)
      || (r.version >= 3 && r.migrationBackup !== null && typeof r.migrationBackup !== 'string')
      || (r.version >= 4 && (r.systemsBackup !== null && typeof r.systemsBackup !== 'string'))
      || ([5, 7].includes(r.version) ? r.perksBackup !== null && typeof r.perksBackup !== 'string' : r.perksBackup !== undefined)
      || (r.version < 4 && (r.expansion !== undefined || r.systemsBackup !== undefined))
      || (r.version >= 6 ? r.enemyBackup !== null && typeof r.enemyBackup !== 'string' : r.enemyBackup !== undefined)) return failure();
  if (r.version >= 4) {
    const keys = ['format', 'version', 'revision', 'savedAt', 'profile', 'raid', 'terminal', 'legacyBackup', 'migrationBackup', 'expansion', 'systemsBackup', ...([5, 7].includes(r.version) ? ['perksBackup'] : []), ...(r.version >= 6 ? ['enemyBackup'] : [])];
    if (Object.keys(r).length !== keys.length || keys.some(key => !Object.hasOwn(r, key))) return failure();
    // The record version names the expansion it carries: v5 exactly a v3 (perk) expansion, v4 only older ones.
    if ([5, 7].includes(r.version) !== (r.expansion?.version === 3)
        || r.expansion?.raid?.version === 4 && r.version !== 6
        || r.expansion?.raid?.version === 5 && r.version !== 7) return failure();
    if (!r.profile.activeRun && r.expansion?.base?.location === 'settlement' && r.terminal === null) return failure();
  }
  const legacy = r.version === 2;
  const active = r.profile.activeRun;
  // Profile fields keep the strict rules of a stored profile (inventory, economy, 1 MiB).
  const checked = decodeStoredProfile({ ...r.profile, activeRun: null });
  checked.activeRun = active ? { seed: active.seed, runId: active.runId } : null;
  // Never discard the strict decoder's normalized result and then trust unchecked fields.
  if (canonical(checked) !== canonical({ ...r.profile, version: 2 })) return failure();
  r.profile = checked;
  if (active) {
    if (!identity(active.runId) || r.terminal !== null) return failure();
    if (legacy && r.raid?.loadout && [...r.raid.loadout.bag.items, ...r.raid.loadout.safe.items].some((i: D.Item) => i.rotated !== undefined)) return failure();
    if (r.version >= 4 && r.expansion?.raid !== null && r.raid === null) {
      // Layered worlds have their own complete, strictly validated checkpoint.
      if (!r.expansion?.raid) return failure();
    } else r.raid = validateCheckpoint(r.raid, r.profile, legacy);
  } else if (r.raid !== null) return failure();
  if (r.terminal !== null && (!r.terminal || !identity(r.terminal.runId)
      || !['death', 'timeout', 'extract'].includes(r.terminal.outcome) || r.profile.lastResult?.outcome !== r.terminal.outcome)) return failure();
  if (r.terminal?.reason !== undefined && (r.version < 4 || !['death', 'timeout', 'extract', 'abandon'].includes(r.terminal.reason)
      || (r.terminal.reason === 'abandon' ? r.terminal.outcome !== 'death' : r.terminal.reason !== r.terminal.outcome))) return failure();
  if (r.version >= 4) r.expansion = validateExpansion(r.expansion, r.profile, r.raid, resolveWorld);
  return { ...structuredClone(r), version: r.version >= 4 ? r.version : 3, migrationBackup: legacy ? text : r.migrationBackup };
}

/** A real compare/write ownership failure, distinct from quota or serialization errors. */
export class StorageConflictError extends Error {}

/** Synchronous single-record commit. A failed setItem leaves the previous revision intact. */
export class RecoveryStore {
  private expected: string | null = null;
  record: SessionRecord | null = null;
  private legacy: string | null = null;
  private migration: string | null = null;
  private systems: string | null = null;
  private loaded = false;
  writable = true;
  constructor(private storage: D.StorageLike, private now = () => Date.now(), private resolveWorld: WorldResolver = resolveExpansionWorld) {}
  load(): { save: D.SaveDataV1; raid: RaidCheckpoint | null; expansion: ExpansionState | null; legacyRecovery: boolean } {
    const text = this.storage.getItem(SESSION_KEY);
    if (text !== null) {
      const record = decodeSession(text, this.resolveWorld); // Unknown/corrupt is never treated as missing.
      this.expected = text; this.record = record; this.legacy = record.legacyBackup; this.migration = record.migrationBackup; this.loaded = true;
      this.systems = record.systemsBackup ?? null;
      return { save: structuredClone(record.profile), raid: structuredClone(record.raid), expansion: structuredClone(record.expansion ?? null), legacyRecovery: false };
    }
    this.legacy = this.storage.getItem(D.SAVE_KEY);
    let save: D.SaveDataV1;
    if (this.legacy !== null) {
      let raw: any;
      try { raw = JSON.parse(this.legacy); } catch { return failure(); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![undefined, 0, 1, 2].includes(raw.version)
          || (!raw.stash && !raw.inventory)) return failure();
      save = raw.version === 2 ? decodeStoredProfile({ ...raw, activeRun: null }) : D.migrateSave(raw);
      if (raw.version === 2) {
        const active = raw.activeRun;
        if (active !== null && (!active || typeof active !== 'object' || Array.isArray(active)
            || !whole(active.seed, 1, UINT32_MAX) || (active.runId !== undefined && !identity(active.runId))
            || Object.keys(active).some(k => k !== 'seed' && k !== 'runId'))) return failure();
        save.activeRun = active;
      }
    } else save = D.newSave();
    const legacyRecovery = !!save.activeRun;
    D.recoverInterrupted(save); // Only a legacy run without a checkpoint uses the old failure rule.
    this.loaded = true; this.expected = null;
    return { save, raid: null, expansion: null, legacyRecovery };
  }
  /**
   * `explicitImport`: a player-confirmed import, which alone may write a v4 record over v5 (an older backup, possibly
   * holding a live v2 raid; it upgrades again at the next station boundary). Every other commit keeps the version.
   */
  commit(profile: D.SaveDataV1, raid: RaidCheckpoint | null, terminal?: SessionRecord['terminal'], expansion = this.record?.expansion ?? null, explicitImport: boolean | SessionRecord = false): SessionRecord {
    if (!this.loaded || !this.writable) throw new Error('存档未就绪或另一窗口正在使用。');
    if (this.storage.getItem(SESSION_KEY) !== this.expected) throw new StorageConflictError('另一窗口已修改存档，请刷新以加载新进度。');
    const previous = typeof explicitImport === 'object' ? explicitImport : explicitImport ? null : this.record;
    const fields = recordUpgradeFields(expansion, previous, explicitImport ? null : this.expected);
    // Importing/resetting a current Perk profile retains this origin's recovery copies. A confirmed older
    // expansion instead starts a new upgrade cycle; importing into a fresh origin keeps the imported copies.
    if (explicitImport && expansion?.version === 3 && this.record?.expansion?.version === 3) {
      fields.version = recordVersion(expansion, Math.max(fields.version, this.record.version));
      fields.perksBackup = this.record.perksBackup!;
      if (this.record.version >= 6) fields.enemyBackup = this.record.enemyBackup!;
    }
    const version = fields.version, current = this.record?.version ?? 3;
    const downgrade = '请导入包含角色与基地状态的完整备份，不能降级覆盖当前存档。';
    // Once v4 has been enabled, imports cannot downgrade and silently discard its state.
    if (current >= 4 && expansion === null) throw new Error(downgrade);
    // Likewise an ordinary commit never writes a v5 store back as v4 and drops the perk selection.
    if (!explicitImport && ((current === 5 || current === 7) && expansion?.version !== 3 || current === 7 && version !== 7)) throw new Error(downgrade);
    const systems = this.systems ?? (expansion && current < 4 ? this.expected : null);
    const candidate: SessionRecord = { format: 'escape-bincov-session', version, revision: (this.record?.revision ?? 0) + 1,
      savedAt: this.now(), profile: structuredClone(profile), raid: structuredClone(raid),
      terminal: terminal === undefined ? (profile.activeRun ? null : this.record?.terminal ?? null) : terminal,
      legacyBackup: this.legacy, migrationBackup: this.migration,
      ...(expansion ? { expansion: structuredClone(expansion), systemsBackup: systems } : {}),
      ...(version === 5 || version === 7 ? { perksBackup: fields.perksBackup } : {}),
      ...(version >= 6 ? { enemyBackup: fields.enemyBackup } : {}) };
    const text = JSON.stringify(candidate);
    decodeSession(text, this.resolveWorld);
    this.storage.setItem(SESSION_KEY, text);
    this.expected = text; this.record = candidate; this.systems = systems;
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
