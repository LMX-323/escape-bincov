import { ITEMS, WEAPONS, migrateSave, type SaveDataV1 } from './domain';

export const BACKUP_MAX_BYTES = 1024 * 1024;

/** Backups are complete, settled snapshots; importing never resumes a live raid. */
export function encodeBackup(save: SaveDataV1): string {
  if (save.activeRun) throw new Error('请先结束行动，再导出存档。');
  return JSON.stringify({ format: 'escape-bincov-backup', formatVersion: 1, createdAt: new Date().toISOString(), save }, null, 2);
}

export function decodeBackup(text: string): SaveDataV1 {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw new Error('文件超过 1 MiB，请选择游戏导出的存档备份。');
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('无法读取存档。请选择游戏导出的 JSON 备份文件。'); }
  const raw = parsed?.format === 'escape-bincov-backup' && parsed.formatVersion === 1 ? parsed.save : parsed;
  const fail = () => { throw new Error('存档格式不支持或内容不完整，当前进度未改动。'); };
  const integer = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1e9;
  if (!raw || raw.version !== 1 || raw.activeRun !== null || !integer(raw.cash) || typeof raw.upgraded !== 'boolean') fail();
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
      if (entry.x + def!.w > w || entry.y + def!.h > h) fail();
      for (let y = entry.y; y < entry.y + def!.h; y++) for (let x = entry.x; x < entry.x + def!.w; x++) {
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
