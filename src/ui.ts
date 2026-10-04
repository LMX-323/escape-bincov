import * as D from './domain';
import { WORLD, WORLD_W, WORLD_H, generateRun } from './world';
import { SURVIVAL } from './balance';
import { encodeBackup, encodeRecoveryBackup, decodePortableBackup } from './save-backup';
import { SESSION_MAX_BYTES } from './recovery-store';
import { playerInput } from './input';
import { app, audio, saveSession } from './app';
import type { SessionMutation } from './session';
const ui = () => document.getElementById('ui')!;
export function toast(message: string) { const el = document.getElementById('toast')!; el.textContent = message; el.style.opacity = '1'; clearTimeout((toast as any).timer); (toast as any).timer = setTimeout(() => el.style.opacity = '0', 3300); }
function saved(ok: boolean): boolean {
    if (!ok && !app.conflict && !app.storageOK)
        toast('无法写入本地存档。请允许浏览器存储后再出击。');
    return ok;
}
export function persist(save: D.SaveDataV1 = app.save): boolean {
    return saved(saveSession.persist(save));
}
export function initSave(owned = true) {
    saved(saveSession.initialize(owned));
    audio.setVolume(app.save.settings.volume);
}
export function changeState(state: typeof app.state) { if (app.pendingSettlement) { setOverlay('save-error'); return; } app.raid?.releaseInput(); playerInput.clear(); app.state = state; app.overlay = ''; app.selected = ''; if (state === 'hideout') {
    saved(saveSession.grantRelief());
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
const kindName: Record<D.ItemKind, string> = {
    weapon: '武器', ammo: '弹药', medical: '医疗', food: '补给',
    part: '零件', valuable: '贵重物资', quest: '任务物资',
};
function occupied(inv: D.Inventory) {
    return inv.items.reduce((sum, item) => sum + D.ITEMS[item.id].w * D.ITEMS[item.id].h, 0);
}
function grid(inv: D.Inventory, source: string, cell = 36) {
    return `<div class="grid" data-grid="${source}" data-cell="${cell}" style="width:${inv.w * cell}px;height:${inv.h * cell}px;--cell:${cell}px">${inv.items.map(i => {
        const d = D.ITEMS[i.id];
        return `<div tabindex="0" role="button" aria-label="${d.name} × ${i.qty}" aria-pressed="${app.selected === i.uid}" title="${d.name} · ${i.qty} 件 · ${(d.weight * i.qty).toFixed(2)} kg" draggable="true" data-uid="${i.uid}" data-source="${source}" data-kind="${d.kind}" class="item ${app.selected === i.uid ? 'selected' : ''}" style="left:${i.x * cell + 2}px;top:${i.y * cell + 2}px;width:${d.w * cell - 3}px;height:${d.h * cell - 3}px">${itemIcon(i.id)}<span class="item-label ${i.relief ? 'relief' : ''}">${d.short || d.name}</span>${i.qty > 1 ? `<span class="qty">${i.qty}</span>` : ''}</div>`;
    }).join('')}${!inv.items.length ? '<div class="empty-hint">空置</div>' : ''}</div>`;
}
function details() {
    const item = app.selected ? inventory(app.selectedSource).items.find(i => i.uid === app.selected) : null;
    if (!item) return `<aside class="details details-empty"><div class="section-label">${app.state === 'run' ? '随身物资' : '出发前检查'}</div><h3>选中一件物品</h3><p class="muted">查看用途、重量与可用操作。</p><dl class="field-notes"><div><dt>弹药</dt><dd>备用弹药放进背包。<br>出发前装备主武器。</dd></div><div><dt>安全箱</dt><dd>重要小件放进这里，失败后也会保留。</dd></div></dl><div class="inv-help">单击查看 · 拖动整理${app.state === 'hideout' ? '<br>双击在仓库与背包间转移' : ''}</div>${app.save.reliefSupplies?.length ? btn('领取救济补给', 'relief') : ''}</aside>`;
    const d = D.ITEMS[item.id];
    const actions = app.state === 'run'
        ? `${D.WEAPONS[item.id] && item.id !== 'knife' && app.selectedSource === 'bag' ? btn('装备', 'equip-run', 'primary') : ''}${['bandage', 'medkit', 'antidote', 'water', 'food'].includes(item.id) ? btn('使用', 'use', 'primary') : ''}${btn(app.selectedSource === 'safe' ? '移至背包' : '放入安全箱', 'secure')}${btn('丢弃', 'drop', 'danger')}`
        : `${D.WEAPONS[item.id] && item.id !== 'knife' && app.selectedSource !== 'safe' ? btn('装备', 'equip', 'primary') : ''}${btn(app.selectedSource === 'stash' ? '装进背包' : '收入仓库', 'transfer')}${btn(app.selectedSource !== 'safe' ? '放入安全箱' : '移至背包', 'secure')}${!item.relief ? btn('出售', 'sell') : ''}`;
    return `<aside class="details"><div class="item-heading"><div class="detail-icon">${itemIcon(item.id)}</div><div><div class="section-label">${kindName[d.kind]}</div><h3>${d.name}</h3></div></div><p class="item-description">${d.description}</p><dl class="item-facts"><div><dt>占用</dt><dd>${d.w} × ${d.h} 格</dd></div><div><dt>总重</dt><dd>${(d.weight * item.qty).toFixed(2)} kg</dd></div><div><dt>数量</dt><dd>${item.qty}</dd></div><div><dt>回收价</dt><dd>${item.relief ? '不可出售' : '¥ ' + d.sell * item.qty}</dd></div></dl>${item.relief ? '<p class="small orange">救济物资 · 仅供自用</p>' : ''}<div class="item-actions">${actions}</div></aside>`;
}
export function render() {
    document.documentElement.dataset.state = app.state;
    document.documentElement.dataset.overlay = app.overlay;
    document.dispatchEvent(new Event('bincov-ui'));
    if (app.state === 'menu') {
        ui().innerHTML = `<div class="menu"><div class="menu-location">滨科夫县 <span>沿海封锁区</span></div><h1>逃离<br>滨科夫</h1><div class="subtitle">ESCAPE BINCOV</div><p class="intro">台风过后，海没有退去。<br>带上最后一匣子弹，穿过盐雾与封锁线。<br>找到补给，活着回到水产站。</p>${btn(app.checkpoint ? '继续上次行动 <span aria-hidden="true">→</span>' : '进入水产站 <span aria-hidden="true">→</span>', 'enter', 'primary')}<footer>单人撤离生存 <span>进度保存在本机</span></footer>${btn('操作指南', 'help', 'text-button')}</div><div class="version"><span>北纬 27° · 赤潮封锁第 17 天</span><span class="build-number">ESCAPE BINCOV / 0.1.1</span><a class="repo-link" href="https://github.com/xuys2025/escape-bincov" target="_blank" rel="noopener noreferrer">GitHub · 反馈 / 参与开发 ↗</a></div>${overlayHtml()}`;
        bind();
        return;
    }
    if (app.state === 'hideout')
        renderHideout();
    if (app.state === 'run') {
        ui().innerHTML = `<div class="hud"><div class="hud-top"><div class="location"><div class="section-label">滨科夫 · 沿海封锁区</div><strong id="zone">封锁区</strong><div class="small" id="tide">潮汐监测中</div></div><div class="timer"><strong id="timer">10:00</strong><small>封锁剩余时间</small></div></div><div id="radio" class="radio">水产站：信号接通。撤离点已标记在地图上，别等到最后一分钟。</div><div class="hud-bottom"><div class="vitals"><div class="vital-row"><span>生命体征</span><span id="hp">100 / 100</span></div><div class="bar"><i id="hpbar"></i></div><div class="vital-row"><span>耐力</span><span id="stamina">100</span></div><div class="bar stamina"><i id="staminabar"></i></div><div class="vital-row" style="margin-bottom:0"><span id="status">状态稳定</span><span id="weight">0 kg</span></div></div><div class="weapon-hud"><div class="eyebrow" id="gunname">${weaponName()}</div><div class="ammo" id="ammo">—</div><div class="small muted" id="reload">R 换弹　1 主武器　2 匕首</div></div></div><div class="keytips"><kbd>E</kbd>搜刮 / 撤离　<kbd>Tab</kbd>背包　<kbd>Q</kbd>治疗　<kbd>M</kbd>地图　<kbd>Esc</kbd>暂停</div><div id="interaction" class="interaction" style="display:none"></div><div id="warning"></div></div>${overlayHtml()}`;
        bind();
        if (app.raid?.player?.active) app.raid.updateHud();
        if (app.overlay === 'map')
            drawMap();
        return;
    }
    if (app.state === 'result') {
        const r = app.result;
        ui().innerHTML = `<div class="overlay"><div class="panel result"><div class="stamp">行动报告 <span>${r?.outcome === 'extract' ? '成功撤离' : '未能撤离'}</span></div><h2>${r?.outcome === 'extract' ? '你回来了。' : r?.outcome === 'timeout' ? '封锁线关闭。' : '信号中断。'}</h2><p>${r?.outcome === 'extract' ? '盐雾在身后合拢。物资已带回水产站，装备仍在背包中。' : '携带物资遗失。安全箱已回收；水产站还有一盏灯为你亮着。'}</p><div class="stats"><div><strong>${r?.kills || 0}</strong><span>消灭威胁</span></div><div><strong>${r?.keptValue || 0}</strong><span>保留物资估值</span></div><div><strong>${app.save.stats.extracts} / ${app.save.stats.runs}</strong><span>累计撤离 / 出击</span></div></div>${btn('返回水产站　 →', 'return', 'primary')}</div></div>`;
        bind();
    }
}
function renderHideout() {
    const s = app.save;
    let body = '';
    if (app.tab === 'gear') {
        const weight = preparedWeight();
        body = `<div class="columns gear-columns"><section class="stash-section"><h3 class="section-title">物资仓库 <span>${occupied(s.stash)} / ${s.stash.w * s.stash.h} 格</span></h3>${grid(s.stash, 'stash')}<div class="inv-help">${s.upgraded ? '扩建储物架 · 10 × 9' : '基础储物架 · 10 × 6'}</div></section><section><h3 class="section-title">行动背包 <span>${occupied(s.bag)} / ${s.bag.w * s.bag.h} 格</span></h3>${grid(s.bag, 'bag')}<div class="load-meter ${weight > SURVIVAL.carryLimit ? 'overloaded' : ''}"><span>携行重量</span><strong>${weight.toFixed(1)} <small>/ ${SURVIVAL.carryLimit} kg</small></strong><i style="width:${Math.min(100, weight / SURVIVAL.carryLimit * 100)}%"></i></div><div class="inv-help">含主武器、弹匣与安全箱</div></section><section class="safe-section"><h3 class="section-title">安全箱</h3>${grid(s.safe, 'safe')}<div class="inv-help protected">撤离失败保留</div><div class="equip"><div class="section-label">主武器</div><div class="equipped-icon">${itemIcon(s.equipment.weapon || 'knife')}</div><strong>${D.WEAPONS[s.equipment.weapon || 'knife'].name}</strong>${s.equipment.weapon ? `<div class="inv-help">弹匣 ${s.equipment.ammo} 发</div>${btn('卸下', 'unequip', 'text-button')}` : '<div class="inv-help">始终保留</div>'}</div></section>${details()}</div>`;
    } else if (app.tab === 'arms' || app.tab === 'med') {
        const merchant = D.MERCHANTS[app.tab];
        body = `<div class="merchant-heading"><div><h3>${merchant.name}<span>${merchant.subtitle}</span></h3><p>${app.tab === 'arms' ? '“枪能响，路就还没断。”' : '“先止血，再说别的。”'}</p></div><span class="small muted">购买后收入仓库</span></div><div class="shop-grid">${merchant.stock.map(id => {
            const d = D.ITEMS[id], qty = D.buyQuantity(id);
            return `<div class="shop-card"><div class="shop-icon">${itemIcon(id)}</div><div class="shop-description"><strong>${d.name}</strong><span class="small">${d.kind === 'ammo' ? '每包 ' + qty + ' 发' : kindName[d.kind] + ' · 每份 1 件'}</span></div>${btn('¥ ' + d.buy * qty, 'buy', '', `data-id="${id}" aria-label="购买${d.name}，${d.buy * qty}元" ${s.cash < d.buy * qty ? 'disabled' : ''}`)}</div>`;
        }).join('')}</div><p class="content-note">需要回收物资？在装备整备中选中物品，点击「出售」。救济物资不可出售。</p>`;
    } else if (app.tab === 'quests') {
        body = `<div class="quests">${Object.entries(D.QUESTS).map(([id, q], i) => {
            const complete = s.quests[id];
            const needs = Object.entries(q.needs).map(([itemId, needed]) => ({ itemId, needed, have: [s.stash, s.bag, s.safe].reduce((sum, inv) => sum + D.count(inv, itemId), 0) }));
            const ready = needs.every(({ have, needed }) => have >= needed);
            return `<article class="quest ${complete ? 'complete' : ''}"><div class="quest-status"><span class="mono">0${i + 1}</span><span>${complete ? '已交付' : ready ? '可以交付' : '等待物资'}</span></div><h3>${q.name}</h3><p>${q.description}</p>${complete ? `<p class="quest-reply">${q.radio}</p>` : `<ul class="quest-needs">${needs.map(({ itemId, needed, have }) => {
                return `<li class="${have >= needed ? 'ready' : ''}"><span>${D.ITEMS[itemId].name}</span><strong>${Math.min(have, needed)} <span>/ ${needed}</span></strong></li>`;
            }).join('')}</ul>`}<div class="quest-footer"><div><strong>¥ ${q.reward}</strong><span>${id === 'repair' ? '另解锁储物架' : '任务报酬'}</span></div>${complete ? '<span class="completion-mark">✓ 已完成</span>' : btn('提交物资', 'quest', ready ? 'primary' : '', `data-id="${id}"`)}</div></article>`;
        }).join('')}</div><p class="content-note">物资可从仓库、背包与安全箱交付。任务物品放进安全箱，撤离失败仍能带回。</p>`;
    } else {
        body = `<div class="station-layout"><section class="station-log"><div class="section-label">水产站值守记录 · 第 17 天</div><h3>${s.quests.repair ? '电台已恢复，等你回站。' : '应急电源仍在运行。'}</h3><p class="station-copy">旧制冰机停了，电台还在断续发声。<br>以下时间从出击开始计算。涉水会积累污染。</p><dl class="tide-notes"><div><dt>04:30</dt><dd>电台预警，离开浅滩。</dd></div><div><dt>05:00</dt><dd>潮位翻转；高架路与海堤可通行。</dd></div></dl><div class="station-upgrade">${btn(s.upgraded ? '储物架已扩建' : `扩建储物架 · ¥ ${D.STASH_UPGRADE_COST}`, 'upgrade', '', s.upgraded ? 'disabled' : '')}<p class="inv-help">${s.upgraded ? '仓库容量 90 格，已完成扩建。' : `完成「${D.QUESTS.repair.name}」后可扩建至 90 格。`}</p></div></section><section class="station-controls"><div class="station-stats"><div><strong>${s.stats.runs}</strong><span>累计行动</span></div><div><strong>${s.stats.extracts}</strong><span>成功撤离</span></div><div><strong>${s.stats.kills}</strong><span>消灭威胁</span></div></div><label class="volume-control"><span>电台音量 <span id="volume-label">${Math.round(s.settings.volume * 100)}%</span></span><input aria-label="音量" id="volume" type="range" min="0" max="1" step="0.05" value="${s.settings.volume}"></label><div class="save-controls"><div><h3>本地存档</h3><p>更换浏览器或游玩地址前，请先导出备份。</p></div><div class="save-actions">${btn('导出存档', 'export-save')}${btn('导入存档', 'import-save')}</div><input id="backup-file" type="file" accept=".json,application/json" hidden></div><div class="station-links">${btn('操作指南', 'help', 'text-button')}${btn('返回主菜单', 'menu', 'text-button')}</div></section></div>`;
    }
    ui().innerHTML = `<div class="panel hideout"><header class="topbar"><div class="station-identity"><span class="section-label">滨科夫 · 沿海避难点</span><h2>废弃水产站</h2></div><div class="right"><span class="station-signal"><i></i>${s.quests.repair ? '电台已修复 · 信号稳定' : '应急供电 · 信号微弱'}</span><div class="cash"><span>可用现金</span><strong>¥ ${s.cash.toLocaleString()}</strong></div></div></header><nav class="tabs" aria-label="水产站功能">${[['gear', '装备整备'], ['arms', '修理铺'], ['med', '卫生所'], ['quests', '无线电任务'], ['home', '水产站']].map(([id, name]) => btn(name, 'tab', app.tab === id ? 'active' : '', `data-id="${id}" ${app.tab === id ? 'aria-current="page"' : ''}`)).join('')}</nav><div class="content">${body}</div><footer class="bottom-bar"><div class="departure-note"><strong>沿海封锁区 <span>10 分钟行动窗口</span></strong><p>撤离失败将遗失背包和主武器，安全箱保留。</p></div><label class="seed-label">行动种子 <input class="seed" aria-label="行动种子" id="seed" placeholder="随机" value="${esc(app.seed)}" maxlength="16"></label>${btn('出击 <span aria-hidden="true">→</span>', 'deploy', 'primary')}</footer></div>${overlayHtml()}`;
    bind();
}
function overlayHtml() {
    if (!app.storageOK && app.state === 'menu')
        return `<div class="overlay"><div class="panel modal"><div class="section-label orange">进度保护</div><h2>暂时无法打开存档</h2><p>${esc(app.storageError || '请允许浏览器存储后刷新重试。')}</p><div class="actions">${btn('导出原始存档', 'export-original')}${btn('刷新重试', 'refresh', 'primary')}</div></div></div>`;
    if (app.overlay === 'checkpoint-error')
        return `<div class="overlay"><div class="panel modal"><div class="section-label orange">进度保护</div><h2>本局暂时无法保存</h2><p>行动已暂停。最近成功保存：${app.lastSavedAt ? new Date(app.lastSavedAt).toLocaleTimeString() : '尚无'}。</p><p>请恢复浏览器存储后重试。也可以先导出当前行动备份，避免丢失本次进度。</p><div class="actions">${btn('重试保存', 'retry-checkpoint', 'primary')}${btn('导出行动备份', 'export-save')}</div></div></div>`;
    if (app.overlay === 'rotate')
        return `<div class="overlay"><div class="panel modal"><div class="section-label">行动已暂停</div><h2>横过来，准备出发。</h2><p>横屏能看清沿海街区，也能同时移动和瞄准。转回横屏后，点击继续行动。</p><div class="actions">${btn('操作指南', 'help')}${btn('导出行动备份', 'export-save')}${btn('放弃行动', 'abandon', 'danger')}</div></div></div>`;

    if (app.pendingSettlement)
        return `<div class="overlay"><div class="panel modal"><div class="section-label orange">进度保护</div><h2>结算尚未保存</h2><p>行动已停止，结算物资保留在当前页面。</p><p>${app.conflict ? '另一个窗口已修改存档。请先下载本次结算备份，刷新后再从水产站导入。' : '浏览器暂时无法保存进度。请恢复存储后重试，或先下载本次结算备份。'}</p><p class="small orange">保存或备份完成前，请不要关闭或刷新页面。</p><div class="actions">${btn('重试保存', 'retry-save', 'primary', app.conflict ? 'disabled' : '')}${btn('下载结算备份', 'export-save')}</div><p class="small muted">备份包含本次结算，可在「水产站 → 导入存档」恢复。</p></div></div>`;
    if (app.overlay === 'import-save' && (app.pendingImport || app.pendingRecoveryImport))
        return `<div class="overlay"><div class="panel modal"><h2>导入这份存档？</h2><p>现金 ¥ ${(app.pendingImport || app.pendingRecoveryImport!.profile).cash} · 累计行动 ${(app.pendingImport || app.pendingRecoveryImport!.profile).stats.runs} 次</p><p>导入会覆盖当前浏览器的进度。建议先导出当前存档。</p><div class="actions">${btn('先导出当前存档', 'export-save')}${btn('确认导入', 'confirm-import', 'primary')}${btn('取消', 'close')}</div></div></div>`;
    if (!app.overlay)
        return '';
    if (app.overlay === 'inventory' && app.loadout)
        return `<div class="overlay inventory-overlay"><div class="panel inventory-modal"><div class="section-title">行动背包 <span>整理物品时世界仍在运行 · Tab 关闭</span></div><div class="columns"><div>${grid(app.loadout.bag, 'bag', 44)}<div class="inv-help">总负重 ${app.raid?.carriedWeight().toFixed(1)} / ${SURVIVAL.carryLimit} kg　·　含装备与安全箱</div></div><div><div class="section-title">安全箱</div>${grid(app.loadout.safe, 'safe', 44)}<div class="inv-help">死亡后保留</div></div>${details()}</div>${btn('关闭背包', 'close', 'text-button')}</div></div>`;
    if (app.overlay === 'map')
        return `<div class="overlay"><div class="panel map-modal"><div class="section-title">滨科夫县沿海管制图 <span>M 关闭 · 时间继续流逝</span></div><canvas id="map" width="690" height="400"></canvas><div class="legend"><span>● 你的位置　 <span style="color:#d0df91">▣ 当前撤离点</span></span><span>深绿：永久通路　暗红：潮汐淹没区</span>${btn('关闭地图', 'close', 'text-button')}</div></div></div>`;
    if (app.overlay === 'pause')
        return `<div class="overlay"><div class="panel modal"><div class="section-label">行动暂停 · 电台静默</div><h2>暂时隐蔽</h2><p>行动已暂停。刷新后可从最近成功保存的检查点继续，少量未保存进度可能回退。</p><label class="small">音量 <span id="volume-label">${Math.round(app.save.settings.volume * 100)}%</span><input id="volume" aria-label="音量" type="range" min="0" max="1" step="0.05" value="${app.save.settings.volume}"></label><div class="actions">${btn('继续行动', 'close', 'primary')}${btn('操作指南', 'help')}${btn('放弃行动', 'abandon', 'danger')}${btn('导出行动备份', 'export-save')}</div></div></div>`;
    if (app.overlay === 'abandon')
        return `<div class="overlay"><div class="panel modal"><h2>放弃这次行动？</h2><p>你会失去携带与搜到的物资。安全箱里的东西会保留。</p><div class="actions">${btn('继续隐蔽', 'pause', 'primary')}${btn('确认放弃', 'confirm-abandon', 'danger')}</div></div></div>`;
    return `<div class="overlay"><div class="panel modal" style="width:610px"><div class="section-label">水产站 · 随身手册</div><h2>行动指南</h2>${playerInput.touch ? '<p class="touch-guide">左盘移动，推到外圈冲刺。右盘内圈瞄准、外圈持续开火，松开即停。靠近物资点「搜刮」，撤离区内停稳并按住「撤离」3 秒。地图和背包不暂停，整理时仍可能受击。</p>' : ''}<div class="help-grid">${[['W A S D', '移动'], ['鼠标', '瞄准'], ['左键 / 右键', '射击 / 精瞄'], ['Shift', '冲刺'], ['R', '换弹'], ['E', '拾取 / 阅读'], ['按住 E 3 秒', '撤离（绿色标记内）'], ['Q', '快捷治疗'], ['Tab', '背包（不暂停）'], ['M', '地图（不暂停）'], ['1 / 2', '主武器 / 匕首'], ['Esc', '暂停 / 关闭面板']].map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div><p>先在水产站整备，备用弹药放入背包。搜刮地上的黄色物资，沿永久高架路抵达绿色撤离点。站稳并按住 E，读条 3 秒即可回家。</p><p>潮汐翻转前会广播预警；涉水会积累污染。按 Q 优先止血，背包内可使用解毒剂。主动放弃、死亡、超时会失去携带物资。刷新可恢复最近成功保存的检查点。</p>${btn('明白了', 'close', 'primary')}</div></div>`;
}
export function setOverlay(value: string) {
    if (app.overlay === 'checkpoint-error' && value !== 'checkpoint-error' && !app.storageOK) return;
    if (!value && playerInput.touch && app.state === 'run' && (innerWidth < innerHeight || innerHeight < 280)) value = 'rotate';
    app.raid?.releaseInput(); playerInput.clear();
    app.overlay = app.pendingSettlement ? 'save-error' : value; app.selected = '';
    if (['pause','help','abandon','rotate'].includes(app.overlay)) { app.raid?.checkpoint(); audio.stop(); }
    render();
}
export function finish(outcome: 'extract' | 'death' | 'timeout') {
    if (app.state !== 'run' || !app.loadout || app.conflict || app.pendingSettlement) return;
    app.raid?.syncMagazine();
    if (!saveSession.prepareSettlement(outcome, app.raid?.kills || 0)) return;
    app.raid?.lock();
    retrySettlement();
}
export function retrySettlement(): boolean {
    if (!app.pendingSettlement) return false;
    if (!saved(saveSession.retrySettlement())) { setOverlay('save-error'); return false; }
    if (app.result!.outcome === 'extract') audio.extract(); else audio.death();
    app.raid = null;
    changeState('result');
    return true;
}
export function exportSave() {
    try {
        let text: string;
        if (app.pendingSettlement) text = encodeBackup(app.pendingSettlement);
        else if (app.save.activeRun) {
            const record = saveSession.currentRecord();
            if (!record) throw new Error('无法读取行动记录，请导出原始存档。');
            const raid = app.raid?.snapshot() ?? app.checkpoint;
            record.profile = structuredClone(app.save); record.raid = raid;
            if (raid) D.checkpointSafe(record.profile, raid.loadout.safe, raid.runId);
            text = encodeRecoveryBackup(record);
        } else text = encodeBackup(app.save);
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
    if (!saved(saveSession.importSave(candidate))) return false;
    app.pendingImport = null;
    audio.setVolume(app.save.settings.volume);
    setOverlay('');
    toast('存档已导入并保存。');
    return true;
}
function selected() { return inventory(app.selectedSource).items.find(x => x.uid === app.selected); }
export function mutate(action: SessionMutation, message = ''): boolean {
    const result = saveSession.mutate(action, app.raid);
    if (result === 'blocked') return false;
    if (result === 'rejected') {
        toast('操作未完成：请检查现金、空间或所需物资。');
        render();
        return false;
    }
    if (result === 'save-failed') {
        if (app.state === 'run') { app.overlay = 'checkpoint-error'; app.raid?.releaseInput(); audio.stop(); }
        toast('保存失败，本次操作已撤回。请恢复浏览器存储后重试。');
        render();
        return false;
    }
    if (message) toast(message);
    app.selected = ''; render(); return true;
}
function bind() {
    ui().querySelectorAll<HTMLElement>('[data-action]').forEach(el => el.onclick = () => {
        const a = el.dataset.action!, id = el.dataset.id!;
        if (app.conflict && !['export-save', 'export-original', 'refresh'].includes(a)) {
            toast('存档已在另一窗口变更，请刷新此页继续。');
            return;
        }
        audio.start();
        audio.click();
        if (app.pendingSettlement && a !== 'export-save' && a !== 'retry-save') return;
        switch (a) {
            case 'refresh': location.reload(); break;
            case 'export-original': {
                try {
                    const raw = saveSession.original(); if (!raw) { toast('浏览器内没有可导出的存档。'); break; }
                    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
                    const link = document.createElement('a'); link.href = url; link.download = 'Escape-Bincov-original-save.json'; link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch { toast('无法读取原始存档，请检查浏览器存储权限。'); }
                break;
            }
            case 'retry-checkpoint': if (app.raid?.checkpoint()) { app.overlay = 'pause'; render(); } break;
            case 'retry-save': retrySettlement(); break;
            case 'export-save': exportSave(); break;
            case 'import-save': document.getElementById('backup-file')?.click(); break;
            case 'confirm-import':
                if (app.pendingRecoveryImport && saveSession.importRecord(app.pendingRecoveryImport)) {
                    app.pendingRecoveryImport = null; changeState('menu'); toast('备份已导入，可继续保存的行动。');
                } else if (app.pendingImport) importSave(app.pendingImport);
                break;
            case 'enter':
                if (app.checkpoint) {
                    if (saveSession.resumeRun()) {
                        app.game!.registry.set('runConfig', generateRun(app.checkpoint.seed));
                        changeState('run'); app.overlay = 'pause'; render();
                    }
                    break;
                }
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
                if (!saved(saveSession.beginRun(cfg.seed))) break;
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
                mutate(() => app.raid?.equipItem(app.selected) ?? false);
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
                    mutate(() => { const inv = inventory(app.selectedSource); inv.items = inv.items.filter(x => x.uid !== i.uid); raid.drop(i); });
                }
                break;
            }
        }
    });
    ui().querySelectorAll<HTMLElement>('[data-uid]').forEach(el => { el.onclick = () => { app.selected = el.dataset.uid!; app.selectedSource = el.dataset.source!; ui().querySelectorAll<HTMLElement>('[data-uid]').forEach(node => { const active = node.dataset.uid === app.selected; node.classList.toggle('selected', active); node.setAttribute('aria-pressed', String(active)); }); const panel = ui().querySelector('.details'); if (panel)
        panel.outerHTML = details(); bind(); }; el.onkeydown = e => { if (e.key === 'Enter')
        el.click(); }; el.ondblclick = () => { if (app.state !== 'hideout' || app.conflict)
        return; const from = el.dataset.source!; mutate(() => D.transferItem(inventory(from), inventory(from === 'stash' ? 'bag' : 'stash'), el.dataset.uid!)); }; el.ondragstart = e => { e.dataTransfer!.setData('text/plain', JSON.stringify({ uid: el.dataset.uid, source: el.dataset.source })); e.dataTransfer!.effectAllowed = 'move'; }; });
    ui().querySelectorAll<HTMLElement>('[data-grid]').forEach(el => {
        el.ondragover = e => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; }; el.ondrop = e => { e.preventDefault(); if (app.conflict)
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
            if (saved(saveSession.setVolume(Number(volume.value)))) audio.setVolume(app.save.settings.volume);
            else volume.value = String(app.save.settings.volume);
            document.getElementById('volume-label')!.textContent = Math.round(app.save.settings.volume * 100) + '%';
        };
    const file = document.getElementById('backup-file') as HTMLInputElement | null;
    if (file) file.onchange = async () => {
        const selectedFile = file.files?.[0];
        if (!selectedFile) return;
        try {
            if (selectedFile.size > SESSION_MAX_BYTES + 512) throw new Error('存档文件过大。');
            const candidate = decodePortableBackup(await selectedFile.text());
            if (app.state !== 'hideout' || app.conflict || app.pendingSettlement) return;
            app.pendingImport = candidate.kind === 'settled' ? candidate.save : null; app.pendingRecoveryImport = candidate.kind === 'session' ? candidate.record : null; setOverlay('import-save');
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
