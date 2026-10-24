import * as D from './domain';
import type { EnemyTactics } from './enemy-archetypes';
import { SURVIVAL as B } from './balance';
import { WORLD, WORLD_W, WORLD_H, generateRun, type Point, type RunConfig } from './world';
import { decodeStoredProfile, finite, hasOwnStringKey, validInventory, whole, COUNT_MAX, UINT32_MAX } from './profile-codec';
import type { LootContainer } from './loot';
import type { CritSnapshot } from './perks';

export const WORLD_VERSION = 'coast-v2';
export interface ActorState extends Point { rotation: number }
export interface EnemyState extends ActorState {
  /** Present only for an authored archetype in a layered v4 action. Never added to an old active enemy. */
  tactics?: EnemyTactics;
  uid: string; id: string; hp: number; home: Point; target: Point;
  state: 'patrol' | 'investigate' | 'chase' | 'attack' | 'return';
  timer: number; cooldown: number; path: Point[]; repath: number; alert: number;
}
export interface LootState extends Point { uid: string; id: string; qty: number; relief: boolean }
export interface BulletState extends ActorState {
  uid: string; vx: number; vy: number; left: number; damage: number; enemy: boolean; owner?: string;
  /**
   * The shot's critical snapshot (src/perks.ts): on every player round of a v3 layered raid, taken when the shot was
   * fired and never changed in flight. Enemy rounds, classic raids and v1/v2 raids never carry it.
   */
  crit?: CritSnapshot;
}
export interface RaidCheckpoint {
  version: 2; worldVersion: typeof WORLD_VERSION; seed: number; runId: string;
  loadout: D.RunLoadout; player: ActorState;
  hp: number; stamina: number; pollution: number; bleeding: number; kills: number; elapsed: number;
  highTide: boolean; knife: boolean; reloadLeft: number; fireCooldown: number;
  warned: boolean; tideChanged: boolean; shotNoise: Point | null; noiseRadius: number; noiseTime: number;
  hitTime: number; exhausted: boolean; stepTime: number; noteSeen: string[];
  rng: number; nextEntity: number; enemies: EnemyState[]; loot: LootState[]; bullets: BulletState[];
  /** Missing in older checkpoints: their remaining supplies stay on the ground. */
  containers?: LootContainer[];
}

/** The deployment checkpoint and debit are committed together, before a scene exists. */
export function initialCheckpoint(config: RunConfig, carried: D.RunLoadout): RaidCheckpoint {
  const loadout = structuredClone(carried);
  Object.assign(loadout, D.reloadMagazine(loadout.weapon || 'knife', loadout.ammo, loadout.ammoRelief, loadout.bag));
  const random = D.seededRandom(config.seed + 771);
  const enemies: EnemyState[] = config.enemies.map((e, i) => ({ ...e, uid: `enemy-${i}`, rotation: 0, hp: D.ENEMIES[e.id].hp,
    home: { x: e.x, y: e.y }, target: { x: e.x, y: e.y }, state: 'patrol', timer: random() * 3,
    cooldown: 1 + random(), path: [], repath: 0, alert: 0 }));
  const containers: LootContainer[] = config.containers.map(crate => {
    const inventory = D.createInventory(6, 5);
    for (const item of crate.items) if (D.addItem(inventory, item.id, item.qty)) throw new Error('物资箱空间不足。');
    return { id: crate.id, runId: loadout.runId!, kind: 'crate', name: crate.name, x: crate.x, y: crate.y, inventory };
  });
  return { version: 2, worldVersion: WORLD_VERSION, seed: config.seed, runId: loadout.runId!, loadout,
    player: { ...config.spawn, rotation: 0 }, hp: B.maxHealth, stamina: B.maxStamina, pollution: 0, bleeding: 0,
    kills: 0, elapsed: 0, highTide: config.initialHigh, knife: false, reloadLeft: 0, fireCooldown: 0,
    warned: false, tideChanged: false, shotNoise: null, noiseRadius: 510, noiseTime: 0, hitTime: 0,
    exhausted: false, stepTime: 0, noteSeen: [], rng: random.getState(), nextEntity: 1,
    enemies, loot: config.loot.map((l, i) => ({ ...l, uid: `loot-${i}`, relief: false })), bullets: [], containers };
}

const fail = (): never => { throw new Error('行动检查点损坏或版本不兼容。原始存档已保留，请导出备份。'); };
function point(value: any): boolean { return !!value && finite(value.x, 0, WORLD_W) && finite(value.y, 0, WORLD_H); }
function actor(value: any): boolean { return point(value) && finite(value.rotation, -100, 100); }
function bool(value: unknown): boolean { return typeof value === 'boolean'; }
function inventoryIdentity(inv: D.Inventory): string {
  return JSON.stringify([inv.w, inv.h, inv.items.map(i => [i.uid, i.id, i.qty, i.x, i.y, !!i.relief, !!i.rotated])]);
}

