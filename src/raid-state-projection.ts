/** Shared data projection between a live current layer and the complete expansion record. */
import { WORLD_VERSION, type RaidCheckpoint } from './checkpoint';
import type { BodyState, LayeredRaid } from './expansion-state';

/** Live snapshots always include containers; only historical checkpoints may omit them. */
export type ActiveRaidSnapshot = RaidCheckpoint & Required<Pick<RaidCheckpoint, 'containers'>>;

/**
 * Write into a caller-owned detached expansion, using an already detached live snapshot.
 * The caller must clone the expansion before capturing live state: snapshot synchronizes ammo.
 * Only the current layer and shared raid/body fields change; other layers and base data survive.
 * Pursuits own their enemies even while those enemies are visible in the source layer.
 * This mapping does not clone, advance clocks/RNG, validate, persist or publish the candidate.
 */
export function applyActiveRaidSnapshot(body: BodyState, raid: LayeredRaid, c: ActiveRaidSnapshot): void {
    const layer = raid.maps[raid.currentMap];
    Object.assign(body, { hp: c.hp, stamina: c.stamina, pollution: c.pollution, bleeding: !!c.bleeding, exhausted: c.exhausted });
    Object.assign(raid, { player: c.player, loadout: c.loadout, elapsed: c.elapsed, highTide: c.highTide, warned: c.warned, tideChanged: c.tideChanged,
        kills: c.kills, rng: c.rng, nextEntity: c.nextEntity, reloadLeft: c.reloadLeft, fireCooldown: c.fireCooldown, knife: c.knife, hitTime: c.hitTime });
    const projected = raid.pursuits.filter(p => p.sourceMap === raid.currentMap);
    layer.enemies = c.enemies.filter(e => !projected.some(p => p.enemy.uid === e.uid));
    projected.forEach(p => { const enemy = c.enemies.find(e => e.uid === p.enemy.uid); if (enemy) p.enemy = enemy; });
    Object.assign(layer, { loot: c.loot, containers: c.containers, bullets: c.bullets,
        noise: c.shotNoise && c.noiseTime > 0 ? { at: c.shotNoise, radius: c.noiseRadius, remaining: c.noiseTime } : null });
}

/**
 * Adapt an already cloned expansion to the existing current-layer restore interface.
 * Nested records alias the supplied raid; restore remains responsible for live entity ownership.
 * Source-map pursuits are visible alongside resident enemies, but keep their separate owner.
 * stepTime stays local to the consumer; layered raids do not persist coast note discovery.
 */
export function activeRaidCheckpoint(body: BodyState, raid: LayeredRaid, stepTime: number): ActiveRaidSnapshot {
    const layer = raid.maps[raid.currentMap];
    return { version: 2, worldVersion: WORLD_VERSION, seed: raid.seed, runId: raid.runId, loadout: raid.loadout, player: raid.player,
        hp: body.hp, stamina: body.stamina, pollution: body.pollution, bleeding: Number(body.bleeding),
        kills: raid.kills, elapsed: raid.elapsed, highTide: raid.highTide, knife: raid.knife, reloadLeft: raid.reloadLeft, fireCooldown: raid.fireCooldown,
        warned: raid.warned, tideChanged: raid.tideChanged, shotNoise: layer.noise?.at ?? null, noiseRadius: layer.noise?.radius ?? 510, noiseTime: layer.noise?.remaining ?? 0,
        hitTime: raid.hitTime, exhausted: body.exhausted, stepTime, noteSeen: [], rng: raid.rng, nextEntity: raid.nextEntity,
        enemies: [...layer.enemies, ...raid.pursuits.filter(p => p.sourceMap === raid.currentMap).map(p => p.enemy)], loot: layer.loot, containers: layer.containers, bullets: layer.bullets };
}
