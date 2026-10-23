/**
 * Player-facing text of the attribute perks and the static critical display (docs/CRITICAL-PERK-DESIGN.md sections
 * 2.3, 3 and 5), and the view models both base screens draw from it: the yard's body panel (station-view) and the old
 * tab page (ui.ts). Every perk display string lives here. It is UI copy, kept out of the pure rule modules: the numbers
 * come from perks.ts, and the board, the previews and the refusals from the HideoutRuntime.
 */
import * as D from './domain';
import { addPerk, critBreakdown, critSources, perkModifiers, perkNode, removeAttributePerks, type CritSourceId, type PerkId, type PerkModifiers, type PerkTier } from './perks';
import type { Attribute, FailReason, HideoutSnapshot, PerkBlock, PerkBoard, PerkChoicePreview, PerkResetPreview } from './hideout-runtime/contract';

export const ATTRIBUTE_NAMES: Readonly<Record<Attribute, string>> = { strength: '力量', constitution: '体质', technique: '技巧' };
/** The fixed lines of the board and of the preview dialogs, the same on both screens. */
export const PERK_UI = {
    title: 'Perk 选择', hint: '永久等级 15、20、25、30 各开一档，每档二选一', switcher: 'Perk 属性', resetHint: '不降低等级；已解锁的档位可以重新选择。',
    choiceDialog: '选择 Perk', resetDialog: '重置 Perk', cancel: '取消',
} as const;

