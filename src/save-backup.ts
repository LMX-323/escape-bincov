import { ITEMS, WEAPONS, itemSize, migrateSave, type SaveDataV1 } from './domain';
import { decodeSession, SESSION_MAX_BYTES, type SessionRecord } from './recovery-store';

export const BACKUP_MAX_BYTES = 1024 * 1024;

/** Backups are complete, settled snapshots; importing never resumes a live raid. */
export function encodeBackup(save: SaveDataV1): string {
  if (save.activeRun) throw new Error('请先结束行动，再导出存档。');
  return JSON.stringify({ format: 'escape-bincov-backup', formatVersion: 2, createdAt: new Date().toISOString(), save }, null, 2);
}

export function decodeBackup(text: string): SaveDataV1 {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw new Error('文件超过 1 MiB，请选择游戏导出的存档备份。');
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('无法读取存档。请选择游戏导出的 JSON 备份文件。'); }
  if (parsed?.format === 'escape-bincov-backup' && (![1, 2].includes(parsed.formatVersion) || parsed.save?.version !== parsed.formatVersion))
    throw new Error('此备份来自不兼容的版本，当前进度未改动。');
  const raw = parsed?.format === 'escape-bincov-backup' ? parsed.save : parsed;
  const fail = () => { throw new Error('存档格式不支持或内容不完整，当前进度未改动。'); };
  const integer = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1e9;
  if (!raw || ![1, 2].includes(raw.version) || raw.activeRun !== null || !integer(raw.cash) || typeof raw.upgraded !== 'boolean') fail();
  if (!raw.settings || typeof raw.settings.volume !== 'number' || !Number.isFinite(raw.settings.volume) || raw.settings.volume < 0 || raw.settings.volume > 1) fail();
  if (!raw.stats || !['runs', 'extracts', 'kills'].every(k => integer(raw.stats[k])) || raw.stats.extracts > raw.stats.runs) fail();
  if (!raw.quests || !['repair', 'sample', 'ledger'].every(k => typeof raw.quests[k] === 'boolean')) fail();
  const ids = new Set<string>();
  for (const [name, w, h] of [['stash', 10, raw.upgraded ? 9 : 6], ['bag', 6, 5], ['safe', 2, 2]] as const) {
    const inv = raw[name];
    if (!inv || inv.w !== w || inv.h !== h || !Array.isArray(inv.items) || inv.items.length > w * h) fail();
    const cells = new Set<number>();
    for (const entry of inv.items) {
      const def = entry && Object.hasOwn(ITEMS, entry.id) ? ITEMS[entry.id] : null;
      if (!def || !integer(entry.qty) || !entry.qty || entry.qty > def.stack || !integer(entry.x) || !integer(entry.y)) fail();
      if (typeof entry.uid !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.uid) || ids.has(entry.uid)) fail();
      ids.add(entry.uid);
      if (entry.relief !== undefined && typeof entry.relief !== 'boolean') fail();
      if (entry.rotated !== undefined && (raw.version !== 2 || typeof entry.rotated !== 'boolean')) fail();
      const size = itemSize(entry);
      if (entry.x + size.w > w || entry.y + size.h > h) fail();
      for (let y = entry.y; y < entry.y + size.h; y++) for (let x = entry.x; x < entry.x + size.w; x++) {
        const cell = y * w + x;
        if (cells.has(cell)) fail();
        cells.add(cell);
      }
    }
  }
  const equipment = raw.equipment;
  if (!equipment || typeof equipment.relief !== 'boolean' || !integer(equipment.ammo) || !integer(equipment.ammoRelief)) fail();
  const gun = equipment.weapon === null ? null : Object.hasOwn(WEAPONS, equipment.weapon) && equipment.weapon !== 'knife' ? WEAPONS[equipment.weapon] : undefined;
  if (gun === undefined || equipment.ammo > (gun?.magazine ?? 0) || equipment.ammoRelief > equipment.ammo) fail();
  return migrateSave(raw);
}

/** Live backups use a distinct envelope; this decoder also accepts legacy v1/v2 exports. */
export function encodeRecoveryBackup(record: SessionRecord): string {
  decodeSession(JSON.stringify(record));
  return JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: 3, record });
}
export function decodePortableBackup(text: string): { kind: 'settled'; save: SaveDataV1 } | { kind: 'session'; record: SessionRecord } {
  if (new TextEncoder().encode(text).length > SESSION_MAX_BYTES + 512) throw new Error('存档文件过大。');
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('无法读取存档：文件不是有效的 JSON。'); }
  if (parsed?.format === 'escape-bincov-recovery-backup') {
    if (![2, 3].includes(parsed.formatVersion) || parsed.record?.version !== parsed.formatVersion) throw new Error('此备份来自不兼容的版本，请使用兼容版本导入。');
    return { kind: 'session', record: decodeSession(JSON.stringify(parsed.record)) };
  }
  if (parsed?.format === 'escape-bincov-session') return { kind: 'session', record: decodeSession(text) };
  return { kind: 'settled', save: decodeBackup(text) };
}
