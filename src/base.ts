import * as D from './domain';
import { FACILITIES, RECIPES, PRODUCTION_SPEED, derivedLimits, type Attribute, type ExpansionState, type Facility, type ProductionBatch } from './expansion-state';
import { advanceEffects, addProgress, trainingEfficiency } from './rpg';
import { advanceProduction } from './production-clock';
import { separation } from './spatial';
import type { Point } from './world';

type Cost = { cash: number; items: { id: string; qty: number }[] };
const cost = (cash: number, ...items: [string, number][]): Cost => ({ cash, items: items.map(([id, qty]) => ({ id, qty })) });
export const FACILITY_COSTS: Record<Facility, Cost[]> = {
    rest: [cost(200, ['scrap', 1]), cost(400, ['scrap', 2], ['wire', 1]), cost(700, ['scrap', 3], ['wire', 2])],
    medical: [cost(350, ['bandage', 2]), cost(650, ['medkit', 1], ['fuse', 1]), cost(1000, ['medkit', 2], ['battery', 1])],
    training: [cost(300, ['scrap', 2]), cost(600, ['scrap', 3], ['wire', 1]), cost(900, ['scrap', 4], ['battery', 1])],
    workbench: [cost(400, ['scrap', 3], ['wire', 2]), cost(800, ['scrap', 4], ['fuse', 2]), cost(1200, ['scrap', 5], ['battery', 2])],
    blackmarket: [cost(500, ['pearl', 1]), cost(900, ['watch', 1], ['wire', 2]), cost(1400, ['pearl', 2], ['battery', 1])],
};
export const FACILITY_NAMES: Record<Facility, string> = { rest: '休息区', medical: '医疗区', training: '训练区', workbench: '工作台', blackmarket: '黑市商人' };
const pool = (profile: D.SaveDataV1) => [profile.stash, profile.bag, profile.safe];
export function payMaterials(profile: D.SaveDataV1, payment: Cost): boolean {
    if (profile.cash < payment.cash || payment.items.some(required => pool(profile).flatMap(inv => inv.items).filter(i => i.id === required.id && !i.relief).reduce((n, i) => n + i.qty, 0) < required.qty)) return false;
    for (const required of payment.items) {
        let left = required.qty;
        for (const inv of pool(profile)) for (const item of [...inv.items].filter(i => i.id === required.id && !i.relief)) {
            const used = Math.min(item.qty, left); item.qty -= used; left -= used;
            if (!item.qty) inv.items = inv.items.filter(i => i !== item);
        }
    }
    profile.cash -= payment.cash; return true;
}
export function buildFacility(profile: D.SaveDataV1, state: ExpansionState, facility: Facility): boolean {
    if (state.base.location !== 'base' || profile.activeRun || !FACILITIES.includes(facility)) return false;
    const level = state.base.facilities[facility];
    if (level === 3 || facility !== 'rest' && !profile.quests.repair || facility === 'blackmarket' && !state.base.extractedPearl) return false;
    if (!payMaterials(profile, FACILITY_COSTS[facility][level])) return false;
    state.base.facilities[facility]++; return true;
}
export function enqueueProduction(profile: D.SaveDataV1, state: ExpansionState, recipe: ProductionBatch['recipe']): boolean {
    const base = state.base, definition = RECIPES[recipe];
    if (!definition || profile.activeRun || base.location !== 'base' || base.facilities.workbench < definition.level || base.facilities.medical < definition.medical || base.queue.length >= base.facilities.workbench) return false;
    if (!payMaterials(profile, { cash: definition.cash, items: [...definition.materials] })) return false;
    const workbenchLevel = base.facilities.workbench as 1 | 2 | 3, duration = definition.seconds * PRODUCTION_SPEED[workbenchLevel];
    base.queue.push({ id: `batch-${base.nextBatch++}`, recipe, duration, remaining: duration, workbenchLevel,
        paidCash: definition.cash, paidItems: structuredClone([...definition.materials]), result: structuredClone([...definition.result]) });
    return true;
}
export function claimProduction(profile: D.SaveDataV1, state: ExpansionState, id: string, target: 'stash' | 'bag' | 'safe'): boolean {
    if (profile.activeRun || state.base.location !== 'base') return false;
    const batch = state.base.completed.find(b => b.id === id);
    if (!batch || !['stash', 'bag', 'safe'].includes(target)) return false;
    const inventory = structuredClone(profile[target]);
    for (const item of batch.result) if (D.addItem(inventory, item.id, item.qty)) return false;
    profile[target] = inventory; state.base.completed = state.base.completed.filter(b => b !== batch);
    advanceProduction(state.base, state.base.cursor); return true;
}
export function cancelProduction(profile: D.SaveDataV1, state: ExpansionState, id: string): boolean {
    if (profile.activeRun || state.base.location !== 'base') return false;
    const index = state.base.queue.findIndex(b => b.id === id);
    if (index <= 0) return false;
    const batch = state.base.queue[index], inventory = structuredClone(profile.stash);
    for (const item of batch.paidItems) if (D.addItem(inventory, item.id, item.qty)) return false;
    profile.stash = inventory; profile.cash += batch.paidCash; state.base.queue.splice(index, 1); return true;
}