/** Name, one short effect line with the design number, and what the perk leaves alone (shown before confirming). */
export const PERK_TEXT: Readonly<Record<PerkId, { name: string; effect: string; note?: string }>> = {
    'strength-15-a': { name: '负重行家', effect: '负重上限 +4 kg', note: '只加重量上限，不增加背包格位。' },
    'strength-15-b': { name: '长途奔袭', effect: '冲刺耐力消耗 ×0.88', note: '按冲刺的全部耐力消耗计算，含超重的额外消耗。' },
    'strength-20-a': { name: '重装步伐', effect: '超重移动惩罚 ×0.70', note: '只减轻超重时的减速；超重额外消耗的耐力不变。' },
    'strength-20-b': { name: '耐力储备', effect: '耐力上限 +20' },
    'strength-25-a': { name: '近身猛击', effect: '匕首伤害 ×1.20', note: '只影响匕首。' },
    'strength-25-b': { name: '快速回气', effect: '行动中自然耐力恢复 ×1.20', note: '不放大食品、净水补的耐力，也不放大基地恢复。' },
    'strength-30-a': { name: '搬运大师', effect: '负重上限 +6 kg', note: '只加重量上限，不增加背包格位。' },
    'strength-30-b': { name: '持久奔袭', effect: '冲刺耐力消耗 ×0.82', note: '按冲刺的全部耐力消耗计算，含超重的额外消耗。' },
    'constitution-15-a': { name: '强健体魄', effect: '生命上限 +20' },
    'constitution-15-b': { name: '医疗适应', effect: '绷带、急救包回血 ×1.20', note: '食品、设施和自然恢复不变，治疗训练上限也不变。' },
    'constitution-20-a': { name: '凝血体质', effect: '敌人攻击致流血概率 ×0.70', note: '流血概率由 18% 降到 12.6%；流血造成的持续伤害不变。' },
    'constitution-20-b': { name: '补给吸收', effect: '净水补水分、食品补饱食 ×1.25', note: '食品回血、回耐力，净水回耐力、除污染都不变。' },
    'constitution-25-a': { name: '耐污体质', effect: '环境污染增加 ×0.80', note: '离水减污染和药品除污染不变。' },
    'constitution-25-b': { name: '稳定心神', effect: '精神自然损耗与受击损失 ×0.75', note: '疼痛触发和后坐不受影响。' },
    'constitution-30-a': { name: '坚韧躯体', effect: '敌人直接攻击伤害 ×0.90', note: '流血、饥渴、污染等持续损血不减。' },
    'constitution-30-b': { name: '高效救护', effect: '绷带、急救包回血 ×1.30', note: '食品、设施和自然恢复不变，治疗训练上限也不变。' },
    'technique-15-a': { name: '屏息狙击', effect: '精瞄锁定目标时蓄力：独立暴击来源每秒增加 10 个百分点，最多 30%', note: '只对锁定的那个敌人有效；冲刺、换弹、受伤或换目标都会清空蓄力。' },
    'technique-15-b': { name: '压枪高手', effect: '枪械后坐力 ×0.80', note: '只减每发后坐，不改固有散布、射速和霰弹分布。' },
    'technique-20-a': { name: '致命直觉', effect: '独立 5% 暴击来源', note: '和其他来源独立合并，不是把百分比相加。' },
    'technique-20-b': { name: '熟练装填', effect: '换弹时间 ×0.85' },
    'technique-25-a': { name: '要害打击', effect: '暴击伤害倍率改为 1.7', note: '倍率只算一次，不另加爆头伤害；是否暴击仍随机判定。' },
    'technique-25-b': { name: '稳固握持', effect: '枪械后坐力 ×0.85', note: '只减每发后坐，不改固有散布、射速和霰弹分布。' },
    'technique-30-a': { name: '神射手', effect: '独立 10% 暴击来源', note: '和其他来源独立合并，不是把百分比相加。' },
    'technique-30-b': { name: '装填大师', effect: '换弹时间 ×0.80' },
};
/** What each modifier of perkModifiers changes: the scope a preview lists. */
const MODIFIER_LABEL: Readonly<Record<keyof PerkModifiers, string>> = {
    hp: '生命上限', stamina: '耐力上限', carry: '负重上限', sprintCost: '冲刺耐力消耗', staminaRecovery: '行动中自然耐力恢复',
    overweight: '超重移动惩罚', knifeDamage: '匕首伤害', heal: '绷带、急救包回血', bleedChance: '敌人攻击致流血概率',
    absorption: '净水补水分、食品补饱食', pollutionGain: '环境污染增加', mentalLoss: '精神自然损耗与受击损失', enemyDamage: '敌人直接攻击伤害',
    recoil: '枪械后坐力', reload: '换弹时间', crit: '独立暴击来源', critMultiplier: '暴击伤害倍率', breath: '屏息狙击蓄力',
};
const money = (cash: number) => `¥${cash.toLocaleString('en-US')}`;
/** Two to four decimals: 0.88, 0.68, 0.7216. */
const factor = (value: number) => value.toFixed(4).replace(/0{1,2}$/, '');
const limitText = (key: 'hp' | 'stamina' | 'carry', value: number) => key === 'carry' ? `${value.toFixed(1)} kg` : `${Math.round(value)}`;
/** A perk's own source chance as its copy writes it: 5%, 10%. */
const percent = (chance: number) => `${+(chance * 100).toFixed(2)}%`;

/** What the static display reads: the gun in hand, effective technique (doses included), the focus drug and the selection. */
export interface CritContext { technique: number; weapon: string | null; focus: boolean; perks: readonly PerkId[] }
/** The perks a board shows as chosen, in catalog order. */
const chosenPerks = (board: PerkBoard): PerkId[] => Object.values(board.attributes).flatMap(a => a.reset.chosen);
export function critContext(s: HideoutSnapshot, board: PerkBoard): CritContext {
    return { technique: s.body.attributes.technique.effective, weapon: s.profile.equipment.weapon, focus: s.body.effects.some(e => e.name === 'focus'), perks: chosenPerks(board) };
}
export interface CritView {
    /** The gun's name, or the not-applicable line for the knife or an empty hand. */
    title: string;
    /** The combined static chance ("9.84%", "<100%"), or null when not applicable. */
    total: string | null;
    /** One row per independent source, each with its own chance. */
    rows: { label: string; text: string }[];
    notes: string[];
}
const sourceLabel = (id: CritSourceId, ctx: CritContext, gun: string) =>
    id === 'character' ? `角色 · 技巧 ${ctx.technique}` : id === 'weapon' ? gun : id === 'focus' ? '专注剂' : PERK_TEXT[id].name;
