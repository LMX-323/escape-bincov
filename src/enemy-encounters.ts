import { archetype, initialTactics, type ArchetypeId } from './enemy-archetypes';
import type { LayeredRaid, WorldDefinition } from './expansion-state';
import { separation, traversable } from './spatial';
import { WORLD } from './world';

/** Authored street encounter, away from every deployment, extraction and stair landing.
 * Replaces three birth-roster members before the single deployment commit. No extra population or RNG draws. */
export function installStreetEncounter(raid: LayeredRaid, world: WorldDefinition): void {
    if (raid.elapsed !== 0 || raid.version !== 2 || world.id !== 'coast-buildings-v1') throw new Error('遭遇只能在新街区行动初始化。');
    const members: { id: ArchetypeId; x: number; y: number }[] = [
        { id: 'raider-melee', x: 20, y: 18 }, { id: 'raider-gunner', x: 28, y: 22 }, { id: 'raider-lookout', x: 25, y: 13 },
    ];
    const layer = raid.maps.coast, map = world.maps.coast;
    const used = new Set<string>();
    for (const member of members) {
        const at = { x: (member.x + .5) * 32, y: (member.y + .5) * 32 };
        const enemy = layer.enemies.filter(e => !used.has(e.uid)).sort((a, b) => separation(a, at) - separation(b, at) || a.uid.localeCompare(b.uid, 'en'))[0];
        if (!enemy || !traversable({ definition: map, doors: layer.doors, highTide: true }, at, 'body', 10)
            || WORLD.spawns.some(p => separation(p, at) < 320) || WORLD.exits.some(p => separation(p, at) < 160)
            || map.entries.some(p => separation(p.at, at) < 96)
            || layer.enemies.some(e => e !== enemy && separation(e, at) < 24)) throw new Error('遭遇布置违反安全距离。');
        Object.assign(enemy, at, { id: member.id, hp: archetype(member.id)!.hp, home: { ...at }, target: { ...at },
            state: 'patrol', path: [], rotation: 0, timer: 0, cooldown: 0, alert: 0, repath: 0,
            tactics: initialTactics(member.id, 'street-salvage') });
        used.add(enemy.uid);
    }
    raid.version = 4;
    raid.roster = Object.values(raid.maps).flatMap(m => m.enemies.map(e => ({ uid: e.uid, id: e.id })));
}
