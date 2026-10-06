import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, SESSION_KEY } from '../src/recovery-store';
import { buildFacility, enqueueProduction, claimProduction } from '../src/base';
import { applyAward } from '../src/reputation-luck';
import { changeLayer } from '../src/layer-transition';
import { MALL_WORLD } from '../src/mall-world';
import { decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';

function fixture(bytes?: string) {
    const data = new Map<string, string>(); if (bytes) data.set(SESSION_KEY, bytes);
    let deny = false;
    const storage: D.StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key,value) => { if (deny) throw new Error('quota'); data.set(key,value); } };
    const state = createSessionState(), session = new SaveSession(state, () => storage);
    assert.equal(session.initialize(), true); state.state = 'hideout';
    return { state, session, deny(value: boolean) { deny = value; }, get bytes() { return data.get(SESSION_KEY)!; } };
}
function rpg() { const f = fixture(); assert.equal(f.session.enableRpg(), true); return f; }
test('明确落格保留的战利品在安全箱、背包或仓库中跨同种子商场/居民楼出击，生成身份不冲突', () => {
    for (const destination of ['safe', 'bag', 'stash'] as const) for (const nextWorld of [true, 'mall'] as const) {
        const f = rpg(); assert.equal(f.session.beginRun(41, 'mall'), true); f.state.state = 'run'; let retained = '';
        const collect = f.session.prepareExpansionMutation(d => {
            const raid = d.expansion.raid!, box = raid.maps['mall-f1'].containers[0], item = box.inventory.items[0], target = destination === 'bag' ? raid.loadout.bag : raid.loadout.safe;
            retained = item.uid;
            for (let y = 0; y < target.h; y++) for (let x = 0; x < target.w; x++) if (D.fits(target, item.id, x, y)) return D.transferItem(box.inventory, target, item.uid, x, y);
            return false;
        }); assert.ok(collect); assert.equal(f.session.commitExpansionMutation(collect), 'committed');
        assert.equal(f.session.prepareSettlement('extract', 0), true); assert.equal(f.session.retrySettlement(), true); f.state.state = 'hideout';
        if (destination === 'stash') {
            const move = f.session.prepareExpansionMutation(d => { const item = d.profile.safe.items.find(i => i.uid === retained)!;
                for (let y = 0; y < d.profile.stash.h; y++) for (let x = 0; x < d.profile.stash.w; x++) if (D.fits(d.profile.stash, item.id, x, y)) return D.transferItem(d.profile.safe, d.profile.stash, retained, x, y);
                return false;
            }); assert.ok(move); assert.equal(f.session.commitExpansionMutation(move), 'committed');
        }
        assert.equal(f.session.beginRun(41, nextWorld), true); const record = decodeSession(f.bytes);
        const inventory = destination === 'stash' ? record.profile.stash : record.expansion!.raid!.loadout[destination];
        assert.ok(inventory.items.some(i => i.uid === retained));
        assert.ok(Object.values(record.expansion!.raid!.maps).every(m => m.loot.every(i => i.uid !== retained) && m.containers.every(c => c.inventory.items.every(i => i.uid !== retained))));
    }
});
test('基地设施候选失败不扣钱和材料，重试同一票据只扣一次并保留升级前恢复速率', () => {
    const f = rpg(); D.addItem(f.state.save.stash, 'scrap', 1); assert.equal(f.session.persist(), true);
    const before = f.bytes, cash = f.state.save.cash, ticket = f.session.prepareExpansionMutation(d => buildFacility(d.profile,d.expansion,'rest'))!;
    f.deny(true); assert.equal(f.session.commitExpansionMutation(ticket), 'save-failed'); assert.equal(f.bytes,before); assert.equal(f.state.save.cash,cash); assert.equal(f.state.expansion!.base.facilities.rest,0);
    f.deny(false); assert.equal(f.session.commitExpansionMutation(ticket),'committed'); assert.equal(f.state.save.cash,cash-200); assert.equal(f.state.expansion!.base.facilities.rest,1); assert.equal(f.session.commitExpansionMutation(ticket),'rejected');
});
test('通用多阵营奖励、永久属性和幸运在失败后整体回滚，重试及重复交付不叠加', () => {
    const f = rpg(); D.addItem(f.state.save.stash,'wire',1); assert.equal(f.session.persist(),true);
    const award = {id:'specified-award',cash:320,needs:[{id:'wire',qty:1}],reputation:{a:15,b:-5},attributes:['strength'] as const,luck:1 as const};
    const before=f.bytes, ticket=f.session.prepareExpansionMutation(d=>applyAward(d.profile,d.expansion,{...award,attributes:[...award.attributes]}))!;
    f.deny(true); assert.equal(f.session.commitExpansionMutation(ticket),'save-failed');assert.equal(f.bytes,before);assert.equal(f.state.expansion!.growth.permanent.strength,10);
    f.deny(false);assert.equal(f.session.commitExpansionMutation(ticket),'committed');assert.equal(f.state.expansion!.growth.permanent.strength,11);assert.deepEqual(f.state.expansion!.growth.reputation,{a:15,b:-5});assert.equal(f.state.expansion!.growth.luck,2);
    assert.equal(f.session.prepareExpansionMutation(d=>applyAward(d.profile,d.expansion,{...award,attributes:[...award.attributes]})),null);
});
test('生产出击后推进、活动局不离线回血；楼层和成品同票据提交，失败重试不重抽', () => {
    const f = rpg();const setup=f.session.prepareExpansionMutation(d=>{d.profile.quests.repair=true;d.expansion.base.facilities.workbench=1;D.addItem(d.profile.stash,'cloth',2);assert.equal(enqueueProduction(d.profile,d.expansion,'bandage'),true);d.expansion.body.hp=35;})!;
    assert.equal(f.session.commitExpansionMutation(setup),'committed');assert.equal(f.session.beginRun(42,'mall'),true);f.state.state='run';
    const move=f.session.prepareExpansionMutation(d=>{d.expansion.raid!.player={...MALL_WORLD.maps['mall-f1'].entries[1].at,rotation:0};d.expansion.base.cursor-=601000;})!;assert.equal(f.session.commitExpansionMutation(move),'committed');
    const before=f.bytes,hp=f.state.expansion!.body.hp,ticket=f.session.prepareExpansionMutation(d=>changeLayer(d.expansion,MALL_WORLD,'S-N-up'))!;
    f.deny(true);assert.equal(f.session.commitExpansionMutation(ticket),'save-failed');assert.equal(f.bytes,before);
    f.deny(false);assert.equal(f.session.commitExpansionMutation(ticket),'committed');assert.equal(f.state.expansion!.raid!.currentMap,'mall-f2');assert.equal(f.state.expansion!.base.completed.length,1);assert.equal(f.state.expansion!.body.hp,hp);assert.equal(f.state.expansion!.base.queue.length,0);
    const reopened=fixture(f.bytes);assert.equal(reopened.state.expansion!.raid!.currentMap,'mall-f2');assert.equal(reopened.state.expansion!.base.completed.length,1);assert.equal(reopened.state.expansion!.body.hp,hp);
});
test('死亡、超时、放弃保持成长与安全箱；只有死亡设置低值身体，待结算不开始基地恢复', () => {
    for(const reason of ['death','timeout','abandon'] as const){
        const f=rpg();D.addItem(f.state.save.safe,'pearl',1);assert.equal(f.session.persist(),true);assert.equal(f.session.beginRun(42,'mall'),true);f.state.state='run';
        const prepare=f.session.prepareExpansionMutation(d=>{d.expansion.body.hp=31;d.expansion.raid!.training.quantity.strength=1;})!;assert.equal(f.session.commitExpansionMutation(prepare),'committed');
        assert.equal(f.session.prepareSettlement(reason,0),true);const growth=f.state.pendingExpansion!.growth.progress.strength;assert.ok(growth>=.2);assert.equal(f.state.pendingExpansion!.body.hp,reason==='death'?1:31);
        f.deny(true);assert.equal(f.session.retrySettlement(),false);assert.equal(f.state.pendingExpansion!.base.location,'settlement');const backup=decodePortableBackup(encodeRecoveryBackup(f.session.backupRecord()!));assert.equal(backup.kind,'session');
        f.deny(false);assert.equal(f.session.retrySettlement(),true);assert.equal(f.state.expansion!.growth.progress.strength,growth);assert.equal(D.count(f.state.save.safe,'pearl'),1);assert.equal(f.session.retrySettlement(),false);
    }
});
test('旧库存海珠不自动开放黑市；成功带回普通海珠的凭据独立保存且不再扣第二份', () => {
    const f=rpg();D.addItem(f.state.save.safe,'pearl',1);assert.equal(f.session.persist(),true);assert.equal(f.state.expansion!.base.extractedPearl,false);
    assert.equal(f.session.beginRun(42,'mall'),true);f.state.state='run';assert.equal(f.session.prepareSettlement('extract',0),true);assert.equal(f.session.retrySettlement(),true);assert.equal(f.state.expansion!.base.extractedPearl,true);
    f.state.state='hideout';const t=f.session.prepareExpansionMutation(d=>{d.profile.cash=1000;d.profile.quests.repair=true;return buildFacility(d.profile,d.expansion,'blackmarket');})!;assert.equal(f.session.commitExpansionMutation(t),'committed');assert.equal(D.count(f.state.save.safe,'pearl'),0);assert.equal(f.state.expansion!.base.facilities.blackmarket,1);
});
test('扩展v2未知字段、重复护符UID、未声明敌弹来源与损坏事件拒绝，不改变原始字节', () => {
    const f=rpg();assert.equal(f.session.beginRun(42,'mall'),true);const before=f.bytes;
    for(const mutate of [(r:any)=>delete r.expansion.charm,(r:any)=>r.expansion.awards=['a','a'],(r:any)=>r.expansion.raid.mapEvent='future',(r:any)=>r.expansion.raid.shockAt=1,
        (r:any)=>{const item=r.expansion.raid.maps['mall-f1'].containers[0].inventory.items[0];r.expansion.charm={uid:item.uid,id:'luckyCharm',qty:1,x:0,y:0};},
        (r:any)=>r.expansion.raid.maps['mall-f1'].bullets.push({uid:`entity-${r.expansion.raid.nextEntity++}`,x:144,y:336,rotation:0,vx:100,vy:0,left:32,damage:10,enemy:true})]){
        const record=JSON.parse(before);mutate(record);assert.throws(()=>decodeSession(JSON.stringify(record)));assert.equal(f.bytes,before);
    }
});