/** The gun's combined chance before any breath charge (spec 2.3): breath counts only in a raid, on its target. */
const gunChance = (ctx: CritContext, perks: readonly PerkId[]) => {
    const sources = critSources({ technique: ctx.technique, weapon: ctx.weapon ? D.WEAPONS[ctx.weapon] ?? null : null, perks, focus: ctx.focus, breath: 0 });
    return sources && critBreakdown(sources);
};
/** The static critical display of the base panels (spec 2.3): two decimals, "<100%", every source on its own row. */
export function critView(ctx: CritContext): CritView {
    const breakdown = gunChance(ctx, ctx.perks);
    if (!breakdown) return { title: '枪械暴击：不适用', total: null, rows: [], notes: ['没有装备枪械；匕首不随机暴击。'] };
    const gun = D.WEAPONS[ctx.weapon!].name, m = perkModifiers(ctx.perks);
    return { title: `枪械暴击 · ${gun}`, total: breakdown.text,
        rows: breakdown.sources.map(s => ({ label: sourceLabel(s.id, ctx, gun), text: `独立 ${s.text} 暴击来源` })),
        notes: ['合计 = 1 − 各来源“不暴击”的概率相乘，不是把百分比相加。', `暴击伤害 ×${m.critMultiplier}${ctx.perks.includes('technique-25-a') ? '（要害打击）' : ''}`,
            ...m.breath ? ['屏息狙击另计：局内精瞄锁定目标时蓄力，独立来源最多 30%。'] : []] };
}

/** One candidate card: open (can be previewed), chosen, the other side of a chosen node, or locked below its level. */
export interface PerkCardView { id: PerkId; name: string; effect: string; state: 'open' | 'chosen' | 'other' | 'locked'; status: string; enabled: boolean }
export interface PerkPanelView {
    attribute: Attribute; name: string;
    /** The three attribute switches: permanent level, chosen and still open nodes. */
    tabs: { attribute: Attribute; name: string; detail: string }[];
    /** Why nothing can change now, or null. */
    blocked: string | null;
    tiers: { tier: PerkTier; cards: PerkCardView[] }[];
    reset: { label: string; enabled: boolean; reason: string | null };
}
function blockText(block: PerkBlock, name: string, cost: number, cash: number): string {
    switch (block.reason) {
        case 'no-effect': return `${name}还没有已选的 Perk。`;
        case 'funds': return `现金不足：重置需要 ${money(cost)}，现有 ${money(cash)}。`;
        case 'storage': return '上次的更改还没写入存档：请先重试保存或导出备份。';
        case 'conflict': return '存档已由另一个窗口接管，本页不能更改 Perk。';
        case 'locked': return '出击准备、行动中或结算还没保存时不能更改 Perk。';
        default: return '现在不能更改 Perk。';
    }
}
/** The attribute a panel opens on: the first with a node waiting to be chosen, else strength. */
export function defaultPerkAttribute(board: PerkBoard): Attribute {
    return (Object.keys(board.attributes) as Attribute[]).find(a => board.attributes[a].nodes.some(n => n.status === 'open')) ?? 'strength';
}
export function perkPanel(board: PerkBoard, attribute: Attribute): PerkPanelView {
    const view = board.attributes[attribute], name = ATTRIBUTE_NAMES[attribute], blocked = board.blocked && blockText(board.blocked, name, view.reset.cost, view.reset.cash);
    const tiers = view.nodes.map(node => ({ tier: node.tier, cards: node.options.map((id): PerkCardView => {
        const { name: title, effect } = PERK_TEXT[id];
        if (node.status === 'locked') return { id, name: title, effect, state: 'locked', status: `永久${name} ${node.requires} 级解锁`, enabled: false };
        if (node.status === 'chosen') return node.id === id ? { id, name: title, effect, state: 'chosen', status: '已选择', enabled: false }
            : { id, name: title, effect, state: 'other', status: '重置本属性后才能改选', enabled: false };
        return { id, name: title, effect, state: 'open', status: '', enabled: !board.blocked };
    }) }));
    const tabs = (Object.keys(board.attributes) as Attribute[]).map(a => {
        const nodes = board.attributes[a].nodes, open = nodes.filter(n => n.status === 'open').length;
        return { attribute: a, name: ATTRIBUTE_NAMES[a], detail: `${board.attributes[a].permanent} 级 · 已选 ${board.attributes[a].reset.chosen.length}${open ? ` · 可选 ${open}` : ''}` };
    });
    const { reset } = view;
    return { attribute, name, tabs, blocked, tiers,
        reset: { label: `花费 ${money(reset.cost)} 重置${name}全部 Perk`, enabled: !reset.blocked, reason: reset.blocked && blockText(reset.blocked, name, reset.cost, reset.cash) } };
}

