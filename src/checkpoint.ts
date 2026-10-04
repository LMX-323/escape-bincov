import * as D from './domain';
import { SURVIVAL as B } from './balance';
import { WORLD, WORLD_W, WORLD_H, generateRun, type Point, type RunConfig } from './world';
import { decodeBackup } from './save-backup';

export const WORLD_VERSION = 'coast-v1';
export interface ActorState extends Point { rotation: number }
export interface EnemyState extends ActorState {
  uid: string; id: string; hp: number; home: Point; target: Point;
  state: 'patrol' | 'investigate' | 'chase' | 'attack' | 'return';
  timer: number; cooldown: number; path: Point[]; repath: number; alert: number;
}
export interface LootState extends Point { uid: string; id: string; qty: number; relief: boolean }
export interface BulletState extends ActorState { uid: string; vx: number; vy: number; left: number; damage: number; enemy: boolean }
export interface RaidCheckpoint {
  version: 1; worldVersion: typeof WORLD_VERSION; seed: number; runId: string;
  loadout: D.RunLoadout; player: ActorState;
  hp: number; stamina: number; pollution: number; bleeding: number; kills: number; elapsed: number;
  highTide: boolean; knife: boolean; reloadLeft: number; fireCooldown: number;
  warned: boolean; tideChanged: boolean; shotNoise: Point | null; noiseRadius: number; noiseTime: number;
  hitTime: number; exhausted: boolean; stepTime: number; noteSeen: string[];
  rng: number; nextEntity: number; enemies: EnemyState[]; loot: LootState[]; bullets: BulletState[];
}

/** The deployment checkpoint and debit are committed together, before a scene exists. */
export function initialCheckpoint(config: RunConfig, carried: D.RunLoadout): RaidCheckpoint {
  const loadout = structuredClone(carried);
  Object.assign(loadout, D.reloadMagazine(loadout.weapon || 'knife', loadout.ammo, loadout.ammoRelief, loadout.bag));
  const random = D.seededRandom(config.seed + 771);
  const enemies: EnemyState[] = config.enemies.map((e, i) => ({ ...e, uid: `enemy-${i}`, rotation: 0, hp: D.ENEMIES[e.id].hp,
    home: { x: e.x, y: e.y }, target: { x: e.x, y: e.y }, state: 'patrol', timer: random() * 3,
    cooldown: 1 + random(), path: [], repath: 0, alert: 0 }));
  return { version: 1, worldVersion: WORLD_VERSION, seed: config.seed, runId: loadout.runId!, loadout,
    player: { ...config.spawn, rotation: 0 }, hp: B.maxHealth, stamina: B.maxStamina, pollution: 0, bleeding: 0,
    kills: 0, elapsed: 0, highTide: config.initialHigh, knife: false, reloadLeft: 0, fireCooldown: 0,
    warned: false, tideChanged: false, shotNoise: null, noiseRadius: 510, noiseTime: 0, hitTime: 0,
    exhausted: false, stepTime: 0, noteSeen: [], rng: random.getState(), nextEntity: 1,
    enemies, loot: config.loot.map((l, i) => ({ ...l, uid: `loot-${i}`, relief: false })), bullets: [] };
}

const fail = (): never => { throw new Error('行动检查点损坏或版本不兼容。原始存档已保留，请导出备份。'); };
function number(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function integer(value: unknown, max = 1e9): value is number { return number(value, 0, max) && Number.isSafeInteger(value); }
function point(value: any): boolean { return !!value && number(value.x, 0, WORLD_W) && number(value.y, 0, WORLD_H); }
function actor(value: any): boolean { return point(value) && number(value.rotation, -100, 100); }
function bool(value: unknown): boolean { return typeof value === 'boolean'; }

/** Strict validation before rebuilding any world objects; never normalize a partial raid. */
export function validateCheckpoint(value: unknown, profile: D.SaveDataV1): RaidCheckpoint {
  const c = value as RaidCheckpoint;
  if (!c || c.version !== 1 || c.worldVersion !== WORLD_VERSION || !integer(c.seed, 0xffffffff)
      || typeof c.runId !== 'string' || c.runId !== profile.activeRun?.runId || c.seed !== profile.activeRun.seed
      || !c.loadout || c.loadout.runId !== c.runId || !actor(c.player)) fail();
  const synthetic = structuredClone(profile);
  synthetic.activeRun = null; synthetic.bag = c.loadout.bag; synthetic.safe = c.loadout.safe;
  synthetic.equipment = { weapon: c.loadout.weapon, ammo: c.loadout.ammo, ammoRelief: c.loadout.ammoRelief, relief: c.loadout.relief };
  decodeBackup(JSON.stringify(synthetic));
  if (JSON.stringify(profile.safe) !== JSON.stringify(c.loadout.safe) || profile.bag.items.length || profile.equipment.weapon !== null) fail();
  for (const key of ['hp', 'stamina', 'pollution'] as const) if (!number(c[key], 0, 100)) fail();
  if (!number(c.bleeding, 0, 1) || !number(c.elapsed, 0, 600) || !integer(c.kills, 25)) fail();
  for (const key of ['highTide', 'knife', 'warned', 'tideChanged', 'exhausted'] as const) if (!bool(c[key])) fail();
  for (const key of ['reloadLeft', 'fireCooldown', 'noiseTime', 'hitTime'] as const) if (!number(c[key], 0, 10)) fail();
  if (!number(c.stepTime, -10, 10) || !number(c.noiseRadius, 0, 2000) || (c.shotNoise !== null && !point(c.shotNoise))
      || !integer(c.rng, 0xffffffff) || !integer(c.nextEntity) || c.nextEntity < 1) fail();
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
    if (e.uid !== `enemy-${i}` || e.id !== config.enemies[i].id || !actor(e) || !point(e.home) || !point(e.target)
        || !number(e.hp, 0, D.ENEMIES[e.id].hp) || !['patrol', 'investigate', 'chase', 'attack', 'return'].includes(e.state)
        || !Array.isArray(e.path) || e.path.length > 4000 || !e.path.every(point)) fail();
    for (const key of ['timer', 'cooldown', 'repath', 'alert'] as const) if (!number(e[key], -10000, 10000)) fail();
  });
  if (c.kills !== c.enemies.filter(e => e.hp <= 0).length) fail();
  if (!Array.isArray(c.loot) || c.loot.length > 4000 || !Array.isArray(c.bullets) || c.bullets.length > 1000) fail();
  for (const l of c.loot) {
    id(l.uid);
    if (!point(l) || !Object.hasOwn(D.ITEMS, l.id) || !integer(l.qty, D.ITEMS[l.id].stack) || l.qty < 1 || !bool(l.relief)) fail();
  }
  for (const b of c.bullets) {
    id(b.uid);
    if (!actor(b) || !number(b.vx, -1000, 1000) || !number(b.vy, -1000, 1000) || !number(b.left, 0, 2000)
        || !number(b.damage, 0, 1000) || !bool(b.enemy)) fail();
  }
  return structuredClone(c);
}
