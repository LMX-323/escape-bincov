/**
 * Attribute perks and critical-hit sources (spec: docs/CRITICAL-PERK-DESIGN.md; ids, versions and ownership in
 * docs/tasks/critical-perk-contract.md). Pure rules on plain values: no DOM, renderer, clock, RNG or save access.
 *
 * Perks exist only in v3 expansion records (`growth.perks`), and the new critical rules only in v3 layered raids;
 * v1/v2 raids keep their own rules until they settle.
 */
import type { WeaponDef } from './domain';
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
/** A node of the base panel (spec 5): locked below its tier, open, or chosen. A chosen node changes only through a reset. */
export type PerkNodeStatus = { attribute: Attribute; tier: PerkTier } & ({ status: 'locked' | 'open' } | { status: 'chosen'; id: PerkId });
/** The 12 nodes in catalog order. Crossing several tiers opens them all; nothing is ever chosen for the player. */
export function perkNodes(perks: readonly PerkId[], permanent: Readonly<Record<Attribute, number>>): PerkNodeStatus[] {
    return PERK_IDS.filter(id => id.endsWith('-a')).map((a): PerkNodeStatus => {
        const { attribute, tier } = perkNode(a), id = perks.find(p => p === a || p === `${attribute}-${tier}-b`);
        return id ? { attribute, tier, status: 'chosen', id } : { attribute, tier, status: permanent[attribute] >= tier ? 'open' : 'locked' };
    });
}
/** Whether the base may add `id`: a known id on an open node of a valid selection. Unknown and prototype names never pass. */
export function canChoosePerk(perks: readonly PerkId[], permanent: Readonly<Record<Attribute, number>>, id: string): id is PerkId {
    return isPerkId(id) && validPerkSelection(perks, permanent) && validPerkSelection(addPerk(perks, id), permanent);
}
/** `perks` plus `id`, in catalog order. It checks nothing: ask canChoosePerk first, and the save validator checks again. */
export const addPerk = (perks: readonly PerkId[], id: PerkId): PerkId[] => [...perks, id].sort((x, y) => PERK_IDS.indexOf(x) - PERK_IDS.indexOf(y));
/** What the 500-cash reset of `attribute` leaves (spec 5): the other attributes keep their perks. */
export const removeAttributePerks = (perks: readonly PerkId[], attribute: Attribute): PerkId[] => perks.filter(id => perkNode(id).attribute !== attribute);

/**
 * Everything the 24 perks change (spec 3), from perkModifiers: fixed bonuses add, multipliers of one kind multiply, and
 * every id counts once. Each value applies once, beside the attribute multipliers of rpgMultipliers and never again on
 * an already combined value; each system then keeps its own limits (spec 3.4).
 */