/**
 * A preview dialog: what is chosen or removed (`lines`), what the perk leaves alone (`note`), the values before and
 * after, and the rules to know before confirming.
 */
export interface PerkPreviewView { title: string; subtitle: string; lines: string[]; note: string | null; changes: string[]; notes: string[]; confirm: string }
const LIMITS = ['hp', 'stamina', 'carry'] as const;
/** Value changes of a choice or reset: limits, the other modifiers in its scope, and the gun's static chance. */
function changeLines(preview: PerkChoicePreview | PerkResetPreview, ctx: CritContext, after: readonly PerkId[]): string[] {
    const lines = LIMITS.filter(k => preview.limits[k].before !== preview.limits[k].after)
        .map(k => `${MODIFIER_LABEL[k]} ${limitText(k, preview.limits[k].before)} → ${limitText(k, preview.limits[k].after)}`);
    const { before: was, after: next } = preview.modifiers;
    for (const key of preview.scope) {
        if ((LIMITS as readonly string[]).includes(key)) continue;
        if (key === 'crit') {
            const gained = next.crit.filter(s => !was.crit.some(t => t.id === s.id)), lost = was.crit.filter(s => !next.crit.some(t => t.id === s.id));
            for (const s of gained) lines.push(`新增一个独立 ${percent(s.chance)} 暴击来源（${PERK_TEXT[s.id as PerkId].name}）`);
            for (const s of lost) lines.push(`移除独立 ${percent(s.chance)} 暴击来源（${PERK_TEXT[s.id as PerkId].name}）`);
            const before = gunChance(ctx, ctx.perks), later = gunChance(ctx, after);
            lines.push(before && later ? `${D.WEAPONS[ctx.weapon!].name}暴击 ${before.text} → ${later.text}` : '装备枪械后计入；匕首不随机暴击。');
        } else if (key === 'critMultiplier') lines.push(`${MODIFIER_LABEL[key]} ${was.critMultiplier} → ${next.critMultiplier}`);
        else if (key === 'breath') lines.push(next.breath ? '屏息狙击：局内精瞄锁定目标时可以蓄力' : '屏息狙击：不再蓄力');
        else lines.push(`${MODIFIER_LABEL[key]} ×${factor(was[key])} → ×${factor(next[key])}`);
    }
    return lines;
}
export function choicePreview(preview: PerkChoicePreview, ctx: CritContext): PerkPreviewView {
    const text = PERK_TEXT[preview.id], name = ATTRIBUTE_NAMES[preview.attribute];
    const kept = (['hp', 'stamina'] as const).filter(k => preview.limits[k].after > preview.limits[k].before)
        .map(k => `当前${k === 'hp' ? '生命' : '耐力'} ${Math.floor(preview.body[k].after)} 不变：上限提高不会补满，之后照常恢复。`);
    return { title: `选择「${text.name}」`, subtitle: `${name} ${preview.tier} 级 · 二选一`, lines: [text.effect], note: text.note ?? null,
        changes: changeLines(preview, ctx, addPerk(ctx.perks, preview.id)),
        notes: [...kept, '选择免费，写入存档后生效。', `选定后，只有花费 ¥500 重置${name}全部 Perk 才能改选。`], confirm: '确认选择' };
}
export function resetPreview(preview: PerkResetPreview, ctx: CritContext): PerkPreviewView {
    const name = ATTRIBUTE_NAMES[preview.attribute];
    const cuts = (['hp', 'stamina'] as const).filter(k => preview.body[k].after < preview.body[k].before)
        .map(k => `当前${k === 'hp' ? '生命' : '耐力'} ${Math.floor(preview.body[k].before)} → ${Math.floor(preview.body[k].after)}（裁去超出新上限的部分，不算受伤，也不计训练）`);
    return { title: `重置${name} Perk`, subtitle: `费用 ${money(preview.cost)}`,
        lines: [`现金 ${money(preview.cash.before)} → ${money(preview.cash.after)}`, `移除：${preview.removed.map(id => `${PERK_TEXT[id].name}（${perkNode(id).tier} 级）`).join('、')}`], note: null,
        changes: [...changeLines(preview, ctx, removeAttributePerks(ctx.perks, preview.attribute)), ...cuts],
        notes: [`不降低永久等级和训练进度，其他属性的 Perk 保留。`, '重置后已解锁的档位可以重新免费选择；重新选择不会补满生命或耐力。', '扣款、移除和上限裁切一起写入存档，写入成功才生效。'],
        confirm: `支付 ${money(preview.cost)} 并重置` };
}
/**
 * Why a preview or a confirm did not happen. `kept`: this very change failed to write and waits for retrySave, which
 * commits it once; otherwise a storage refusal came from an earlier unsaved write and this change was not kept.
 */