/** Finite event boundaries, not a per-second replay of a potentially long offline interval. */
export function advanceBaseRecovery(state: ExpansionState, seconds: number): void {
    const body = state.body, base = state.base, restMultiplier = [1, 1.5, 2, 3][base.facilities.rest], medicalMultiplier = [1, 1.5, 2, 3][base.facilities.medical];
    const treatmentSpeed = [1, 2, 3, 4][base.facilities.medical], restNeeded = [120, 120, 90, 60][base.facilities.rest];
    while (seconds > 1e-9) {
        const limits = derivedLimits(state);
        if (!base.energizedGranted && base.restSeconds >= restNeeded && body.hp >= limits.hp * .8 && body.mental >= 70 && body.water >= 80 && body.satiety >= 80 && !body.bleeding) {
            body.effects.energized = 600; base.energizedGranted = true;
        }
        const hpRate = restMultiplier * medicalMultiplier / 60, mentalRate = restMultiplier / 60;
        const boundaries = [seconds, ...Object.values(body.effects).filter(t => t > 0)];
        if (!base.energizedGranted) {
            if (base.restSeconds < restNeeded) boundaries.push(restNeeded - base.restSeconds);
            for (const [value, target, rate] of [[body.hp, limits.hp * .8, hpRate], [body.mental, 70, mentalRate], [body.water, 80, 2 / 60], [body.satiety, 80, 1.5 / 60]]) if (value < target) boundaries.push((target - value) / rate);
        }
        for (const [active, progress, target] of [[body.bleeding, body.treatment.bleeding, 60], [body.effects.pain > 0, body.treatment.pain, 60], [body.effects.injectionFatigue > 0, body.treatment.injectionFatigue, 120]] as const) {
            if (active && progress < target) boundaries.push((target - progress) / treatmentSpeed);
        }
        const used = Math.min(...boundaries.filter(t => t > 1e-9));
        const bleeding = body.bleeding, pain = body.effects.pain > 0, fatigue = body.effects.injectionFatigue > 0;
        body.hp = Math.min(limits.hp, body.hp + hpRate * used); body.stamina = Math.min(limits.stamina, body.stamina + 15 * used);
        body.mental = Math.min(100, body.mental + mentalRate * used); body.water = Math.min(100, body.water + 2 / 60 * used); body.satiety = Math.min(100, body.satiety + 1.5 / 60 * used); body.pollution = Math.max(0, body.pollution - .5 / 60 * treatmentSpeed * used);
        if (bleeding) { body.treatment.bleeding = Math.min(60, body.treatment.bleeding + treatmentSpeed * used); if (body.treatment.bleeding >= 60 - 1e-9) body.bleeding = false; }
        if (pain) { body.treatment.pain = Math.min(60, body.treatment.pain + treatmentSpeed * used); if (body.treatment.pain >= 60 - 1e-9) body.effects.pain = 0; }
        if (fatigue) { body.treatment.injectionFatigue = Math.min(120, body.treatment.injectionFatigue + treatmentSpeed * used); if (body.treatment.injectionFatigue >= 120 - 1e-9) body.effects.injectionFatigue = 0; }
        base.restSeconds = Math.min(120, base.restSeconds + used); advanceEffects(state, used);
        if (body.stamina >= 25) body.exhausted = false;
        seconds -= used;
    }
    if (!base.energizedGranted && base.restSeconds >= restNeeded && body.hp >= derivedLimits(state).hp * .8 && body.mental >= 70 && body.water >= 80 && body.satiety >= 80 && !body.bleeding) {
        body.effects.energized = 600; base.energizedGranted = true;
    }
}
export function advanceRealTime(state: ExpansionState, now: number): void {
    const seconds = Math.max(0, now - state.base.cursor) / 1000;
    if (state.base.location === 'base') advanceBaseRecovery(state, seconds);
    advanceProduction(state.base, now);
}
/** Active practice only: real displacement, with the shared persisted ten-minute cap. */
export function practice(state: ExpansionState, attribute: Attribute, from: Point, to: Point, seconds: number, now: number): boolean {
    if (!state.base.facilities.training || state.base.location !== 'base' || !['strength', 'constitution', 'technique'].includes(attribute) || separation(from, to) < .01 || seconds <= 0 || seconds > .25) return false;
    const training = state.base.training;
    if (now - training.startedAt >= 600000) { training.startedAt = now; training.quantity = 0; training.activeSeconds = 0; training.credited = { strength: 0, constitution: 0, technique: 0 }; }
    if (training.quantity >= 1) return false;
    training.attribute = attribute; training.activeSeconds += seconds;
    if (training.activeSeconds >= 120 - 1e-9) {
        training.activeSeconds = Math.max(0, training.activeSeconds - 120);
        const quantity = Math.min(1 - training.quantity, .25 * trainingEfficiency(state)); training.quantity += quantity;
        training.credited[attribute] += .2 * quantity; addProgress(state, attribute, .2 * quantity);
    }
    return true;
}