export interface PerkModifiers {
    /** Limit bonuses for derivedLimits: hp, stamina and carry kg. Carry adds no inventory cells. */
    hp: number; stamina: number; carry: number;
    /** Sprint stamina cost, the overweight extra included. Both stamina factors join the state and buff multipliers inside their 0.25..2 clamp. */
    sprintCost: number;
    /** Natural stamina recovery in a raid; never stamina from food or water, nor base recovery. */
    staminaRecovery: number;
    /** Overweight slowdown: speed / (1 + 0.045 x overweight kg x this). The overweight stamina cost stays. */
    overweight: number;
    knifeDamage: number;
    /** HP healed by bandages and medkits only: never food, facilities or free healing, and the healing training cap stays. */
    heal: number;
    /** Chance that an enemy attack starts bleeding (18% to 12.6%); bleeding damage stays. */
    bleedChance: number;
    /** Water restored by drinking water and satiety restored by food; their hp, stamina and pollution effects stay. */
    absorption: number;
    /** Environmental pollution gain; leaving the water and antidotes remove as much as before. */
    pollutionGain: number;
    /** Natural mental loss and mental loss on hit; pain and recoil stay. */
    mentalLoss: number;
    /** Direct enemy attack damage, reduced before the hit rules (pain, training); never bleeding, thirst, hunger or pollution damage. */
    enemyDamage: number;
    /** Recoil each shot applies (bloom and kick increments); never the inherent cone, precise aim, pellets, fire rate or recovery. */
    recoil: number;
    reload: number;
    /** Independent critical sources (technique-20-a, technique-30-a) and the critical damage multiplier. */
    crit: CritSource[]; critMultiplier: number;
    /** technique-15-a: the Runtime may charge the breath source (spec 4); critSources takes its chance. */
    breath: boolean;
}
/** The breath source grows 10 points per second of effective aim, up to this (spec 4.1). */
const BREATH_MAX = .3;
/** One effect per perk (spec 3.1 to 3.3); for the breath perk the number is the charge's cap. */
const PERK_EFFECTS: Readonly<Record<PerkId, readonly [keyof PerkModifiers, number]>> = {
    'strength-15-a': ['carry', 4], 'strength-15-b': ['sprintCost', .88], 'strength-20-a': ['overweight', .7], 'strength-20-b': ['stamina', 20],
    'strength-25-a': ['knifeDamage', 1.2], 'strength-25-b': ['staminaRecovery', 1.2], 'strength-30-a': ['carry', 6], 'strength-30-b': ['sprintCost', .82],
    'constitution-15-a': ['hp', 20], 'constitution-15-b': ['heal', 1.2], 'constitution-20-a': ['bleedChance', .7], 'constitution-20-b': ['absorption', 1.25],
    'constitution-25-a': ['pollutionGain', .8], 'constitution-25-b': ['mentalLoss', .75], 'constitution-30-a': ['enemyDamage', .9], 'constitution-30-b': ['heal', 1.3],
    'technique-15-a': ['breath', BREATH_MAX], 'technique-15-b': ['recoil', .8], 'technique-20-a': ['crit', .05], 'technique-20-b': ['reload', .85],
    'technique-25-a': ['critMultiplier', 1.7], 'technique-25-b': ['recoil', .85], 'technique-30-a': ['crit', .1], 'technique-30-b': ['reload', .8],
};
/** The aggregate of a selection, in catalog order whatever the input order. Ids outside the catalog count for nothing. */
export function perkModifiers(perks: readonly PerkId[]): PerkModifiers {
    const m: PerkModifiers = { hp: 0, stamina: 0, carry: 0, sprintCost: 1, staminaRecovery: 1, overweight: 1, knifeDamage: 1, heal: 1, bleedChance: 1,
        absorption: 1, pollutionGain: 1, mentalLoss: 1, enemyDamage: 1, recoil: 1, reload: 1, crit: [], critMultiplier: 1.5, breath: false };
    for (const id of PERK_IDS.filter(p => perks.includes(p))) {
        const [kind, value] = PERK_EFFECTS[id];
        if (kind === 'crit') m.crit.push({ id: id as CritSourceId, chance: value });
        else if (kind === 'critMultiplier') m.critMultiplier = value;
        else if (kind === 'breath') m.breath = true;
        else if (kind === 'hp' || kind === 'stamina' || kind === 'carry') m[kind] += value;
        else m[kind] *= value;
    }
    return m;
}
/** Fixed limit bonuses add (spec 3.4); derivedLimits applies them once, on top of the attribute formulas. */
export function perkLimitBonus(perks: readonly PerkId[]): { hp: number; stamina: number; carry: number } {
    const { hp, stamina, carry } = perkModifiers(perks);
    return { hp, stamina, carry };
}