export function perkFailure(reason: FailReason, kind: 'choice' | 'reset', kept = false): string {
    switch (reason) {
        case 'stale': return '情况已有变化，这次确认没有生效。请重新查看后再确认。';
        case 'storage': return kept ? kind === 'choice' ? '存档没有写入：这次选择保留在本页，重试保存成功后才生效。' : '存档没有写入：重置保留在本页，重试保存成功后才扣款并生效。'
            : '上次的更改还没写入存档，这次没有生效。请先重试保存或导出备份。';
        case 'conflict': return '存档已由另一个窗口接管，这次更改没有生效。';
        case 'funds': return '现金不足 ¥500，没有重置，也没有扣款。';
        case 'no-effect': return '本属性没有已选的 Perk，没有扣款。';
        case 'locked': return '现在不能更改 Perk（出击准备、行动中、结算还没保存或等级不足），这次没有生效。';
        default: return '这次更改不符合规则，没有生效。';
    }
}
/** The toast after a successful write, and the name a waiting retry reports once it has written the change. */
export const perkDone = (kind: 'choice' | 'reset', subject: string) => kind === 'choice' ? `已选择「${PERK_TEXT[subject as PerkId].name}」，已写入存档。` : `已重置${ATTRIBUTE_NAMES[subject as Attribute]} Perk，支付 ¥500。`;
export const perkPendingName = (kind: 'choice' | 'reset', subject: string) => kind === 'choice' ? `「${PERK_TEXT[subject as PerkId].name}」` : `${ATTRIBUTE_NAMES[subject as Attribute]} Perk 重置`;
/** The storage dialog or alarm while that change waits, and the toast once the retry wrote it. */
export const perkWaiting = (pending: string) => `${pending}没能写入存档，还没有生效；它保留在本页，重试保存成功后才生效，导出的备份也包含它。`;
export const perkRetried = (pending: string) => `已重新保存，${pending}已生效。`;
