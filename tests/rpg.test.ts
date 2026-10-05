import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { newExpansion, derivedLimits } from '../src/expansion-state';
import { shortage, trainingYield, advanceEffects, rpgMultipliers, advanceRaidBody, creditTraining, recordMotion, enemyDamage, useRpgItem, criticalChance } from '../src/rpg';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const raid = () => { const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world); state.raid!.version = 2; state.raid!.shockAt = -10; state.raid!.mapEvent = 'none'; state.raid!.maps.downstairs.bullets = []; return state; };

test('精神/缺水/饥饿30、10、0与污染40、70、70+边界不受显示取整影响', () => {
    assert.equal(shortage(30), 0); assert.equal(shortage(10), 1); assert.equal(shortage(0), 2);
    const state = raid();
    state.body.pollution = 40; close(rpgMultipliers(state).recovery, 1);
    state.body.pollution = 70; close(rpgMultipliers(state).recovery, .8);
    state.body.pollution = 100; close(rpgMultipliers(state).recovery, .6);
    state.body.water = 0; state.body.satiety = 0; state.body.mental = 0; state.body.pollution = 0;
    advanceRaidBody(state, 1, false, 0, false); close(state.body.hp, 99.25);
    state.body.water = 1; state.body.satiety = 1; advanceRaidBody(state, 1, false, 0, false); close(state.body.hp, 99.25);
});

test('十分钟基础消耗与体质保护吻合，污染恢复与直接损血不被体质削弱', () => {
    for (const [constitution, values] of [[10, [91, 76, 85]], [20, [91.9, 78.4, 86.5]]] as const) {
        const state = raid(); state.growth.permanent.constitution = constitution;
        advanceRaidBody(state, 600, false, 0, false);
        close(state.body.mental, values[0]); close(state.body.water, values[1]); close(state.body.satiety, values[2]);
    }
    const state = raid(); state.body.pollution = 80; state.growth.permanent.constitution = 30;
    advanceRaidBody(state, 1, false, 0, false); close(state.body.pollution, 79.8); close(state.body.hp, 98.812);
});

test('强化不补满，到期裁切不计损伤；针剂结束疲劳按剩余时间推进，镇痛不止血', () => {
    const state = newExpansion(0); state.body.stamina = 80; state.body.effects.strength = 180;
    assert.equal(derivedLimits(state).stamina, 110); assert.equal(state.body.stamina, 80);
    state.body.stamina = 110; advanceEffects(state, 180);
    assert.equal(state.body.stamina, 100); assert.equal(state.body.effects.injectionFatigue, 120);
    advanceEffects(state, 119); assert.equal(state.body.effects.injectionFatigue, 1);
    state.body.effects.pain = 60; state.body.bleeding = true;
    close(rpgMultipliers(state).movement, .9); state.body.effects.analgesia = 180;
    close(rpgMultipliers(state).movement, 1); assert.equal(state.body.bleeding, true);
});

test('训练递减、余数、硬上限与重复提交差额不会重复增长', () => {
    close(trainingYield(1), .2); close(trainingYield(3), .4); close(trainingYield(4), .41); close(trainingYield(999), .45);
    const state = raid(), training = state.raid!.training;
    state.growth.progress.technique = .8; training.quantity.technique = 1;
    creditTraining(state, training); assert.equal(state.growth.permanent.technique, 11); close(state.growth.progress.technique, 0);
    creditTraining(state, training); assert.equal(state.growth.permanent.technique, 11);
    training.quantity.technique = 3; creditTraining(state, training); close(state.growth.progress.technique, .2);
    state.growth.permanent.technique = 30; state.growth.progress.technique = .9; creditTraining(state, training); close(state.growth.progress.technique, 0);
});

test('顶墙不训练，两个地块内往返每60秒最多15秒；实际路线推进和耐力可计量', () => {
    const state = raid(), training = state.raid!.training;
    recordMotion(state, { x: 48, y: 48 }, { x: 48, y: 48 }, 5, 120, 24); assert.equal(training.quantity.strength, 0);
    for (let i = 0; i < 60; i++) { state.raid!.elapsed = i; recordMotion(state, { x: i % 2 ? 80 : 48, y: 48 }, { x: i % 2 ? 48 : 80, y: 48 }, 1, 24, 24); }
    close(training.quantity.strength, 15 / 180); close(training.quantity.constitution, 15 * 24 / 600);
    state.raid!.elapsed = 60; recordMotion(state, { x: 48, y: 48 }, { x: 80, y: 48 }, 1, 24, 24);
    close(training.quantity.strength, 16 / 180);
    recordMotion(state, { x: 80, y: 48 }, Object.assign({ x: 176, y: 48 }, { rendererMethod: () => {} }), 1, 24, 24);
    assert.deepEqual(training.motion.anchor, { x: 176, y: 48 }); assert.doesNotThrow(() => structuredClone(state));
});

test('敌伤、合格治疗每敌每局50上限，环境伤/溢出/无效物品不提供训练', () => {
    const state = raid(); state.body.hp = 50;
    assert.equal(useRpgItem(state, 'medkit'), true); assert.equal(state.raid!.training.quantity.constitution, 0);
    enemyDamage(state, 40, 'enemy-0'); assert.equal(useRpgItem(state, 'medkit'), true);
    close(state.raid!.training.quantity.constitution, .8);
    enemyDamage(state, 40, 'enemy-0'); useRpgItem(state, 'medkit'); close(state.raid!.training.quantity.constitution, 1);
    assert.equal(useRpgItem(state, 'medkit'), false);
    state.body.water = 60; assert.equal(useRpgItem(state, 'water'), true); assert.equal(state.body.water, 100);
    assert.equal(useRpgItem(state, 'water'), false);
});

test('有效敌伤20触发疼痛，精神惊吓按全局十秒节流，不因换层重新开始', () => {
    const state = raid(); enemyDamage(state, 20, 'enemy-0'); assert.equal(state.body.effects.pain, 60); assert.equal(state.body.mental, 96);
    state.raid!.elapsed = 9; enemyDamage(state, 20, 'enemy-1'); assert.equal(state.body.mental, 96);
    state.raid!.elapsed = 10; enemyDamage(state, 20, 'enemy-1'); assert.equal(state.body.mental, 92);
});

test('暴击公式区分技巧和专注，不对中心命中作保证，最终最高25%', () => {
    close(criticalChance(10, 0), .02); close(criticalChance(10, .5), .06); close(criticalChance(10, 1), .1);
    close(criticalChance(20, 1, .05), .165); close(criticalChance(40, 1, .2), .25);
    close(criticalChance(15, 1, .05), .1575);
});
