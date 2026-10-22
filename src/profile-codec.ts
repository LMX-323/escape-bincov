/**
 * Stored-profile decoding and the persisted-data checks that every save format shares. Works on parsed values:
 * reading file or record text (byte limits, JSON) stays with save-backup and recovery-store, which call into this
 * module, never the other way round. Checks return booleans so that each format keeps its own error message.
 */
import { ITEMS, WEAPONS, createInventory, fits, migrateSave, type Inventory, type Item, type SaveDataV1 } from './domain';

/** Upper bound for money, counters and quantities. Seeds and RNG states are 32-bit: UINT32_MAX. */
export const COUNT_MAX = 1e9;
export const UINT32_MAX = 0xffffffff;
/** A stored profile is at most 1 MiB: a backup file as written, a profile held in another record as compact JSON. */
export const PROFILE_MAX_BYTES = 1024 * 1024;

export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;
export function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
export function whole(value: unknown, min: number, max: number): value is number { return finite(value, min, max) && Number.isSafeInteger(value); }
/** Item uids and run ids. */
export function identity(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
export function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}

/**
 * One persisted inventory: the exact grid size, known items within their stack size, uids unique across `seen`
 * (the caller chooses the scope and gets the accepted uids added), whole in-bounds positions, no overlap.
 * `rotation`: whether this format may store rotated items. `exact`: also reject unknown inventory and item fields.
 * `each` runs for an item that passed, before it is recorded; it may throw the caller's own error.
 */
export function validInventory(value: unknown, w: number, h: number, seen: Set<string>,
  rules: { rotation: boolean; exact: boolean }, each?: (item: Item) => void): value is Inventory {
  if (rules.exact && !hasExactKeys(value, ['w', 'h', 'items'])) return false;
  const inv = value as Inventory | null;
  if (!inv || inv.w !== w || inv.h !== h || !Array.isArray(inv.items) || inv.items.length > w * h) return false;
  const placed = createInventory(w, h);
  for (const item of inv.items as unknown[]) {
    if (!item || typeof item !== 'object') return false;
    const i = item as Item;
    if (rules.exact && !hasExactKeys(i, ['uid', 'id', 'qty', 'x', 'y', ...('relief' in i ? ['relief'] : []), ...('rotated' in i ? ['rotated'] : [])])) return false;
    if (!Object.hasOwn(ITEMS, i.id) || !whole(i.qty, 1, ITEMS[i.id].stack) || !identity(i.uid) || seen.has(i.uid)
      || (i.relief !== undefined && typeof i.relief !== 'boolean')
      || (i.rotated !== undefined && (!rules.rotation || typeof i.rotated !== 'boolean'))
      || !fits(placed, i.id, i.x, i.y, undefined, !!i.rotated)) return false;
    each?.(i);
    seen.add(i.uid); placed.items.push(i);
  }
  return true;
}
function validEquipment(value: any): boolean {
  if (!value || typeof value.relief !== 'boolean' || !whole(value.ammo, 0, COUNT_MAX) || !whole(value.ammoRelief, 0, COUNT_MAX)) return false;
  const gun = value.weapon === null ? null : Object.hasOwn(WEAPONS, value.weapon) && value.weapon !== 'knife' ? WEAPONS[value.weapon] : undefined;
  return gun !== undefined && value.ammo <= (gun?.magazine ?? 0) && value.ammoRelief <= value.ammo;
}

const invalid = (): never => { throw new Error('存档格式不支持或内容不完整，当前进度未改动。'); };
/** The error for a stored profile over PROFILE_MAX_BYTES, worded for the oversized file a player picked. */
export function profileTooLarge(): never { throw new Error('文件超过 1 MiB，请选择游戏导出的存档备份。'); }

/**
 * A parsed settled backup: a bare v1/v2 profile, or the export envelope around one. Strict: rejects instead of
 * repairing, rejects a live raid, then normalises through migrateSave. The result shares no objects with the input.
 */
export function decodeProfileDocument(parsed: any): SaveDataV1 {
  if (parsed?.format === 'escape-bincov-backup' && (![1, 2].includes(parsed.formatVersion) || parsed.save?.version !== parsed.formatVersion))
    throw new Error('此备份来自不兼容的版本，当前进度未改动。');
  const raw = parsed?.format === 'escape-bincov-backup' ? parsed.save : parsed;
  if (!raw || ![1, 2].includes(raw.version) || raw.activeRun !== null || !whole(raw.cash, 0, COUNT_MAX) || typeof raw.upgraded !== 'boolean') invalid();
  if (!raw.settings || !finite(raw.settings.volume, 0, 1)) invalid();
  if (!raw.stats || !['runs', 'extracts', 'kills'].every(k => whole(raw.stats[k], 0, COUNT_MAX)) || raw.stats.extracts > raw.stats.runs) invalid();
  if (!raw.quests || !['repair', 'sample', 'ledger'].every(k => typeof raw.quests[k] === 'boolean')) invalid();
  const seen = new Set<string>(), rules = { rotation: raw.version === 2, exact: false };
  for (const [name, w, h] of [['stash', 10, raw.upgraded ? 9 : 6], ['bag', 6, 5], ['safe', 2, 2]] as const)
    if (!validInventory(raw[name], w, h, seen, rules)) invalid();
  if (!validEquipment(raw.equipment)) invalid();
  return migrateSave(raw);
}

/**
 * A profile held inside another record (a session's profile, the legacy key) or the profile a classic raid's gear
 * settles into. Same rules as a backup file; the size limit applies to the compact JSON, so source whitespace never counts.
 */
export function decodeStoredProfile(value: unknown): SaveDataV1 {
  if (utf8Bytes(JSON.stringify(value)) > PROFILE_MAX_BYTES) profileTooLarge();
  return decodeProfileDocument(value);
}