/** Strict validation before rebuilding any world objects; never normalize a partial raid. */
export function validateCheckpoint(value: unknown, profile: D.SaveDataV1, legacy = false): RaidCheckpoint {
  const c = value as RaidCheckpoint;
  if (!c || c.version !== (legacy ? 1 : 2) || ![WORLD_VERSION, 'coast-v1'].includes(c.worldVersion) || !whole(c.seed, 0, UINT32_MAX)
      || typeof c.runId !== 'string' || c.runId !== profile.activeRun?.runId || c.seed !== profile.activeRun.seed
      || !c.loadout || c.loadout.runId !== c.runId || !actor(c.player)) fail();
  // Carried gear follows the stored-profile rules: checked as the profile it settles into, failing with that profile's errors.
  decodeStoredProfile({ ...profile, activeRun: null, bag: c.loadout.bag, safe: c.loadout.safe,
    equipment: { weapon: c.loadout.weapon, ammo: c.loadout.ammo, ammoRelief: c.loadout.ammoRelief, relief: c.loadout.relief } });
  if (inventoryIdentity(profile.safe) !== inventoryIdentity(c.loadout.safe) || profile.bag.items.length || profile.equipment.weapon !== null) fail();
  for (const key of ['hp', 'stamina', 'pollution'] as const) if (!finite(c[key], 0, 100)) fail();
  if (!finite(c.bleeding, 0, 1) || !finite(c.elapsed, 0, 600) || !whole(c.kills, 0, 25)) fail();
  for (const key of ['highTide', 'knife', 'warned', 'tideChanged', 'exhausted'] as const) if (!bool(c[key])) fail();
  for (const key of ['reloadLeft', 'fireCooldown', 'noiseTime', 'hitTime'] as const) if (!finite(c[key], 0, 10)) fail();
  if (!finite(c.stepTime, -10, 10) || !finite(c.noiseRadius, 0, 2000) || (c.shotNoise !== null && !point(c.shotNoise))
      || !whole(c.rng, 0, UINT32_MAX) || !whole(c.nextEntity, 1, COUNT_MAX)) fail();
  if (!Array.isArray(c.noteSeen) || c.noteSeen.length > WORLD.notes.length || new Set(c.noteSeen).size !== c.noteSeen.length
      || c.noteSeen.some(n => !WORLD.notes.some(w => w.title === n))) fail();
  const config = generateRun(c.seed);
  if (c.highTide !== (c.tideChanged ? !config.initialHigh : config.initialHigh)
      || c.warned !== (c.elapsed >= config.warningAt) || c.tideChanged !== (c.elapsed >= config.tideAt)) fail();
  const ids = new Set<string>();
  const id = (uid: unknown) => {
    if (typeof uid !== 'string' || !/^(enemy|loot|entity)-[0-9]+$/.test(uid) || ids.has(uid)) return fail();
    ids.add(uid);
    if (uid.startsWith('entity-') && Number(uid.slice(7)) >= c.nextEntity) fail();
  };
  if (!Array.isArray(c.enemies) || c.enemies.length !== config.enemies.length) fail();
  c.enemies.forEach((e, i) => {
    id(e.uid);
    if (e.tactics !== undefined || e.uid !== `enemy-${i}` || e.id !== config.enemies[i].id || !actor(e) || !point(e.home) || !point(e.target)
        || !finite(e.hp, 0, D.ENEMIES[e.id].hp) || !['patrol', 'investigate', 'chase', 'attack', 'return'].includes(e.state)
        || !Array.isArray(e.path) || e.path.length > 4000 || !e.path.every(point)) fail();
    for (const key of ['timer', 'cooldown', 'repath', 'alert'] as const) if (!finite(e[key], -10000, 10000)) fail();
  });
  if (c.kills !== c.enemies.filter(e => e.hp <= 0).length) fail();
  if (!Array.isArray(c.loot) || c.loot.length > 4000 || !Array.isArray(c.bullets) || c.bullets.length > 1000) fail();
  for (const l of c.loot) {
    id(l.uid);
    if (!point(l) || !hasOwnStringKey(D.ITEMS, l.id) || !whole(l.qty, 1, D.ITEMS[l.id].stack) || !bool(l.relief)) fail();
  }
  for (const b of c.bullets) {
    id(b.uid);
    if (!actor(b) || !finite(b.vx, -1000, 1000) || !finite(b.vy, -1000, 1000) || !finite(b.left, 0, 2000)
        || !finite(b.damage, 0, 1000) || !bool(b.enemy)) fail();
  }
  if (c.worldVersion === WORLD_VERSION && !Array.isArray(c.containers)) fail();
  if (c.worldVersion !== WORLD_VERSION && c.containers !== undefined) fail();
  if (c.containers !== undefined) {
    if (!Array.isArray(c.containers) || c.containers.length > config.containers.length + config.enemies.length) fail();
    const containers = new Set<string>();
    const itemIds = new Set([...profile.stash.items, ...c.loadout.bag.items, ...c.loadout.safe.items].map(item => item.uid));
    for (const container of c.containers) {
      if (!container || typeof container.id !== 'string' || containers.has(container.id) || container.runId !== c.runId
          || !point(container) || typeof container.name !== 'string' || !container.name.length || container.name.length > 100) fail();
      containers.add(container.id);
      if (container.kind === 'crate') {
        const original = config.containers.find(crate => crate.id === container.id);
        if (!original || container.x !== original.x || container.y !== original.y) fail();
      } else if (container.kind === 'corpse') {
        if (!/^corpse-enemy-[0-9]+$/.test(container.id)) fail();
        const enemy = c.enemies.find(entry => `corpse-${entry.uid}` === container.id);
        if (!enemy || enemy.hp > 0) fail();
      } else fail();
      if (!validInventory(container.inventory, 6, 5, itemIds, { rotation: !legacy, exact: false })) fail();
    }
  }
  return { ...structuredClone(c), version: 2, worldVersion: WORLD_VERSION, containers: structuredClone(c.containers ?? []) };
}
