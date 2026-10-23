import type { EnemyState } from '../checkpoint';
import { archetype } from '../enemy-archetypes';
import type { Point } from '../world';
import type { LegacyEnemyWorld } from './enemy-ai';

interface TacticalWorld extends LegacyEnemyWorld {
    readonly elapsed: number;
    readonly enemies: EnemyState[];
}
export interface TacticalEffects {
    fire(enemy: EnemyState, angle: number): void;
    strike(enemy: EnemyState): void;
    openDoor(enemy: EnemyState, id: string): void;
    notice(enemy: EnemyState, message: string): void;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
const delta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** v4 controller. Perception writes a value snapshot; locomotion/search never dereference an unseen target.
 * The phase machine consumes at most one release per substep. It keeps its cost and locked direction on restore.
 * All changes live on EnemyState, including limited ammunition, warning and one-use squad reports. */
export function advanceTacticalEnemy(world: TacticalWorld, effects: TacticalEffects, e: EnemyState, dt: number): void {
    const def = archetype(e.id)!, t = e.tactics!;
    const sees = distance(e, world.player) <= def.vision && world.sight(e, world.player);
    const inside = distance(e.home, world.player) < (def.stance === 'conditional' ? 90 : def.territory * .55);
    e.cooldown = Math.max(0, e.cooldown - dt); e.repath -= dt; e.timer -= dt;
    t.awareness = Math.max(0, Math.min(1, t.awareness + (sees ? dt / def.confirm : -dt * .5)));
    if (sees) {
        t.memory = { at: { x: world.player.x, y: world.player.y }, time: world.elapsed, source: 'sight', target: 'player' };
        if (t.stance !== 'hostile' && t.stance !== 'retreat' && t.awareness >= 1) {
            if (def.stance === 'hostile') t.stance = 'hostile';
            else if (inside) {
                if (t.stance !== 'warning') effects.notice(e, def.stance === 'conditional' ? '前方是限制区，请退回公共通道。' : '正在护卫领地，退开可避战。');
                t.stance = 'warning'; t.warning = Math.min(5, t.warning + dt);
                if (t.warning >= (def.stance === 'conditional' ? 4 : 1.5)) t.stance = 'hostile';
            }
        }
    } else if (world.noiseTime > 0 && world.shotNoise && distance(e, world.shotNoise) <= Math.min(300, world.noiseRadius)) {
        // Hearing locates a sound, not the player after they leave it; it alone never authorizes a shot.
        if (t.memory?.source !== 'sight' || world.elapsed - t.memory.time > 1)
            t.memory = { at: { ...world.shotNoise }, time: world.elapsed, source: 'sound', target: 'player' };
    }
    if (!inside && t.stance === 'warning') {
        t.warning = Math.max(0, t.warning - dt * 2);
        if (t.warning === 0) t.stance = 'idle';
    }
    if (t.stance === 'hostile' && def.signal && !t.signalUsed && t.memory?.source === 'sight') {
        t.signalUsed = true;
        effects.notice(e, '正在向附近同组报告最后目击位置。');
        for (const ally of world.enemies) {
            if (ally === e || ally.hp <= 0 || !ally.tactics || ally.tactics.squad !== t.squad || distance(e, ally) > 320) continue;
            ally.tactics.memory = { ...structuredClone(t.memory), source: 'report' };
            ally.tactics.stance = 'hostile'; ally.tactics.awareness = 1;
        }
    }
    const flooded = world.highTide && !world.walkable(e.x, e.y, true, 10);
    const stale = !t.memory || world.elapsed - t.memory.time > 7;
    const outside = distance(e, e.home) > def.territory;
    if (t.stance === 'hostile' && (stale || outside)) {
        t.stance = 'idle'; t.memory = null; t.warning = 0;
    }
    if (e.hp < def.hp * .25 && t.stance === 'hostile') t.stance = 'retreat';
    // A winding attack cannot be cancelled for a free reload/cooldown by losing sight or refreshing.
    if (t.phase !== 'idle') {
        e.state = 'attack'; e.rotation = t.lockedAim;
        t.phaseLeft = Math.max(0, t.phaseLeft - dt);
        if (t.phase === 'windup' && t.phaseLeft === 0) {
            t.phase = 'release'; t.phaseLeft = def.attack === 'pounce' ? .3 : 0;
            return;
        }
        if (t.phase === 'release') {
            if (def.attack === 'pounce') {
                world.move(e, Math.cos(t.lockedAim) * 300 * dt, Math.sin(t.lockedAim) * 300 * dt);
                if (distance(e, world.player) > 36 && t.phaseLeft > 0) return;
            }
            // Effects may restore entity objects. Publish the next phase before invoking them.
            t.phase = 'recovery'; t.phaseLeft = def.recovery;
            if (def.attack === 'projectile') {
                if (t.magazine > 0) { t.magazine--; effects.fire(e, t.lockedAim); }
            } else if (def.attack === 'spit') effects.fire(e, t.lockedAim);
            else if (distance(e, world.player) <= (def.attack === 'pounce' ? 36 : def.range)
                && Math.abs(delta(angle(e, world.player), t.lockedAim)) <= .65 && world.sight(e, world.player, world.highTide, 10)) effects.strike(e);
            return;
        }
        if (t.phaseLeft === 0) {
            if (t.phase === 'reload') {
                const count = Math.min(def.magazine - t.magazine, t.reserve);
                t.magazine += count; t.reserve -= count;
            }
            t.phase = 'idle'; e.cooldown = .15;
        }
        return;
    }
    if (!flooded && t.stance === 'hostile' && sees && distance(e, world.player) < def.range && e.cooldown === 0) {
        t.lockedAim = angle(e, world.player); e.rotation = t.lockedAim;
        if (def.magazine && t.magazine === 0) {
            if (t.reserve === 0) t.stance = 'retreat';
            else { t.phase = 'reload'; t.phaseLeft = def.reload; effects.notice(e, '正在换弹。'); }
        } else { t.phase = 'windup'; t.phaseLeft = def.windup; }
        e.state = 'attack'; return;
    }
    let target: Point;
    if (flooded) target = world.dryRefuge(e) ?? e.home;
    else if (t.stance === 'retreat' || outside || stale) { target = e.home; e.state = 'return'; }
    else if (t.stance === 'hostile' || t.memory?.source === 'sound' || t.memory?.source === 'report') {
        target = t.memory!.at; e.state = sees && t.stance === 'hostile' ? 'chase' : 'investigate';
    } else { target = e.home; e.state = 'patrol'; }
    e.target = { ...target }; e.alert = t.memory ? Math.max(0, 7 - (world.elapsed - t.memory.time)) : 0;
    if (distance(e, target) < 12) return;
    if (e.repath <= 0) { e.path = world.path(e, target, flooded ? false : world.highTide); e.repath = .8; }
    while (e.path.length && distance(e, e.path[0]) < 12) e.path.shift();
    const next = world.sight(e, target, world.highTide, 10) && world.walkable(target.x, target.y, world.highTide) ? target : e.path[0];
    if (!next) return;
    const facing = angle(e, next), speed = def.speed * (t.stance === 'retreat' ? 1.15 : 1);
    if (world.space) {
        const at = { x: e.x + Math.cos(facing) * (speed * dt + 12), y: e.y + Math.sin(facing) * (speed * dt + 12) };
        const door = world.space.definition.doors.find(d => Math.floor(at.x / 32) === d.x && Math.floor(at.y / 32) === d.y);
        if (door && !world.space.doors[door.id]) { effects.openDoor(e, door.id); return; }
    }
    e.rotation = facing; world.move(e, Math.cos(facing) * speed * dt, Math.sin(facing) * speed * dt, flooded);
}
