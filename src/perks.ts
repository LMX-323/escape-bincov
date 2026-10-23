/**
 * Attribute perks and critical-hit sources (docs/CRITICAL-PERK-DESIGN.md; ids, versions and ownership in
 * docs/tasks/critical-perk-contract.md). Pure rules on plain values: no DOM, renderer, clock, RNG or save access.
 *
 * Perks exist only in v3 expansion records (`growth.perks`), and the new critical rules only in v3 layered raids;
 * v1/v2 raids keep their own rules until they settle.
 */
import type { Attribute } from './expansion-state';

export const PERK_TIERS = [15, 20, 25, 30] as const;
export type PerkTier = typeof PERK_TIERS[number];
/** Stable id `attribute-tier-side`; the display name may change, the id never does. */
export type PerkId = `${Attribute}-${PerkTier}-${'a' | 'b'}`;
/** Catalog order (strength, constitution, technique; tiers ascending; a before b). A stored selection keeps it. */
export const PERK_IDS: readonly PerkId[] = [
    'strength-15-a', 'strength-15-b', 'strength-20-a', 'strength-20-b', 'strength-25-a', 'strength-25-b', 'strength-30-a', 'strength-30-b',
    'constitution-15-a', 'constitution-15-b', 'constitution-20-a', 'constitution-20-b', 'constitution-25-a', 'constitution-25-b', 'constitution-30-a', 'constitution-30-b',
    'technique-15-a', 'technique-15-b', 'technique-20-a', 'technique-20-b', 'technique-25-a', 'technique-25-b', 'technique-30-a', 'technique-30-b',
];
export const isPerkId = (value: unknown): value is PerkId => typeof value === 'string' && PERK_IDS.includes(value as PerkId);
export function perkNode(id: PerkId): { attribute: Attribute; tier: PerkTier; side: 'a' | 'b' } {
    const [attribute, tier, side] = id.split('-');
    return { attribute: attribute as Attribute, tier: Number(tier) as PerkTier, side: side as 'a' | 'b' };
}
/**
 * A stored selection: known ids in catalog order (so no repeats), at most one per node, and every node unlocked by
 * the permanent integer level. Temporary attribute boosts and training fractions never unlock a node.
 */
export function validPerkSelection(perks: unknown, permanent: Readonly<Record<Attribute, number>>): perks is PerkId[] {
    if (!Array.isArray(perks) || perks.length > PERK_IDS.length / 2) return false;
    let last = -1;
    for (const id of perks) {
        const index = isPerkId(id) ? PERK_IDS.indexOf(id) : -1;
        if (index <= last) return false;
        const { attribute, tier, side } = perkNode(id);
        if ((side === 'b' && perks.includes(`${attribute}-${tier}-a`)) || !(permanent[attribute] >= tier)) return false;
        last = index;
    }
    return true;
}
/** Fixed limit bonuses add (§3.4); derivedLimits applies them once, on top of the attribute formulas. */
export function perkLimitBonus(perks: readonly PerkId[]): { hp: number; stamina: number; carry: number } {
    const has = (id: PerkId) => perks.includes(id);
    return { hp: has('constitution-15-a') ? 20 : 0, stamina: has('strength-20-b') ? 20 : 0,
        carry: (has('strength-15-a') ? 4 : 0) + (has('strength-30-a') ? 6 : 0) };
}

/** Independent critical sources (§2.1). Each id applies at most once. */
export const CRIT_SOURCE_IDS = ['character', 'weapon', 'technique-15-a', 'technique-20-a', 'technique-30-a', 'focus'] as const;
export type CritSourceId = typeof CRIT_SOURCE_IDS[number];
/** `chance` is the source's own probability, 0 to 1. */
export interface CritSource { id: CritSourceId; chance: number }
/**
 * Fixed when a shot is fired and copied to every pellet: later weapon switches, expiring drugs or level-ups never
 * change a bullet in flight. `target` is the enemy uid the breath charge (technique-15-a) was aimed at, or null.
 */
export interface CritSnapshot { sources: CritSource[]; multiplier: number; target: string | null }
/** The character source: 2% plus 0.15 points per effective technique level above 10, never below zero. */
export const characterCritChance = (technique: number) => Math.max(0, .02 + .0015 * (technique - 10));
/** Critical damage multiplier: 1.5, or 1.7 with technique-25-a. It replaces, never stacks with, any other bonus. */
export const critMultiplier = (perks: readonly PerkId[]) => perks.includes('technique-25-a') ? 1.7 : 1.5;
/**
 * Final chance P = 1 − Π(1 − p): the chances of NOT critting multiply. A repeated id with the same chance counts once;
 * a repeated id with another chance, an unknown id or a chance outside 0..1 throws. A finite set of sources below
 * 100% never reaches exactly 1, so only an explicit 100% source guarantees a critical hit.
 */
export function critChance(sources: readonly CritSource[]): number {
    const seen = new Map<string, number>();
    let miss = 1;
    for (const { id, chance } of sources) {
        if (!CRIT_SOURCE_IDS.includes(id) || !Number.isFinite(chance) || chance < 0 || chance > 1
            || (seen.has(id) && seen.get(id) !== chance)) throw new Error('命中参数无效。');
        if (seen.has(id)) continue;
        seen.set(id, chance);
        miss *= 1 - chance;
    }
    return 1 - miss;
}
/** Chance for a snapshot bullet that hit enemy `uid`: the breath source counts only on the enemy it was charged on. */
export const snapshotChance = (snapshot: CritSnapshot, uid: string) =>
    critChance(snapshot.target === uid ? snapshot.sources : snapshot.sources.filter(s => s.id !== 'technique-15-a'));
