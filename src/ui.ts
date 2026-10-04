import Phaser from 'phaser';
import * as D from './domain';
import { WORLD, WORLD_W, WORLD_H, generateRun } from './world';
import { SynthAudio } from './audio';
import { SURVIVAL } from './balance';
import { BACKUP_MAX_BYTES, decodeBackup, encodeBackup } from './save-backup';
import type { RaidScene } from './game';
export const audio = new SynthAudio();
export const app = {
    game: null as Phaser.Game | null,
    save: null as unknown as D.SaveDataV1,
    state: 'menu' as 'menu' | 'hideout' | 'run' | 'result',
    raid: null as RaidScene | null,
    loadout: null as D.RunLoadout | null,
    tab: 'gear', overlay: '', selected: '', selectedSource: '', seed: '',
    result: null as D.RunSummary | null, storageOK: true, recovery: false, conflict: false,
    pendingSettlement: null as D.SaveDataV1 | null,
    pendingImport: null as D.SaveDataV1 | null,
};
const ui = () => document.getElementById('ui')!;
export function toast(message: string) { const el = document.getElementById('toast')!; el.textContent = message; el.style.opacity = '1'; clearTimeout((toast as any).timer); (toast as any).timer = setTimeout(() => el.style.opacity = '0', 3300); }
export function persist(save: D.SaveDataV1 = app.save): boolean { if (app.conflict)
    return false; try {
    D.writeSave(localStorage, save);
    app.storageOK = true;
    return true;
}
catch {
    app.storageOK = false;
    toast('无法写入本地存档。请允许浏览器存储后再出击。');
    return false;
} }
export function initSave() { try {
    const raw = localStorage.getItem(D.SAVE_KEY);
    app.save = raw ? D.migrateSave(JSON.parse(raw)) : D.newSave();
    app.recovery = !!app.save.activeRun;
    D.recoverInterrupted(app.save);
    persist();
}
catch {
    app.save = D.newSave();
    persist();
} audio.setVolume(app.save.settings.volume); }
export function changeState(state: typeof app.state) { if (app.pendingSettlement) { setOverlay('save-error'); return; } app.state = state; app.overlay = ''; app.selected = ''; if (state === 'hideout') {
    const candidate = structuredClone(app.save);
    if (D.grantRelief(candidate) && persist(candidate)) app.save = candidate;
} app.game?.scene.getScenes(true).forEach(scene => app.game!.scene.stop(scene.scene.key)); app.game?.scene.start(({ menu: 'Menu', hideout: 'Hideout', run: 'Raid', result: 'Result' })[state]); render(); }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const btn = (label: string, action: string, cls = '', extra = '') => `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
export const weaponName = () => D.WEAPONS[app.loadout?.weapon || 'knife']?.name || '基础匕首';
function preparedWeight(){const s=app.save,w=D.WEAPONS[s.equipment.weapon||'knife'];return D.weight(s.bag)+D.weight(s.safe)+D.ITEMS.knife.weight+(s.equipment.weapon?D.ITEMS[s.equipment.weapon].weight:0)+(w.ammo?D.ITEMS[w.ammo].weight*s.equipment.ammo:0);}
const iconCache = new Map<string, string>();
function itemIcon(id: string) { let url = iconCache.get(id); if (!url && app.game?.textures.exists('item-' + id)) {
    const source = app.game.textures.get('item-' + id).getSourceImage() as HTMLCanvasElement;
    url = source.toDataURL();
    iconCache.set(id, url);
} return url ? `<img class="item-icon" alt="" src="${url}">` : ''; }
function inventory(source: string): D.Inventory { if (app.state === 'run')
    return source === 'safe' ? app.loadout!.safe : app.loadout!.bag; return app.save[source as 'stash' | 'bag' | 'safe']; }
function grid(inv: D.Inventory, source: string, cell = 39) { return `<div class="grid" data-grid="${source}" data-cell="${cell}" style="width:${inv.w * cell}px;height:${inv.h * cell}px;background-size:${cell}px ${cell}px">${inv.items.map(i => { const d = D.ITEMS[i.id]; return `<div tabindex="0" role="button" aria-label="${d.name} × ${i.qty}" title="${d.name} · ${d.weight}kg / 个" draggable="true" data-uid="${i.uid}" data-source="${source}" class="item ${app.selected === i.uid ? 'selected' : ''}" style="left:${i.x * cell + 2}px;top:${i.y * cell + 2}px;width:${d.w * cell - 3}px;height:${d.h * cell - 3}px">${itemIcon(i.id)}<span class="item-label ${i.relief ? 'relief' : ''}">${d.short || d.name}</span>${i.qty > 1 ? `<span class="qty">${i.qty}</span>` : ''}</div>`; }).join('')}${!inv.items.length ? '<div class="empty-hint">空</div>' : ''}</div>`; }
function details() { const item = app.selected ? inventory(app.selectedSource).items.find(i => i.uid === app.selected) : null; if (!item)
    return `<div class="details"><div class="eyebrow">FIELD NOTES / 01</div><h3 style="margin-top:14px">带走你需要的。<br>留下归来的位置。</h3><p class="small muted">点击物品查看详情。拖动物品整理背包；双击在仓库与背包间转移。</p><p class="small muted">安全箱里的物资会在死亡后保留。枪械必须先装备，备用弹药放进背包。</p>${app.save.reliefSupplies?.length ? btn('领取救济补给', 'relief') : ''}</div>`; const d = D.ITEMS[item.id]; return `<div class="details"><div class="eyebrow">ITEM / ${d.kind}</div><h3>${d.name}</h3><p>${d.description}</p><p class="small muted">${d.w} × ${d.h} 格 · ${(d.weight * item.qty).toFixed(2)} kg<br>数量 ${item.qty} · ${item.relief ? '救济物资 · 不可出售' : `回收价 ¥ ${d.sell * item.qty}`}</p>${app.state === 'run' ? `${D.WEAPONS[item.id] && item.id !== 'knife' && app.selectedSource === 'bag' ? btn('装备', 'equip-run') : ''}${['bandage', 'medkit', 'antidote', 'water', 'food'].includes(item.id) ? btn('使用', 'use') : ''}${btn(app.selectedSource === 'safe' ? '移至背包' : '放入安全箱', 'secure')}${btn('丢弃', 'drop', 'danger')}` : `${D.WEAPONS[item.id] && item.id !== 'knife' && app.selectedSource !== 'safe' ? btn('装备', 'equip') : ''}${btn(app.selectedSource === 'stash' ? '装进背包' : '收入仓库', 'transfer')}${app.selectedSource !== 'safe' ? btn('放入安全箱', 'secure') : btn('移至背包', 'secure')}${!item.relief ? btn('出售', 'sell') : ''}`}</div>`; }
export function render() {
    if (app.state === 'menu') {
        ui().innerHTML = `<div class="menu"><div class="eyebrow">BINCOV COUNTY · QUARANTINE ZONE</div><h1>逃离<br>滨科夫</h1><div class="subtitle">ESCAPE BINCOV</div><p class="intro">台风过后，海没有退去。<br>带上最后一匣子弹，穿过盐雾与封锁线。<br>找到补给，活着回到水产站。</p>${btn('进入水产站　 →', 'enter', 'primary')}<footer>单人撤离生存　/　像素垂直切片</footer>${btn('操作指南', 'help', 'text-button')}</div><div class="version">北纬 27° · 赤潮封锁第 17 天<br><br>BUILD　0.1.1<br><a class="repo-link" href="https://github.com/xuys2025/escape-bincov" target="_blank" rel="noopener noreferrer">GitHub · 反馈 / 参与开发 ↗</a></div>${overlayHtml()}`;
        bind();
        return;
    }
    if (app.state === 'hideout')
        renderHideout();
    if (app.state === 'run') {
        ui().innerHTML = `<div class="hud"><div class="hud-top"><div class="location"><div class="eyebrow">BINCOV / RESTRICTED COAST</div><strong id="zone">封锁区</strong><div class="small" id="tide">潮汐监测中</div></div><div class="timer"><strong id="timer">10:00</strong><small>封锁剩余时间</small></div></div><div id="radio" class="radio">水产站：信号接通。撤离点已标记在地图上，别等到最后一分钟。</div><div class="hud-bottom"><div class="vitals"><div class="vital-row"><span>生命体征</span><span id="hp">100 / 100</span></div><div class="bar"><i id="hpbar"></i></div><div class="vital-row"><span>耐力</span><span id="stamina">100</span></div><div class="bar stamina"><i id="staminabar"></i></div><div class="vital-row" style="margin-bottom:0"><span id="status">状态稳定</span><span id="weight">0 kg</span></div></div><div class="weapon-hud"><div class="eyebrow" id="gunname">${weaponName()}</div><div class="ammo" id="ammo">—</div><div class="small muted" id="reload">R 换弹　1 主武器　2 匕首</div></div></div><div class="keytips"><kbd>E</kbd>搜刮 / 撤离　<kbd>Tab</kbd>背包　<kbd>Q</kbd>治疗　<kbd>M</kbd>地图　<kbd>Esc</kbd>暂停</div><div id="interaction" class="interaction" style="display:none"></div><div id="warning"></div></div>${overlayHtml()}`;
        bind();
        if (app.raid?.player?.active) app.raid.updateHud();
        if (app.overlay === 'map')
            drawMap();
        return;
    }
    if (app.state === 'result') {
        const r = app.result;
        ui().innerHTML = `<div class="overlay"><div class="panel result"><div class="stamp">${r?.outcome === 'extract' ? 'TRANSMISSION RECEIVED' : 'SIGNAL LOST'} / 行动报告</div><h2>${r?.outcome === 'extract' ? '你回来了。' : r?.outcome === 'timeout' ? '封锁线关闭。' : '信号中断。'}</h2><p>${r?.outcome === 'extract' ? '盐雾在身后合拢。物资已带回水产站，装备仍在背包中。' : '携带物资遗失。安全箱已回收；水产站还有一盏灯为你亮着。'}</p><div class="stats"><div><strong>${r?.kills || 0}</strong><span>消灭威胁</span></div><div><strong>${r?.keptValue || 0}</strong><span>保留物资估值</span></div><div><strong>${app.save.stats.extracts} / ${app.save.stats.runs}</strong><span>累计撤离 / 出击</span></div></div>${btn('返回水产站　 →', 'return', 'primary')}</div></div>`;
        bind();
    }
}
function renderHideout() {
    const s = app.save;
    let body = '';
    if (app.tab === 'gear')
        body = `<div class="columns"><div><div class="section-title">物资仓库 <span>${s.upgraded ? '扩建储物架' : '基础储物架'}</span></div>${grid(s.stash, 'stash', 29)}</div><div><div class="section-title">行动背包 <span>总负重 ${preparedWeight().toFixed(1)} / ${SURVIVAL.carryLimit} kg</span></div>${grid(s.bag, 'bag', 38)}<div class="inv-help">双击转移 · 拖放整理 · 不可旋转</div></div><div style="width:85px;flex-shrink:0"><div class="section-title">安全箱</div>${grid(s.safe, 'safe', 38)}<div class="inv-help">死亡保留<br>2 × 2 格</div><div class="equip" style="margin-top:13px;display:block;padding:10px 7px"><span class="eyebrow">主武器</span><p style="font-size:11px">${D.WEAPONS[s.equipment.weapon || 'knife']?.name || '匕首'}</p>${s.equipment.weapon ? `<div class="inv-help">弹匣 ${s.equipment.ammo} 发</div>${btn('卸下', 'unequip', 'text-button')}` : ''}</div></div>${details()}</div>`;
    else if (app.tab === 'arms' || app.tab === 'med') {
        const merchant = D.MERCHANTS[app.tab];
        body = `<div class="section-title">${merchant.name} · ${merchant.subtitle}<span>${app.tab === 'arms' ? '“枪能响，路就还没断。”' : '“先止血，再说别的。”'}　·　购买物资收入仓库</span></div><div class="shop-grid">${merchant.stock.map(id => { const d = D.ITEMS[id], qty = D.buyQuantity(id); return `<div class="shop-card"><div><strong>${d.name}</strong><span class="small">${d.kind === 'ammo' ? '每包 ' + qty + ' 发' : '每份 1 件'}</span></div>${btn('¥ ' + d.buy * qty, 'buy', '', `data-id="${id}" ${s.cash < d.buy * qty ? 'disabled' : ''}`)}</div>`; }).join('')}</div><p class="small muted">出售物资：在「整备」中选择仓库物品。救济装备不可出售。</p>`;
    }
    else if (app.tab === 'quests') {
        body = `<div class="quests">${Object.entries(D.QUESTS).map(([id, q], i) => `<div class="quest"><div class="eyebrow">TRANSMISSION / 0${i + 1}</div><h3>${q.name}</h3><p>${q.description}</p><div class="small orange">报酬 ¥ ${q.reward}${id === 'repair' ? ' · 解锁储物架' : ''}</div>${s.quests[id] ? `<p style="color:#c5d797">✓ ${q.radio}</p>` : btn('提交物资', 'quest', '', `data-id="${id}"`)}</div>`).join('')}</div><p class="small muted">任务物资从仓库、整备背包与安全箱提交。样本与船册可以放进安全箱带回。</p>`;
    }
    else
        body = `<div class="columns"><div style="width:390px"><div class="eyebrow">ABANDONED FISHERY / HOME</div><h2 style="font-size:24px">一盏灯，一座水产站。</h2><p class="small muted">封锁第 17 天。旧制冰机停了，电台还在断续发声。<br>潮位在出击第 5 分钟翻转，广播提前 30 秒预警。<br>高架路与海堤始终可通行；涉水区域会积累污染。</p>${btn(s.upgraded ? '储物架已扩建' : `扩建储物架 · ¥ ${D.STASH_UPGRADE_COST}`, 'upgrade', '', s.upgraded ? 'disabled' : '')}<p class="small muted">需要先完成「${D.QUESTS.repair.name}」。仓库由 10 × 6 扩至 10 × 9。</p></div><div class="details"><h3>电台设置</h3><label class="small">音量 <span id="volume-label">${Math.round(s.settings.volume * 100)}%</span><input aria-label="音量" id="volume" type="range" min="0" max="1" step="0.05" value="${s.settings.volume}" style="width:100%"></label><p class="small muted">累计行动 ${s.stats.runs} 次<br>成功撤离 ${s.stats.extracts} 次<br>消灭威胁 ${s.stats.kills} 个</p>${btn('导出存档', 'export-save')}${btn('导入存档', 'import-save')}<input id="backup-file" type="file" accept=".json,application/json" hidden><p class="small muted">更换文件路径或网页地址前，请先备份。</p>${btn('操作指南', 'help')}${btn('返回主菜单', 'menu')}</div></div>`;
    ui().innerHTML = `<div class="panel hideout"><div class="topbar"><div class="eyebrow">SAFE HOUSE / 01</div><h2>废弃水产站</h2><div class="right"><span class="small muted">${s.quests.repair ? '电台已修复 · 信号稳定' : '应急供电 · 信号微弱'}</span><span class="cash">¥ ${s.cash.toLocaleString()}</span></div></div><nav class="tabs">${[['gear', '装备整备'], ['arms', '修理铺'], ['med', '卫生所'], ['quests', '无线电任务'], ['home', '水产站']].map(([id, name]) => btn(name, 'tab', app.tab === id ? 'active' : '', `data-id="${id}"`)).join('')}</nav><div class="content" ${s.upgraded && app.tab === 'gear' ? 'style="overflow-y:auto;height:342px"' : ''}>${body}</div><div class="bottom-bar"><div class="small muted">滨科夫沿海封锁区　<span class="orange">10 分钟 / 次</span><br>死亡将遗失背包和主武器，安全箱保留。</div><label class="small muted">行动种子 <input class="seed" aria-label="行动种子" id="seed" placeholder="随机" value="${esc(app.seed)}" maxlength="16"></label>${btn('出击　 →', 'deploy', 'primary')}</div></div>${overlayHtml()}`;
    bind();
}
function overlayHtml() {
    if (app.pendingSettlement)
        return `<div class="overlay"><div class="panel modal"><div class="eyebrow">SAVE NOT COMPLETED</div><h2>结算尚未保存</h2><p>行动已停止，结算物资保留在当前页面。</p><p>${app.conflict ? '另一个窗口已修改存档。请先下载本次结算备份，刷新后再从水产站导入。' : '浏览器暂时无法保存进度。请恢复存储后重试，或先下载本次结算备份。'}</p><p class="small orange">保存或备份完成前，请不要关闭或刷新页面。</p><div class="actions">${btn('重试保存', 'retry-save', 'primary', app.conflict ? 'disabled' : '')}${btn('下载结算备份', 'export-save')}</div><p class="small muted">备份包含本次结算，可在「水产站 → 导入存档」恢复。</p></div></div>`;
    if (app.overlay === 'import-save' && app.pendingImport)
        return `<div class="overlay"><div class="panel modal"><h2>导入这份存档？</h2><p>现金 ¥ ${app.pendingImport.cash} · 累计行动 ${app.pendingImport.stats.runs} 次</p><p>导入会覆盖当前浏览器的进度。建议先导出当前存档。</p><div class="actions">${btn('先导出当前存档', 'export-save')}${btn('确认导入', 'confirm-import', 'primary')}${btn('取消', 'close')}</div></div></div>`;
    if (!app.overlay)
        return '';
    if (app.overlay === 'inventory' && app.loadout)
        return `<div class="overlay" style="background:#06100e88"><div class="panel inventory-modal"><div class="section-title">行动背包 <span>整理物品时世界仍在运行 · Tab 关闭</span></div><div class="columns"><div>${grid(app.loadout.bag, 'bag', 48)}<div class="inv-help">总负重 ${app.raid?.carriedWeight().toFixed(1)} / ${SURVIVAL.carryLimit} kg　·　含装备与安全箱</div></div><div><div class="section-title">安全箱</div>${grid(app.loadout.safe, 'safe', 43)}<div class="inv-help">死亡后保留</div></div>${details()}</div>${btn('关闭背包', 'close', 'text-button')}</div></div>`;
    if (app.overlay === 'map')
        return `<div class="overlay"><div class="panel map-modal"><div class="section-title">滨科夫县沿海管制图 <span>M 关闭 · 时间继续流逝</span></div><canvas id="map" width="690" height="400"></canvas><div class="legend"><span>● 你的位置　 <span style="color:#d0df91">▣ 当前撤离点</span></span><span>深绿：永久通路　暗红：潮汐淹没区</span>${btn('关闭地图', 'close', 'text-button')}</div></div></div>`;
    if (app.overlay === 'pause')
        return `<div class="overlay"><div class="panel modal"><div class="eyebrow">RADIO SILENCE</div><h2>暂时隐蔽</h2><p>行动已暂停。关闭或刷新页面将按撤离失败结算。</p><label class="small">音量 <span id="volume-label">${Math.round(app.save.settings.volume * 100)}%</span><input id="volume" aria-label="音量" type="range" min="0" max="1" step="0.05" value="${app.save.settings.volume}"></label><div class="actions">${btn('继续行动', 'close', 'primary')}${btn('操作指南', 'help')}${btn('放弃行动', 'abandon', 'danger')}</div></div></div>`;
    if (app.overlay === 'abandon')
        return `<div class="overlay"><div class="panel modal"><h2>放弃这次行动？</h2><p>你会失去携带与搜到的物资。安全箱里的东西会保留。</p><div class="actions">${btn('继续隐蔽', 'pause', 'primary')}${btn('确认放弃', 'confirm-abandon', 'danger')}</div></div></div>`;
    return `<div class="overlay"><div class="panel modal" style="width:610px"><div class="eyebrow">FIELD MANUAL / 操作指南</div><h2>回来，才算带走。</h2><div class="help-grid">${[['W A S D', '移动'], ['鼠标', '瞄准'], ['左键 / 右键', '射击 / 精瞄'], ['Shift', '冲刺'], ['R', '换弹'], ['E', '拾取 / 阅读'], ['按住 E 3 秒', '撤离（绿色标记内）'], ['Q', '快捷治疗'], ['Tab', '背包（不暂停）'], ['M', '地图（不暂停）'], ['1 / 2', '主武器 / 匕首'], ['Esc', '暂停 / 关闭面板']].map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div><p>先在水产站整备，备用弹药放入背包。搜刮地上的黄色物资，沿永久高架路抵达绿色撤离点。站稳并按住 E，读条 3 秒即可回家。</p><p>潮汐翻转前会广播预警；涉水会积累污染。按 Q 优先止血，背包内可使用解毒剂。主动放弃、死亡、超时或刷新均会失去携带物资。</p>${btn('明白了', 'close', 'primary')}</div></div>`;
}
export function setOverlay(value: string) { app.overlay = app.pendingSettlement ? 'save-error' : value; app.selected = ''; render(); }
export function finish(outcome: 'extract' | 'death' | 'timeout') {
    if (app.state !== 'run' || !app.loadout || app.conflict || app.pendingSettlement) return;
    app.raid?.syncMagazine();
    const candidate = structuredClone(app.save);
    if (!D.settleRun(candidate, app.loadout, outcome, app.raid?.kills || 0)) return;
    app.pendingSettlement = candidate;
    app.raid?.lock();
    retrySettlement();
}
export function retrySettlement(): boolean {
    const candidate = app.pendingSettlement;
    if (!candidate) return false;
    if (!persist(candidate)) { setOverlay('save-error'); return false; }
    app.save = candidate;
    app.result = candidate.lastResult!;
    app.pendingSettlement = null;
    if (app.result.outcome === 'extract') audio.extract(); else audio.death();
    app.raid = null;
    app.loadout = null;
    changeState('result');
    return true;
}
export function exportSave() {
    try {
        const text = encodeBackup(app.pendingSettlement ?? app.save);
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `Escape-Bincov-save-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('已生成存档备份。请确认文件下载完成。');
    } catch (error) { toast(error instanceof Error ? error.message : '备份下载失败，请重试。'); }
}
export function importSave(candidate: D.SaveDataV1): boolean {
    if (app.state !== 'hideout' || app.pendingSettlement || candidate.activeRun || !persist(candidate)) return false;
    app.save = structuredClone(candidate);
    app.pendingImport = null;
    app.recovery = false;
    audio.setVolume(app.save.settings.volume);
    setOverlay('');
    toast('存档已导入并保存。');
    return true;
}
function selected() { return inventory(app.selectedSource).items.find(x => x.uid === app.selected); }
export function mutate(action: () => unknown, message = ''): boolean {
    if (app.conflict || app.pendingSettlement) return false;
    const before = structuredClone(app.save), carried = app.loadout ? structuredClone(app.loadout) : null;
    const raid = app.raid, vitals = raid ? { hp: raid.hp, stamina: raid.stamina, pollution: raid.pollution, bleeding: raid.bleeding } : null;
    const rollback = () => { app.save = before; app.loadout = carried; if (raid && vitals) Object.assign(raid, vitals); };
    let ok: unknown;
    try { ok = action(); } catch (error) { rollback(); throw error; }
    if (ok === false) { rollback(); toast('操作未完成：请检查现金、空间或所需物资。'); render(); return false; }
    if (app.state === 'run' && app.loadout) D.checkpointSafe(app.save, app.loadout.safe, app.loadout.runId);
    else D.grantRelief(app.save);
    if (!persist()) { rollback(); toast('保存失败，本次操作已撤回。请恢复浏览器存储后重试。'); render(); return false; }
    if (message) toast(message);
    app.selected = ''; render(); return true;
}
function bind() {
    ui().querySelectorAll<HTMLElement>('[data-action]').forEach(el => el.onclick = () => {
        const a = el.dataset.action!, id = el.dataset.id!;
        if (app.conflict && a !== 'export-save') {
            toast('存档已在另一窗口变更，请刷新此页继续。');
            return;
        }
        audio.start();
        audio.click();
        if (app.pendingSettlement && a !== 'export-save' && a !== 'retry-save') return;
        switch (a) {
            case 'retry-save': retrySettlement(); break;
            case 'export-save': exportSave(); break;
            case 'import-save': document.getElementById('backup-file')?.click(); break;
            case 'confirm-import': if (app.pendingImport) importSave(app.pendingImport); break;
            case 'enter':
                changeState('hideout');
                if (app.recovery) {
                    toast('上次行动信号中断，已按失败结算。安全箱保留。');
                    app.recovery = false;
                }
                break;
            case 'return':
                changeState('hideout');
                break;
            case 'menu':
                changeState('menu');
                break;
            case 'help':
                setOverlay('help');
                break;
            case 'close':
                setOverlay('');
                break;
            case 'pause':
                setOverlay('pause');
                break;
            case 'abandon':
                setOverlay('abandon');
                break;
            case 'confirm-abandon':
                finish('death');
                break;
            case 'tab':
                app.tab = id;
                app.selected = '';
                render();
                break;
            case 'deploy': {
                const cfg = generateRun(app.seed || Date.now());
                const before = structuredClone(app.save);
                app.loadout = D.beginRun(app.save, cfg.seed);
                if (!persist()) {
                    app.save = before;
                    app.loadout = null;
                    break;
                }
                app.game!.registry.set('runConfig', cfg);
                changeState('run');
                break;
            }
            case 'buy':
                mutate(() => D.buy(app.save, id, app.tab === 'arms' ? 'arms' : 'med'), '物资已收入仓库。');
                break;
            case 'quest':
                mutate(() => D.submitQuest(app.save, id), D.QUESTS[id].radio);
                break;
            case 'upgrade':
                mutate(() => D.upgradeStash(app.save), '储物架已扩建。');
                break;
            case 'unequip':
                mutate(() => D.unequip(app.save), '主武器已收入仓库。');
                break;
            case 'relief':
                mutate(() => D.grantRelief(app.save), '可容纳的救济补给已收入背包或仓库。');
                break;
            case 'sell':
                mutate(() => D.sell(app.save, app.selected), '交易完成。');
                break;
            case 'equip':
                mutate(() => D.equip(app.save, app.selected), '主武器已装备。');
                break;
            case 'equip-run':
                app.raid?.equipItem(app.selected);
                app.selected = '';
                render();
                break;
            case 'transfer': {
                const to = app.selectedSource === 'stash' ? 'bag' : 'stash';
                mutate(() => D.transferItem(inventory(app.selectedSource), inventory(to), app.selected), '物资已转移。');
                break;
            }
            case 'secure': {
                const to = app.selectedSource === 'safe' ? 'bag' : 'safe';
                mutate(() => D.transferItem(inventory(app.selectedSource), inventory(to), app.selected), '物资已转移。');
                break;
            }
            case 'use': {
                const i = selected();
                if (i) mutate(() => app.raid?.useItem(i.id, inventory(app.selectedSource)) ?? false);
                break;
            }
            case 'drop': {
                const i = selected();
                if (i && app.raid) {
                    const raid = app.raid;
                    if (mutate(() => { const inv = inventory(app.selectedSource); inv.items = inv.items.filter(x => x.uid !== i.uid); })) raid.drop(i);
                }
                break;
            }
        }
    });
    ui().querySelectorAll<HTMLElement>('[data-uid]').forEach(el => { el.onclick = () => { app.selected = el.dataset.uid!; app.selectedSource = el.dataset.source!; ui().querySelectorAll<HTMLElement>('[data-uid]').forEach(node => node.classList.toggle('selected', node.dataset.uid === app.selected)); const panel = ui().querySelector('.details'); if (panel)
        panel.outerHTML = details(); bind(); }; el.onkeydown = e => { if (e.key === 'Enter')
        el.click(); }; el.ondblclick = () => { if (app.state !== 'hideout' || app.conflict)
        return; const from = el.dataset.source!; mutate(() => D.transferItem(inventory(from), inventory(from === 'stash' ? 'bag' : 'stash'), el.dataset.uid!)); }; el.ondragstart = e => { e.dataTransfer!.setData('text/plain', JSON.stringify({ uid: el.dataset.uid, source: el.dataset.source })); e.dataTransfer!.effectAllowed = 'move'; }; });
    ui().querySelectorAll<HTMLElement>('[data-grid]').forEach(el => { el.ondragover = e => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; }; el.ondrop = e => { e.preventDefault(); if (app.conflict)
        return; try {
        const d = JSON.parse(e.dataTransfer!.getData('text/plain'));
        const cell = Number(el.dataset.cell), r = el.getBoundingClientRect(), scale = r.width / el.offsetWidth, x = Math.floor((e.clientX - r.left) / scale / cell), y = Math.floor((e.clientY - r.top) / scale / cell), target = el.dataset.grid!;
        mutate(() => d.source === target ? D.moveItem(inventory(target), d.uid, x, y) : D.transferItem(inventory(d.source), inventory(target), d.uid, x, y));
    }
    catch { } }; });
    const seed = document.getElementById('seed') as HTMLInputElement | null;
    if (seed)
        seed.oninput = () => app.seed = seed.value;
    const volume = document.getElementById('volume') as HTMLInputElement | null;
    if (volume)
        volume.oninput = () => {
            const candidate = structuredClone(app.save); candidate.settings.volume = Number(volume.value);
            if (persist(candidate)) { app.save = candidate; audio.setVolume(candidate.settings.volume); }
            else volume.value = String(app.save.settings.volume);
            document.getElementById('volume-label')!.textContent = Math.round(app.save.settings.volume * 100) + '%';
        };
    const file = document.getElementById('backup-file') as HTMLInputElement | null;
    if (file) file.onchange = async () => {
        const selectedFile = file.files?.[0];
        if (!selectedFile) return;
        try {
            if (selectedFile.size > BACKUP_MAX_BYTES) throw new Error('存档文件过大。');
            const candidate = decodeBackup(await selectedFile.text());
            if (app.state !== 'hideout' || app.conflict || app.pendingSettlement) return;
            app.pendingImport = candidate; setOverlay('import-save');
        } catch (error) { toast(error instanceof Error ? error.message : '无法读取存档文件。'); }
        file.value = '';
    };
}
export function drawMap() { const canvas = document.getElementById('map') as HTMLCanvasElement; if (!canvas)
    return; const ctx = canvas.getContext('2d')!, sx = canvas.width / WORLD_W, sy = canvas.height / WORLD_H; ctx.fillStyle = '#0e1a1b'; ctx.fillRect(0, 0, canvas.width, canvas.height); WORLD.tiles.forEach((row, y) => row.forEach((t, x) => { ctx.fillStyle = ['#384b3e', '#849178', '#12363b', '#141e1b', app.raid?.highTide ? '#724840' : '#44665a', '#69735d', '#8e805b'][t] || '#222'; ctx.fillRect(x * 32 * sx, y * 32 * sy, 32 * sx + 1, 32 * sy + 1); })); ctx.font = '11px "Microsoft YaHei"'; ctx.textAlign = 'center'; WORLD.zones.forEach(z => { ctx.fillStyle = '#f0e4b8'; ctx.fillText(z.name, (z.x + z.w / 2) * sx, (z.y + z.h / 2) * sy); }); app.raid?.config.exits.forEach(e => { ctx.strokeStyle = '#d7ed90'; ctx.lineWidth = 2; ctx.strokeRect(e.x * sx - 6, e.y * sy - 6, 12, 12); ctx.fillStyle = '#d7ed90'; ctx.fillText(e.name, e.x * sx, e.y * sy - 12); }); if (app.raid) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(app.raid.player.x * sx, app.raid.player.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
} }