/** Independent critical sources (spec 2.1). Each id applies at most once. */
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
export const critMultiplier = (perks: readonly PerkId[]) => perkModifiers(perks).critMultiplier;
/** Checked sources, each id once, in CRIT_SOURCE_IDS order so that their order never changes a result. */
function uniqueSources(sources: readonly CritSource[]): CritSource[] {
    const seen = new Map<CritSourceId, number>();
    for (const { id, chance } of sources) {
        if (!CRIT_SOURCE_IDS.includes(id) || !Number.isFinite(chance) || chance < 0 || chance > 1
            || (seen.has(id) && seen.get(id) !== chance)) throw new Error('命中参数无效。');
        seen.set(id, chance);
    }
    return CRIT_SOURCE_IDS.filter(id => seen.has(id)).map(id => ({ id, chance: seen.get(id)! }));
}
const combined = (sources: readonly CritSource[]) => 1 - sources.reduce((miss, s) => miss * (1 - s.chance), 1);
/**
 * Final chance P = 1 - prod(1 - p): the chances of NOT critting multiply. A repeated id with the same chance counts once;
 * a repeated id with another chance, an unknown id or a chance outside 0..1 throws. Only an explicit 100% source
 * guarantees a critical hit: sources below it never do, even where floating point rounds their result to 1.
 */
export function critChance(sources: readonly CritSource[]): number { return combined(uniqueSources(sources)); }
/** Chance for a snapshot bullet that hit enemy `uid`: the breath source counts only on the enemy it was charged on. */
export const snapshotChance = (snapshot: CritSnapshot, uid: string) =>
    critChance(snapshot.target === uid ? snapshot.sources : snapshot.sources.filter(s => s.id !== 'technique-15-a'));

/** The focus drug's source while it lasts; another dose refreshes its timer and never adds a second source. */
const FOCUS_CRIT = .05;
/** What a shot fired now draws on (spec 2.1). */
export interface CritInput {
    /** Effective technique (the permanent level plus the technique drug); the drug thus moves only the character source. */
    technique: number;
    /** The weapon in hand, or null without one. */
    weapon: WeaponDef | null;
    perks: readonly PerkId[];
    /** Whether the focus drug is active. */
    focus: boolean;
    /** The breath charge's chance on its target, 0 to 0.3 (0 without a target). It counts only with technique-15-a. */
    breath: number;
}
/**
 * The sources a shot fired now snapshots, in CRIT_SOURCE_IDS order; invalid values throw. Null for the knife and any
 * other weapon without ammo: they never crit, and the panel shows the gun source as not applicable. The breath source
 * is there only with technique-15-a and a charge above 0, which is exactly when the snapshot keeps a target.
 */
export function critSources({ technique, weapon, perks, focus, breath }: CritInput): CritSource[] | null {
    if (!weapon || weapon.ammo === null) return null;
    if (!Number.isFinite(technique) || !(breath >= 0 && breath <= BREATH_MAX)) throw new Error('命中参数无效。');
    const m = perkModifiers(perks);
    const sources: CritSource[] = [{ id: 'character', chance: characterCritChance(technique) }, { id: 'weapon', chance: weapon.crit }, ...m.crit];
    if (m.breath && breath > 0) sources.push({ id: 'technique-15-a', chance: breath });
    if (focus) sources.push({ id: 'focus', chance: FOCUS_CRIT });
    return uniqueSources(sources);
}
/** What a panel prints (spec 2.3): the final chance, each source once with its own text, and whether a hit is guaranteed. */
export interface CritBreakdown { chance: number; guaranteed: boolean; text: string; sources: (CritSource & { text: string })[] }
/** Two decimals; a chance below 1 that would round to 100.00% prints "<100%", and only a guaranteed hit prints "100%". */
const percent = (chance: number, guaranteed: boolean) => {
    const text = (chance * 100).toFixed(2);
    return guaranteed ? '100%' : text === '100.00' ? '<100%' : `${text}%`;
};
/** Guaranteed only by an explicit 100% source, never by a combined chance that rounds or computes to 1. Throws like critChance. */
export function critBreakdown(sources: readonly CritSource[]): CritBreakdown {
    const list = uniqueSources(sources), chance = combined(list), guaranteed = list.some(s => s.chance === 1);
    return { chance, guaranteed, text: percent(chance, guaranteed), sources: list.map(s => ({ ...s, text: percent(s.chance, s.chance === 1) })) };
}
