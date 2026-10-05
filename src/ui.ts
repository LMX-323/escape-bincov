import { departureWarnings } from './qol';
import * as Shop from './shop';
import * as D from './domain';
import { WORLD, WORLD_W, WORLD_H, generateRun } from './world';
import { SURVIVAL } from './balance';
import { encodeBackup, encodeRecoveryBackup, decodePortableBackup } from './save-backup';
import { SESSION_MAX_BYTES } from './recovery-store';
import { playerInput } from './input';
import { app, audio, saveSession } from './app';
import type { SessionMutation } from './session';
import { titleScreen } from './title-screen';
import { moveQuantity, placementError, type LootEndpoint } from './loot';
type InventoryDrag = { uid: string; source: string; token: number; runId: string | null; containerId: string | null; rotated?: boolean };
let activeDrag: InventoryDrag | null = null;
let dragToken = 0;
let pointerDrag: { pointerId: number; drag: InventoryDrag; startX: number; startY: number; x: number; y: number; cell: number; started: boolean } | null = null;
let dragGhost: HTMLElement | null = null;
let suppressDragClick = false;
const ui = () => document.getElementById('ui')!;
let toastTimer: ReturnType<typeof setTimeout>, lastSuccess = '', successCount = 0;
export function toast(message: string, kind: 'info' | 'success' = 'info') {
    const el = document.getElementById('toast')!;
    const root = document.documentElement;
    successCount = kind === 'success' && lastSuccess === message && el.style.opacity === '1' ? successCount + 1 : 1;
    lastSuccess = kind === 'success' ? message : '';
    el.textContent = message + (kind === 'success' && successCount > 1 ? ` × ${successCount}` : '');
    root.dataset.toastKind = kind;
    el.style.opacity = '1'; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.style.opacity = '0';
        // Restore the radio after the toast's opacity transition has finished.
        toastTimer = setTimeout(() => delete root.dataset.toastKind, 150);
    }, kind === 'success' ? 1500 : 3300);
}
function clearSelection() { app.selected = ''; app.placement = false; app.placementRotated = undefined; app.placementQuantity = undefined; }
function saved(ok: boolean): boolean {
    if (!ok && !app.conflict && !app.storageOK)
        toast('存档保存失败。请检查浏览器是否允许保存数据，然后重试。');
    return ok;
}
export function persist(save: D.SaveDataV1 = app.save): boolean {
    return saved(saveSession.persist(save));
}
export function initSave(owned = true) {
    saved(saveSession.initialize(owned));
    audio.setVolume(app.save.settings.volume);
}
export function changeState(state: typeof app.state) { if (app.pendingSettlement) { setOverlay('save-error'); return; } clearLootContext(); app.raid?.releaseInput(); playerInput.clear(); app.state = state; app.overlay = ''; clearSelection(); if (state === 'hideout') {
    saved(saveSession.grantRelief());
} app.game?.scene.getScenes(true).forEach(scene => app.game!.scene.stop(scene.scene.key)); app.game?.scene.start(({ menu: 'Menu', hideout: 'Hideout', run: 'Raid', result: 'Result' })[state]); render(); }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const btn = (label: string, action: string, cls = '', extra = '') => `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
export const weaponName = () => D.WEAPONS[app.loadout?.weapon || 'knife']?.name || '水手匕首';
function preparedWeight(){const s=app.save,w=D.WEAPONS[s.equipment.weapon||'knife'];return D.weight(s.bag)+D.weight(s.safe)+D.ITEMS.knife.weight+(s.equipment.weapon?D.ITEMS[s.equipment.weapon].weight:0)+(w.ammo?D.ITEMS[w.ammo].weight*s.equipment.ammo:0);}
const iconCache = new Map<string, string>();
function itemIcon(id: string) { let url = iconCache.get(id); if (!url && app.game?.textures.exists('item-' + id)) {
    const source = app.game.textures.get('item-' + id).getSourceImage() as HTMLCanvasElement;
    url = source.toDataURL();
    iconCache.set(id, url);
} return url ? `<img class="item-icon" alt="" draggable="false" src="${url}">` : ''; }
function activeLoot() {
    const context = app.lootContext;
    if (!context || app.state !== 'run' || app.loadout?.runId !== context.runId) return undefined;
    const container = app.raid?.getLootContainer(context.containerId);
    return container?.runId === context.runId ? container : undefined;
}
function shopping() { return app.state === 'hideout' && ['arms', 'med'].includes(app.tab); }
function cart() {
    if (!app.shop || app.shop.merchant !== app.tab) app.shop = Shop.createCart(app.save, app.tab as Shop.Merchant);
    return app.shop;
}
function inventory(source: string): D.Inventory {
    if (shopping() && ['merchant', 'buy', 'sell', 'stash'].includes(source)) return Shop.shopInventory(cart(), source as Shop.ShopSource);
    if (source === 'container') {
        const container = activeLoot();
        if (!container || app.overlay !== 'loot') throw new Error('搜刮来源已关闭。');
        return container.inventory;
    }
    if (source !== 'bag' && source !== 'safe' && source !== 'stash') throw new Error('无效物品栏。');
    if (app.state === 'run') {
        if (!app.loadout || source === 'stash') throw new Error('物品栏不可用。');
        return app.loadout[source];
    }
    return app.save[source];
}
const kindName: Record<D.ItemKind, string> = {
    weapon: '武器', ammo: '弹药', medical: '医疗用品', food: '食品',
    part: '零件', valuable: '贵重物资', quest: '任务物品',
};
function occupied(inv: D.Inventory) {
    return inv.items.reduce((sum, item) => sum + D.ITEMS[item.id].w * D.ITEMS[item.id].h, 0);
}
function grid(inv: D.Inventory, source: string, cell = 36) {
    if (playerInput.touch) cell = 52;
    if (playerInput.touch && source === 'stash' && !app.inventoryGrid && !shopping())
        return `<div class="inventory-list">${inv.items.map(i => `<button class="inventory-row" data-uid="${i.uid}" data-item-id="${i.id}" data-source="${source}" aria-pressed="${app.selected === i.uid}">${itemIcon(i.id)}<span><strong>${D.ITEMS[i.id].name}</strong><small>${D.itemSize(i).w} × ${D.itemSize(i).h} 格 · ${(D.ITEMS[i.id].weight * i.qty).toFixed(2)} kg${i.relief ? ' · 救济' : ''}</small></span><b>× ${i.qty}</b></button>`).join('') || '<p class="muted">仓库空置</p>'}</div>`;

    return `<div class="grid" data-grid="${source}" data-cell="${cell}" style="width:${inv.w * cell}px;height:${inv.h * cell}px;--cell:${cell}px">${inv.items.map(i => {
        const d = D.ITEMS[i.id];
        const size = D.itemSize(i);
        return `<div tabindex="0" role="button" aria-label="${d.name} × ${i.qty}" aria-pressed="${app.selected === i.uid}" title="${d.name} × ${i.qty} · ${(d.weight * i.qty).toFixed(2)} kg" draggable="${!playerInput.touch && shopping()}" data-uid="${i.uid}" data-item-id="${i.id}" data-source="${source}" data-kind="${d.kind}" class="item ${app.selected === i.uid ? 'selected' : ''}" style="left:${i.x * cell + 2}px;top:${i.y * cell + 2}px;width:${size.w * cell - 3}px;height:${size.h * cell - 3}px">${itemIcon(i.id)}<span class="item-label ${i.relief ? 'relief' : ''}">${d.short || d.name}</span>${i.qty > 1 ? `<span class="qty">${i.qty}</span>` : ''}</div>`;
    }).join('')}${placementCells(inv, source, cell)}${!inv.items.length ? '<div class="empty-hint">暂无物品</div>' : ''}</div>`;
}
function placementCells(inv: D.Inventory, source: string, cell: number) {
    const item = app.placement ? inventory(app.selectedSource).items.find(i => i.uid === app.selected) : null;
    if (!item) return '';
    return Array.from({ length: inv.w * inv.h }, (_, index) => {
        const x = index % inv.w, y = Math.floor(index / inv.w);
        return (shopping() ? !Shop.shopPlacementError(cart(), app.selectedSource as Shop.ShopSource, source as Shop.ShopSource, item.uid, x, y) : !placementError(inventory(app.selectedSource), inv, item.uid, x, y, app.placementRotated, app.placementQuantity))
            ? `<i class="placement-cell" style="left:${x * cell}px;top:${y * cell}px;width:${cell}px;height:${cell}px"></i>` : '';
    }).join('');
}
function placementControls() {
    const item = app.selected ? selected() : null, size = item ? D.itemSize({ ...item, rotated: app.placementRotated ?? item.rotated }) : null;
    return app.placement ? `<div class="placement-controls"><span class="placement-hint">${app.placementRotated !== undefined && size ? `旋转预览 ${size.w} × ${size.h} 格：` : ''}${app.placementQuantity ? `拆分 ${app.placementQuantity} 件：` : ''}点选虚线格位确认，取消会保留原位置。</span>${!shopping() && item && D.ITEMS[item.id].w !== D.ITEMS[item.id].h ? btn('旋转预览', 'rotate-preview') : ''}${btn('取消移动', 'clear-selection')}</div>` : '';
}
function itemDescription(id: string) {
    return D.ITEMS[id].description + (id === 'bandage' ? playerInput.touch ? ' 放在背包中，可点「治疗」使用。' : ' 放在背包中可按 Q 使用。' : id === 'knife' ? playerInput.touch ? ' 点「匕首」切换。' : ' 按 2 切换。' : '');
}
function mobileInventory() {
    const source = app.runContainer === 'safe' ? 'safe' : 'bag';
    return `<div class="overlay inventory-overlay"><div class="panel inventory-modal mobile-raid-inventory"><header class="inventory-header"><div><strong>随身物资</strong><span class="small">不暂停行动</span></div>${btn('关闭背包', 'close')}</header><nav class="mobile-inventory-tabs">${[['bag','背包'],['safe','安全箱']].map(([id,label]) => btn(label, 'run-container', source === id ? 'active' : '', `data-id="${id}"`)).join('')}</nav>${placementControls()}<div class="run-inventory-content">${grid(inventory(source), source, 52)}<div class="inv-help">${source === 'safe' ? '撤离失败也保留' : `负重 ${app.raid?.carriedWeight().toFixed(1)} / ${SURVIVAL.carryLimit} kg · 含装备与安全箱`}</div></div>${details()}</div></div>`;
}
const supplies = ['bandage', 'medkit', 'antidote', 'water', 'food'];
function quickContent() {
    if (app.overlay === 'reading') return `<p class="reading-text">${esc(app.reading?.text || '')}</p>`;
    if (app.overlay === 'supplies') {
        return ['bag', 'safe'].map(source => `<section><h3>${source === 'bag' ? '背包' : '安全箱 · 仅点选时使用'}</h3>${inventory(source).items.filter(i => supplies.includes(i.id)).map(i => `<div class="quick-row"><div><strong>${D.ITEMS[i.id].name} × ${i.qty}${i.relief ? ' · 救济' : ''}</strong><p>${esc(D.ITEMS[i.id].description)}</p></div>${btn('使用', 'use-supply', '', `data-id="${i.uid}" data-source="${source}" aria-label="使用${source === 'safe' ? '安全箱' : '背包'}中的${D.ITEMS[i.id].name}"`)}</div>`).join('') || '<p class="muted">没有药品或补给</p>'}</section>`).join('');
    }
    const nearby = app.raid?.nearbyLoot() || [];
    return nearby.map(l => {
        const trial = structuredClone(app.loadout!.bag), fits = D.addItem(trial, l.id, l.qty, !!l.relief) < l.qty, d = D.ITEMS[l.id];
        return `<div class="quick-row"><div><strong>${d.name} × ${l.qty}</strong><p>${d.w} × ${d.h} 格 · ${fits ? '可拾取' : '背包空间不足'}</p></div>${btn('拾取', 'pickup-loot', '', `data-id="${l.uid}" aria-label="拾取${d.name}"`)}</div>`;
    }).join('') || '<p class="muted">附近没有可拾取物品，靠近后会自动更新。</p>';
}
export function refreshQuickPanel() {
    if (!['nearby', 'supplies'].includes(app.overlay)) return;
    const body = ui().querySelector('.quick-body'); if (!body) return;
    const html = quickContent();
    if ((body as HTMLElement).dataset.content === html) return;
    const scroll = body.scrollTop; body.innerHTML = html; (body as HTMLElement).dataset.content = html; bind(); body.scrollTop = scroll;
}
function details() {
    const item = app.selected && !app.placement ? inventory(app.selectedSource).items.find(i => i.uid === app.selected) : null;
    if (shopping()) return shopDetails(item);
    if (app.overlay === 'loot') return lootDetails(item);
    if (!item) return `<aside class="details details-empty"><div class="section-label">${app.state === 'run' ? '随身物资' : '出发前检查'}</div><h3>选中一件物品</h3><p class="muted">查看用途、重量和操作。</p><dl class="field-notes"><div><dt>弹药</dt><dd>换弹只使用背包内的弹药。</dd></div><div><dt>安全箱</dt><dd>放入这里的物品，撤离失败也会保留。</dd></div></dl><div class="inv-help">单击查看 · 拖动整理${app.state === 'hideout' ? '<br>双击在仓库与背包间转移' : ''}</div>${app.save.reliefSupplies?.length ? btn('领取救济补给', 'relief') : ''}</aside>`;
    const d = D.ITEMS[item.id];
    const actions = app.state === 'run'
        ? `${D.WEAPONS[item.id] && item.id !== 'knife' && app.selectedSource === 'bag' ? btn('装备', 'equip-run', 'primary') : ''}${['bandage', 'medkit', 'antidote', 'water', 'food'].includes(item.id) ? btn('使用', 'use', 'primary') : ''}${btn(app.selectedSource === 'safe' ? '放入背包' : '放入安全箱', 'secure')}${btn('丢弃', 'drop', 'danger')}`
        : `${D.WEAPONS[item.id] && item.id !== 'knife' && app.selectedSource !== 'safe' ? btn('装备', 'equip', 'primary') : ''}${btn(app.selectedSource === 'stash' ? '放入背包' : '放入仓库', 'transfer')}${btn(app.selectedSource !== 'safe' ? '放入安全箱' : '放入背包', 'secure')}${!item.relief ? btn('去商店出售', 'sell') : ''}`;
    const size = D.itemSize(item);
    return `<aside class="details"><div class="item-heading"><div class="detail-icon">${itemIcon(item.id)}</div><div><div class="section-label">${kindName[d.kind]}</div><h3>${d.name}</h3></div>${playerInput.touch ? btn('关闭详情', 'clear-selection', 'detail-close') : ''}</div><div class="detail-body"><p class="item-description">${itemDescription(item.id)}</p><dl class="item-facts"><div><dt>占用</dt><dd>${size.w} × ${size.h} 格</dd></div><div><dt>重量</dt><dd>${(d.weight * item.qty).toFixed(2)} kg</dd></div><div><dt>数量</dt><dd>${item.qty}</dd></div><div><dt>售价</dt><dd>${item.relief ? '不可出售' : '¥ ' + d.sell * item.qty}</dd></div></dl>${item.relief ? '<p class="small orange">救济物资 · 不可出售</p>' : ''}<div class="item-actions">${actions}${d.w !== d.h ? btn('旋转', 'rotate-item') : ''}${btn('移动格位', 'place-item')}${splitControl(item)}</div></div></aside>`;
}
function deploy() {
    const cfg = generateRun(app.seed || Date.now());
    if (!saved(saveSession.beginRun(cfg.seed))) return;
    app.shop = null; app.game!.registry.set('runConfig', cfg); changeState('run');
}
function checkout() {
    const current = cart(); app.overlay = '';
    if (mutate(() => Shop.settleCart(app.save, current), '交易完成，物资已存入仓库。', '交易未完成，请检查现金、仓库空间和清单。')) { app.shop = null; render(); }
}
function shopDetails(item: D.Item | null | undefined) {
    if (!item) return `<aside class="details shop-details details-empty"><p>从商人拖到待买区，从仓库拖到待卖区。选中物品可查看用途，再点「移动格位」选择位置。</p></aside>`;
    const def = D.ITEMS[item.id], size = D.itemSize(item), buying = ['merchant', 'buy'].includes(app.selectedSource), uses = Shop.questUses(app.save, item.id);
    return `<aside class="details shop-details"><h3>${def.name} × ${item.qty}</h3><p>${def.description}</p><p>${size.w} × ${size.h} 格 · ${(def.weight * item.qty).toFixed(2)} kg · ${buying ? '购买' : '出售'} ¥ ${(buying ? def.buy : def.sell) * item.qty}${item.relief ? ' · 救济，不可出售' : ''}</p>${uses.length ? `<p class="orange">任务用途：${uses.join('、')}</p>` : ''}<div class="item-actions">${btn('移动格位', 'place-item')}${btn('关闭详情', 'clear-selection')}</div></aside>`;
}
function lootDetails(item: D.Item | null | undefined) {
    if (app.placement) return `<aside class="details loot-details details-empty">${placementControls()}</aside>`;
    if (!item) return `<aside class="details loot-details details-empty"><div><div class="section-label">取舍，由你决定</div><h3>选中物品查看详情</h3></div><p>把物品拖到另一侧的空格，或拖到可合并的同类物品上。<br>同类堆叠装满后，剩余留在原处 · 可放回来源</p></aside>`;
    const def = D.ITEMS[item.id], size = D.itemSize(item), external = app.selectedSource === 'container';
    const actions = external ? '<span class="inv-help">收入背包或安全箱后，才能使用或装备。</span>' : `${D.WEAPONS[item.id] && item.id !== 'knife' && app.selectedSource === 'bag' ? btn('装备', 'equip-run') : ''}${['bandage', 'medkit', 'antidote', 'water', 'food'].includes(item.id) ? btn('使用', 'use') : ''}${btn(app.selectedSource === 'safe' ? '移至背包' : '放入安全箱', 'secure')}${btn('丢弃', 'drop', 'danger')}`;
    return `<aside class="details loot-details"><div class="loot-detail-name"><div class="item-heading"><div class="detail-icon">${itemIcon(item.id)}</div><div><div class="section-label">${external ? '来源物资' : '随身物资'} · ${kindName[def.kind]}</div><h3>${def.name}</h3></div></div><p>${size.w}×${size.h} 格　${item.qty} 件　${(def.weight * item.qty).toFixed(2)} kg${item.relief ? '　<span class="orange">救济 · 不可出售</span>' : ''}</p></div><p class="item-description">${def.description}</p><div class="item-actions">${actions}${def.w !== def.h ? btn('旋转', 'rotate-item') : ''}${btn('移动格位', 'place-item')}${splitControl(item)}${playerInput.touch ? btn('关闭详情', 'clear-selection') : ''}</div></aside>`;
}
function lootHtml() {
    const container = activeLoot(), loadout = app.loadout;
    if (!container || !loadout) return '';
    const remaining = Math.max(0, Math.ceil((app.raid?.config.duration || 600) - (app.raid?.elapsed || 0)));
    return `<div class="overlay loot-overlay"><section class="panel loot-modal" role="dialog" aria-modal="true" aria-label="搜刮物资"><header class="loot-header"><div><div class="section-label orange">${container.kind === 'corpse' ? '现场搜身' : '物资搜集'}</div><h2>${esc(container.name)}</h2></div><div class="loot-risk"><span>生命 <strong id="loot-health">${Math.ceil(app.raid?.hp || 0)}</strong></span><span>封锁倒计时 <strong id="loot-timer">${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}</strong></span><small id="loot-condition">世界仍在运行，请留意周围。</small><strong id="loot-hit" role="status" aria-live="polite"></strong></div>${btn('关闭 ×', 'close', '', 'aria-label="关闭搜刮"')}</header><div class="loot-columns"><section class="loot-source"><h3 class="section-title">${container.kind === 'corpse' ? '尸体物品栏' : '箱子物品栏'} <span>${container.inventory.items.length ? '可取出 · 可放回' : '已搜空'}</span></h3>${grid(container.inventory, 'container', 40)}<div class="inv-help">${container.inventory.items.length ? (playerInput.touch ? '选中物品，点移动格位，再点目标格。' : '拖动物品至右侧，完成拾取。') : '已搜空 · 仍可放入物品。'}<br>留在这里的物资仅保留至本局结束。</div></section><section class="loot-player"><h3 class="section-title">角色物品栏 <span>背包 6 × 5</span></h3><div class="loot-carried"><div>${grid(loadout.bag, 'bag', 40)}<div class="inv-help">携行重量 <strong id="loot-weight">${app.raid?.carriedWeight().toFixed(1) || '0.0'}</strong> / ${SURVIVAL.carryLimit} kg · 含装备</div></div><div class="loot-safe"><h4>安全箱</h4>${grid(loadout.safe, 'safe', 40)}<p class="inv-help protected">撤离失败保留</p></div></div></section></div>${details()}<footer class="loot-footer"><span class="loot-status" role="status" aria-live="polite">${playerInput.touch ? '选中物品 → 移动格位 → 点目标格' : '拖入指定格子 · 绿色可放置，红色不可放置'}</span>${playerInput.touch ? '' : '<span><kbd>E</kbd> / <kbd>Tab</kbd> / <kbd>Esc</kbd> 关闭</span>'}</footer></section></div>`;
}
export function render() {
    cancelInventoryDrag();
    document.documentElement.dataset.state = app.state;
    document.documentElement.dataset.overlay = app.overlay;
    document.documentElement.dataset.container = app.mobileContainer;
    document.dispatchEvent(new Event('bincov-ui'));
    document.body.dataset.screen = app.state;
    app.game?.scale.updateBounds();
    if (app.state === 'menu') {
        const focusedAction = (document.activeElement as HTMLElement | null)?.dataset.action;
        const overlay = overlayHtml();
        ui().innerHTML = titleScreen({ runs: app.save.stats.runs, extracts: app.save.stats.extracts, motion: app.menuMotion,
            overlay: !!overlay, storageOK: app.storageOK, resume: !!app.checkpoint, touch: playerInput.touch }) + overlay;
        bind();
        if (overlay) {
            const modal = ui().querySelector<HTMLElement>('.modal');
            modal?.setAttribute('role', 'dialog');
            modal?.setAttribute('aria-modal', 'true');
            modal?.setAttribute('aria-label', modal.querySelector('h2')?.textContent || '行动指南');
            modal?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        } else if (focusedAction === 'close' || focusedAction === 'title-motion') {
            ui().querySelector<HTMLButtonElement>(`[data-action="${focusedAction === 'close' ? 'help' : 'title-motion'}"]`)?.focus({ preventScroll: true });
        }
        return;
    }
    if (app.state === 'hideout')
        renderHideout();
    if (app.state === 'run') {
        ui().innerHTML = `<div class="hud"><div class="hud-top"><div class="location"><div class="section-label">滨科夫 · 沿海封锁区</div><strong id="zone">封锁区</strong><div class="small" id="tide">潮位确认中</div></div><div class="timer"><strong id="timer">10:00</strong><small>撤离倒计时</small></div></div><div id="radio" class="radio">水产站：信号接通。撤离点已标记在地图上，别等到最后一分钟。</div><div class="hud-bottom"><div class="vitals"><div class="vital-row"><span>生命</span><span id="hp">100 / 100</span></div><div class="bar"><i id="hpbar"></i></div><div class="vital-row"><span>耐力</span><span id="stamina">100</span></div><div class="bar stamina"><i id="staminabar"></i></div><div class="vital-row" style="margin-bottom:0"><span id="status">状态正常</span><span id="weight">0 kg</span></div></div><div class="weapon-hud"><div class="eyebrow" id="gunname">${weaponName()}</div><div class="ammo" id="ammo">—</div><div class="small muted" id="reload">R 换弹　1 主武器　2 匕首</div></div></div><div class="keytips"><kbd>E</kbd>拾取 / 撤离　<kbd>Tab</kbd>背包　<kbd>Q</kbd>治疗　<kbd>M</kbd>地图　<kbd>Esc</kbd>暂停</div><div id="hit-directions" aria-hidden="true"></div><div class="raid-information"><button id="exit-navigation" data-action="map">选择撤离点</button><details id="raid-quests" ${app.tasksExpanded ? 'open' : ''}><summary>任务 <span id="raid-quest-count"></span></summary><div id="raid-quest-list"></div><small>回水产站交付 · 本局物资尚待带回</small></details></div><div id="interaction" class="interaction" style="display:none"></div><div id="warning"></div></div>${overlayHtml()}`;
        bind();
        if (app.raid?.player?.active) app.raid.updateHud();
        if (app.overlay === 'map')
            drawMap();
        return;
    }
    if (app.state === 'result') {
        const r = app.result;
        ui().innerHTML = `<div class="overlay"><div class="panel result"><div class="stamp">行动报告 <span>${r?.outcome === 'extract' ? '成功撤离' : '撤离失败'}</span></div><h2>${r?.outcome === 'extract' ? '你回来了。' : r?.outcome === 'timeout' ? '撤离时间已过。' : '未能撤离。'}</h2><p>${r?.outcome === 'extract' ? '装备和物资已带回水产站，进度已保存。' : '背包内的物资和主武器已丢失，安全箱内的物品和水手匕首保留。'}</p><div class="stats"><div><strong>${r?.kills || 0}</strong><span>击败敌人</span></div><div><strong>¥ ${r?.keptValue || 0}</strong><span>保留物资估值</span></div><div><strong>${app.save.stats.extracts} / ${app.save.stats.runs}</strong><span>累计撤离 / 出击</span></div></div>${btn('返回水产站　 →', 'return', 'primary')}</div></div>`;
        bind();
    }
}
function shopCheckout() {
    const c = cart(), totals = Shop.cartTotals(c);
    return `<div class="shop-checkout"><strong>${totals.net >= 0 ? '需付' : '可得'} ¥ ${Math.abs(totals.net)}</strong>${btn('统一结算', 'checkout', 'primary', Shop.cartDirty(c) ? '' : 'disabled')}<span>背包、安全箱物品请先移入仓库。救济物资不可出售。</span></div>`;
}
function renderHideout() {
    const s = app.save;
    let body = '';
    if (app.tab === 'gear') {
        const weight = preparedWeight();
        body = `${playerInput.touch ? `<div class="mobile-inventory-tabs">${[['stash','仓库'],['bag','背包'],['safe','安全箱 / 装备']].map(([id,label]) => btn(label, 'container', app.mobileContainer === id ? 'active' : '', `data-id="${id}"`)).join('')}${btn(app.inventoryGrid ? '物资列表' : '格位整理', 'grid-mode')}</div>` : ''}${placementControls()}<div class="columns gear-columns"><section class="stash-section"><h3 class="section-title">仓库 <span>${occupied(s.stash)} / ${s.stash.w * s.stash.h} 格</span></h3>${grid(s.stash, 'stash')}<div class="inv-help">${s.upgraded ? '已扩建 · 10 × 9 格' : '未扩建 · 10 × 6 格'}</div></section><section class="bag-section"><h3 class="section-title">背包 <span>${occupied(s.bag)} / ${s.bag.w * s.bag.h} 格</span></h3>${grid(s.bag, 'bag')}<div class="load-meter ${weight > SURVIVAL.carryLimit ? 'overloaded' : ''}"><span>负重</span><strong>${weight.toFixed(1)} <small>/ ${SURVIVAL.carryLimit} kg</small></strong><i style="width:${Math.min(100, weight / SURVIVAL.carryLimit * 100)}%"></i></div><div class="inv-help">含装备、弹药与安全箱</div></section><section class="safe-section"><h3 class="section-title">安全箱</h3>${grid(s.safe, 'safe')}<div class="inv-help protected">撤离失败也保留</div><div class="equip"><div class="section-label">${s.equipment.weapon ? '主武器' : '随身匕首'}</div><div class="equipped-icon">${itemIcon(s.equipment.weapon || 'knife')}</div><strong>${D.WEAPONS[s.equipment.weapon || 'knife'].name}</strong>${s.equipment.weapon ? `<div class="inv-help">弹匣 ${s.equipment.ammo} 发</div>${btn('卸下', 'unequip', 'text-button')}` : '<div class="inv-help">始终保留</div>'}</div></section>${details()}</div>`;
    } else if (app.tab === 'arms' || app.tab === 'med') {
        const c = cart(), merchant = D.MERCHANTS[c.merchant], totals = Shop.cartTotals(c);
        body = `<div class="merchant-heading"><div><h3>${merchant.name}<span>${merchant.subtitle}</span></h3><p>先选物品，再一起结算。放回原侧可取消。</p></div></div>${placementControls()}<div class="shop-layout"><section><h3>商人物品 · 按包购买</h3>${grid(c.catalog, 'merchant', 36)}</section><section class="shop-buffer"><div><h3>待买 · ¥ ${totals.buy}</h3>${grid(c.buy, 'buy', 36)}</div><div><h3>待卖 · ¥ ${totals.sell}</h3>${grid(c.sell, 'sell', 36)}</div></section><section><h3>仓库 · 整组出售</h3>${grid(c.stash, 'stash', 36)}</section></div>${details()}`;
    } else if (app.tab === 'quests') {
        body = `<div class="quests">${Object.entries(D.QUESTS).map(([id, q], i) => {
            const complete = s.quests[id];
            const needs = Object.entries(q.needs).map(([itemId, needed]) => ({ itemId, needed, have: [s.stash, s.bag, s.safe].reduce((sum, inv) => sum + D.count(inv, itemId), 0) }));
            const ready = needs.every(({ have, needed }) => have >= needed);
            return `<article class="quest ${complete ? 'complete' : ''}"><div class="quest-status"><span class="mono">0${i + 1}</span><span>${complete ? '已交付' : ready ? '可以交付' : '等待物资'}</span></div><h3>${q.name}</h3><p>${q.description}</p>${complete ? `<p class="quest-reply">${q.radio}</p>` : `<ul class="quest-needs">${needs.map(({ itemId, needed, have }) => {
                return `<li class="${have >= needed ? 'ready' : ''}"><span>${D.ITEMS[itemId].name}</span><strong>${Math.min(have, needed)} <span>/ ${needed}</span></strong></li>`;
            }).join('')}</ul>`}<div class="quest-footer"><div><strong>¥ ${q.reward}</strong><span>${id === 'repair' ? '另解锁仓库扩建' : '任务报酬'}</span></div>${complete ? '<span class="completion-mark">✓ 已完成</span>' : btn('交付物资', 'quest', ready ? 'primary' : '', `data-id="${id}"`)}</div></article>`;
        }).join('')}</div><p class="content-note">交付时会扣除仓库、背包或安全箱中的所需物资。放进安全箱的任务物品，撤离失败也保留。</p>`;
    } else {
        body = `<div class="station-layout"><section class="station-log"><div class="section-label">水产站值守记录 · 第 17 天</div><h3>${s.quests.repair ? '供电已恢复。' : '目前靠应急电源供电。'}</h3><p class="station-copy">出击前查好路线，涉水会积累污染。<br>以下时间从出击开始计算。</p><dl class="tide-notes"><div><dt>04:30</dt><dd>电台预警，离开浅滩。</dd></div><div><dt>05:00</dt><dd>潮位变化，高架路与海堤仍可通行。</dd></div></dl><div class="station-upgrade">${btn(s.upgraded ? '仓库已扩建' : `扩建仓库 · ¥ ${D.STASH_UPGRADE_COST}`, 'upgrade', '', s.upgraded ? 'disabled' : '')}<p class="inv-help">${s.upgraded ? '仓库容量已增至 90 格。' : `完成「${D.QUESTS.repair.name}」后可扩建至 90 格。`}</p></div></section><section class="station-controls"><div class="station-stats"><div><strong>${s.stats.runs}</strong><span>累计出击</span></div><div><strong>${s.stats.extracts}</strong><span>成功撤离</span></div><div><strong>${s.stats.kills}</strong><span>击败敌人</span></div></div><label class="volume-control"><span>游戏音量 <span id="volume-label">${Math.round(s.settings.volume * 100)}%</span></span><input aria-label="游戏音量" id="volume" type="range" min="0" max="1" step="0.05" value="${s.settings.volume}"></label><div class="save-controls"><div><h3>本地存档</h3><p>更换浏览器或游玩地址前，请先导出备份。</p></div><div class="save-actions">${btn('导出存档', 'export-save')}${btn('导入存档', 'import-save')}</div><input id="backup-file" type="file" accept=".json,application/json" hidden></div><div class="station-links">${btn('行动指南', 'help', 'text-button')}${btn('返回主菜单', 'menu', 'text-button')}</div></section></div>`;
    }
    ui().innerHTML = `<div class="panel hideout ${shopping() ? 'shopping' : ''}"><header class="topbar"><div class="station-identity"><span class="section-label">滨科夫 · 沿海避难点</span><h2>滨科夫水产站</h2></div><div class="right"><span class="station-signal"><i></i>${s.quests.repair ? '供电已恢复 · 信号稳定' : '应急供电 · 信号微弱'}</span><div class="cash"><span>可用现金</span><strong>¥ ${s.cash.toLocaleString()}</strong></div></div></header><nav class="tabs" aria-label="水产站功能">${[['gear', '整备'], ['arms', '修理铺'], ['med', '卫生所'], ['quests', '电台任务'], ['home', '水产站']].map(([id, name]) => btn(name, 'tab', app.tab === id ? 'active' : '', `data-id="${id}" ${app.tab === id ? 'aria-current="page"' : ''}`)).join('')}</nav><div class="content ${shopping() ? 'shop-content' : ''}">${body}</div><footer class="bottom-bar">${shopping() ? shopCheckout() : `<div class="departure-note"><strong>沿海封锁区 <span>每局限时 10 分钟</span></strong><p>撤离失败会丢失背包物资和主武器，安全箱保留。</p></div>`}<label class="seed-label">行动种子 <input class="seed" aria-label="行动种子" title="留空随机生成；输入相同的数字或文字，可重现本局初始配置。" id="seed" placeholder="留空随机" value="${esc(app.seed)}" maxlength="16"></label><div class="departure-check"><p id="departure-warnings">${departureWarnings(s).join(' · ') || '装备与快捷补给已备齐'}</p>${btn('出击 <span aria-hidden="true">→</span>', 'deploy', 'primary')}</div></footer></div>${overlayHtml()}`;
    bind();
}
function overlayHtml() {
    if (!app.storageOK && app.state === 'menu')
        return `<div class="overlay"><div class="panel modal"><div class="section-label orange">本地存档</div><h2>暂时无法打开存档</h2><p>${esc(app.storageError || '请允许浏览器存储后刷新重试。')}</p><div class="actions">${btn('导出原始存档', 'export-original')}${btn('刷新重试', 'refresh', 'primary')}</div></div></div>`;
    if (app.overlay === 'checkpoint-error')
        return `<div class="overlay"><div class="panel modal"><div class="section-label orange">本地存档</div><h2>本局暂时无法保存</h2><p>行动已暂停。最近成功保存：${app.lastSavedAt ? new Date(app.lastSavedAt).toLocaleTimeString() : '尚无'}。</p><p>请恢复浏览器存储后重试。也可以先导出当前行动备份，避免丢失本次进度。</p><div class="actions">${btn('重试保存', 'retry-checkpoint', 'primary')}${btn('导出行动备份', 'export-save')}</div></div></div>`;
    if (app.overlay === 'rotate')
        return `<div class="overlay"><div class="panel modal"><div class="section-label">行动已暂停</div><h2>横过来，准备出发。</h2><p>横屏能看清沿海街区，也能同时移动和瞄准。转回横屏后，点击继续行动。</p><div class="actions">${btn('行动指南', 'help')}${btn('导出行动备份', 'export-save')}${btn('放弃行动', 'abandon', 'danger')}</div></div></div>`;

    if (app.pendingSettlement)
        return `<div class="overlay"><div class="panel modal"><div class="section-label orange">保存失败</div><h2>结算尚未保存</h2><p>行动已结束，本次结果暂存在当前页面。</p><p>${app.conflict ? '另一个窗口已更新存档。请先下载结算备份，再刷新页面。导入备份会覆盖该窗口保存的进度。' : '浏览器未能保存进度。请检查存储设置后重试，或先下载结算备份。'}</p><p class="small orange">保存成功或确认备份下载完成前，不要关闭或刷新页面。</p><div class="actions">${btn('重试保存', 'retry-save', 'primary', app.conflict ? 'disabled' : '')}${btn('下载结算备份', 'export-save')}</div><p class="small muted">备份包含本次行动结果，可在「水产站」页点击「导入存档」恢复。</p></div></div>`;
    if (app.overlay === 'import-save' && (app.pendingImport || app.pendingRecoveryImport))
        return `<div class="overlay"><div class="panel modal"><h2>导入这份存档？</h2><p>现金 ¥ ${(app.pendingImport || app.pendingRecoveryImport!.profile).cash} · 累计出击 ${(app.pendingImport || app.pendingRecoveryImport!.profile).stats.runs} 次</p><p>导入会替换此浏览器中本游戏的进度，两个存档不会合并。请先导出当前存档。</p><div class="actions">${btn('先导出当前存档', 'export-save')}${btn('确认导入', 'confirm-import', 'primary')}${btn('取消', 'close')}</div></div></div>`;
    if (!app.overlay)
        return '';
    if (app.overlay === 'shop-leave') return `<div class="overlay"><section class="panel modal"><h2>放弃未结算的清单？</h2><p>待买、待卖和仓库位置会恢复。现金与物资尚未改变。</p><div class="actions">${btn('继续挑选', 'close')}${btn('放弃清单并离开', 'shop-leave-confirm', 'danger')}</div></section></div>`;
    if (app.overlay === 'shop-quest') return `<div class="overlay"><section class="panel modal"><h2>这些任务物资会不够交付</h2><ul>${Shop.saleWarnings(app.save, cart()).map(w => `<li>「${w.quest}」需要 ${D.ITEMS[w.id].name} ${w.needed} 件；本次卖出 ${w.sold} 件，整笔交易后剩 ${w.remaining} 件。</li>`).join('')}</ul><div class="actions">${btn('取消，继续挑选', 'close')}${btn('仍要结算', 'checkout-confirm', 'danger')}</div></section></div>`;
    if (app.overlay === 'loot') return lootHtml();
    if (['nearby', 'supplies', 'reading'].includes(app.overlay))
        return `<div class="overlay"><div class="panel quick-modal"><header class="inventory-header"><div><strong>${app.overlay === 'nearby' ? '附近物品' : app.overlay === 'supplies' ? '药品与补给' : esc(app.reading?.title || '附近记录')}</strong><span class="small">不暂停行动</span></div>${btn('关闭', 'close')}</header><div class="quick-body">${quickContent()}</div></div></div>`;
    if (app.overlay === 'inventory' && app.loadout && playerInput.touch) return mobileInventory();
    if (app.overlay === 'inventory' && app.loadout)
        return `<div class="overlay inventory-overlay"><div class="panel inventory-modal"><div class="section-title">背包 <span>${playerInput.touch ? '不暂停行动' : '不暂停行动 · Tab 关闭'}</span></div>${placementControls()}<div class="columns"><div>${grid(app.loadout.bag, 'bag', 44)}<div class="inv-help">负重 ${app.raid?.carriedWeight().toFixed(1)} / ${SURVIVAL.carryLimit} kg　·　含装备与安全箱</div></div><div><div class="section-title">安全箱</div>${grid(app.loadout.safe, 'safe', 44)}<div class="inv-help">撤离失败也保留</div></div>${details()}</div>${btn('关闭背包', 'close', 'text-button')}</div></div>`;
    if (app.overlay === 'map')
        return `<div class="overlay"><div class="panel map-modal"><div class="section-title">沿海封锁区地图 <span>${playerInput.touch ? '不暂停行动' : '不暂停行动 · M 关闭'}</span></div><label class="exit-choice">撤离指引 <select id="exit-choice" aria-label="选择撤离点"><option value="">暂不选择</option>${app.raid?.config.exits.map(e => `<option value="${esc(e.name)}" ${app.selectedExit === e.name ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select><span>只显示方位和直线距离，请自行判断道路与潮位。</span></label><canvas id="map" width="690" height="400"></canvas><div class="legend"><span>● 你的位置　 <span style="color:#d0df91">▣ 本局撤离点</span></span><span>灰绿：高架路　浅滩：低潮青绿、高潮暗红</span>${btn('关闭地图', 'close', 'text-button')}</div></div></div>`;
    if (app.overlay === 'pause')
        return `<div class="overlay"><div class="panel modal"><div class="section-label">沿海封锁区</div><h2>行动暂停</h2><p>行动已暂停。刷新后可从最近成功保存的进度继续，少量未保存进度可能回退。</p><label class="small">游戏音量 <span id="volume-label">${Math.round(app.save.settings.volume * 100)}%</span><input id="volume" aria-label="游戏音量" type="range" min="0" max="1" step="0.05" value="${app.save.settings.volume}"></label><div class="actions">${btn('继续行动', 'close', 'primary')}${btn('行动指南', 'help')}${btn('放弃行动', 'abandon', 'danger')}${btn('导出行动备份', 'export-save')}</div></div></div>`;
    if (app.overlay === 'abandon')
        return `<div class="overlay"><div class="panel modal"><h2>放弃这次行动？</h2><p>背包内的物资和主武器会丢失。安全箱内的物品和水手匕首会保留。</p><div class="actions">${btn('返回暂停菜单', 'pause', 'primary')}${btn('确认放弃', 'confirm-abandon', 'danger')}</div></div></div>`;
    return `<div class="overlay"><div class="panel modal" style="width:610px"><div class="section-label">${playerInput.touch ? '手机触控操作' : '键盘与鼠标操作'}</div><h2>行动指南</h2>${playerInput.touch ? '<p class="touch-guide">左盘移动，外圈冲刺；右盘内圈瞄准、外圈持续开火，松开即停。靠近物资点击「拾取」，在撤离区停稳并按住「撤离」3 秒。地图和背包不暂停。</p>' : ''}<div class="help-grid">${[['W A S D', '移动'], ['鼠标', '瞄准'], ['左键 / 右键', '攻击 / 精瞄'], ['Shift', '冲刺'], ['R', '换弹'], ['E', '拾取 / 搜刮 / 阅读'], ['按住 E 3 秒', '撤离（绿色标记内）'], ['Q', '快捷治疗'], ['Tab', '背包（不暂停）'], ['M', '地图（不暂停）'], ['1 / 2', '主武器 / 匕首'], ['Esc', '暂停 / 关闭面板']].map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div><p>每局限时 10 分钟。备用弹药放在背包中，${playerInput.touch ? '靠近物资点击拾取，打开地图查看本局撤离点。在绿色圈内站稳，按住撤离按钮满 3 秒。' : '靠近箱子或尸体后，用滚轮切换高亮目标，按 E 打开双栏；关闭后可再选其他目标。散落物按 E 拾取，与箱子或尸体重叠时点「附近」拾取。物品可拖入背包、安全箱或放回。搜刮不暂停。按 M 查看本局撤离点，在绿色圈内站稳，按住 E 满 3 秒撤离。'}</p><p>出击 4 分 30 秒后电台预警，5 分钟时潮位变化。涉水会积累污染；在背包中使用除藻药剂可降低污染。${playerInput.touch ? '治疗按钮' : 'Q'}使用背包中的绷带或急救包。</p><p>行动中死亡、超时或放弃均按撤离失败处理：丢失背包物资和主武器，保留安全箱内的物品和水手匕首。刷新可恢复最近成功保存的进度。</p>${btn('关闭指南', 'close', 'primary')}</div></div>`;
}
function clearLootContext() {
    if (app.lootContext || app.overlay === 'loot') app.raid?.suppressHeldInput?.();
    app.lootContext = null;
    activeDrag = null;
    clearSelection(); app.selectedSource = '';
}
export function openLoot(containerId: string, runId: string): boolean {
    if (app.overlay || !app.raid?.canLootContainer(containerId, runId)) return false;
    app.lootContext = { containerId, runId };
    setOverlay('loot');
    return true;
}
export function closeOverlay() { setOverlay(app.overlay === 'help' ? app.helpReturn : ''); }
export function setOverlay(value: string) {
    if (app.overlay === 'checkpoint-error' && value !== 'checkpoint-error' && !app.storageOK) return;
    if (!value && playerInput.touch && app.state === 'run' && (innerWidth < innerHeight || innerHeight < 280)) value = 'rotate';
    const wasPaused = app.state === 'run' && app.raid?.paused;
    if (value !== 'loot') clearLootContext();
    else app.raid?.suppressHeldInput();
    app.raid?.releaseInput(); playerInput.clear();
    if (value === 'help' && app.overlay !== 'help') app.helpReturn = app.overlay;
    app.overlay = app.pendingSettlement ? 'save-error' : value; clearSelection();
    if (['pause','help','abandon','rotate'].includes(app.overlay)) { app.raid?.checkpoint(); audio.stop(); }
    else if (wasPaused && app.raid && !app.raid.paused) audio.start();
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
        toast('已生成备份文件，请确认下载完成。');
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
export function mutate(action: SessionMutation, message = '', rejectionMessage: string | null = '操作未完成，请检查所需物资和可用空间。'): boolean {
    const result = saveSession.mutate(action, app.raid);
    if (result === 'blocked') return false;
    if (result === 'rejected') {
        if (rejectionMessage) toast(rejectionMessage);
        render();
        return false;
    }
    if (result === 'save-failed') {
        clearSelection();
        if (app.state === 'run') { setOverlay('checkpoint-error'); audio.stop(); }
        toast('保存失败，物资和进度已恢复到操作前。请检查浏览器存储设置后重试。');
        render();
        return false;
    }
    if (message) toast(message);
    clearSelection(); render(); return true;
}
function splitControl(item: D.Item) {
    return item.qty > 1 ? `<label class="split-control">拆分数量 <input id="split-quantity" type="number" min="1" max="${item.qty - 1}" step="1" value="1" aria-label="拆分数量"></label>${btn('拆分并放置', 'split-item')}` : '';
}
function beginDrag(uid: string, source: string): InventoryDrag {
    return { uid, source, token: ++dragToken, runId: app.state === 'run' ? app.loadout?.runId || null : null,
        containerId: app.lootContext?.containerId || null, rotated: inventory(source).items.find(i => i.uid === uid)?.rotated };
}
export function cancelInventoryDrag() {
    pointerDrag = null; activeDrag = null; dragGhost?.remove(); dragGhost = null;
    document.documentElement.classList.remove('inventory-dragging'); clearPlacementPreview();
}
function drawPointerDrag() {
    if (!pointerDrag || !activeDrag || !dragContextValid(activeDrag)) { cancelInventoryDrag(); return; }
    const item = inventory(activeDrag.source).items.find(i => i.uid === activeDrag!.uid);
    if (!item) { cancelInventoryDrag(); return; }
    const size = D.itemSize({ ...item, rotated: activeDrag.rotated ?? item.rotated });
    if (!dragGhost) { dragGhost = document.createElement('div'); dragGhost.className = 'inventory-drag-ghost'; document.body.append(dragGhost); }
    dragGhost.textContent = `${D.ITEMS[item.id].short} × ${item.qty}`;
    const dangerBottom = app.overlay === 'loot' ? document.querySelector('.loot-header')?.getBoundingClientRect().bottom || 0 : 0;
    Object.assign(dragGhost.style, { left: `${pointerDrag.x + 10}px`, top: `${Math.max(pointerDrag.y + 10, dangerBottom + 4)}px`, width: `${size.w * pointerDrag.cell}px`, height: `${size.h * pointerDrag.cell}px` });
    const target = document.elementFromPoint(pointerDrag.x, pointerDrag.y)?.closest<HTMLElement>('[data-grid]');
    if (target && ui().contains(target)) previewDrop(target, { clientX: pointerDrag.x, clientY: pointerDrag.y } as DragEvent);
    else clearPlacementPreview();
}
/** Pointer dragging keeps keyboard events available for R. Native shop drag still uses the same commit guard. */
export function installInventoryDrag() {
    addEventListener('pointermove', e => {
        if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
        if (!(e.buttons & 1)) { cancelInventoryDrag(); return; }
        pointerDrag.x = e.clientX; pointerDrag.y = e.clientY;
        if (!pointerDrag.started && Math.hypot(e.clientX - pointerDrag.startX, e.clientY - pointerDrag.startY) < 5) return;
        pointerDrag.started = true; activeDrag = pointerDrag.drag;
        document.documentElement.classList.add('inventory-dragging'); drawPointerDrag();
    });
    addEventListener('pointerup', e => {
        if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
        const started = pointerDrag.started, drag = activeDrag;
        if (started) {
            suppressDragClick = true; setTimeout(() => { suppressDragClick = false; }, 0);
            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-grid]');
            if (target && ui().contains(target) && drag && dragContextValid(drag)) {
                const dataTransfer = new DataTransfer(); dataTransfer.setData('text/plain', JSON.stringify(drag));
                commitDrop(target, new DragEvent('drop', { clientX: e.clientX, clientY: e.clientY, dataTransfer }));
            }
        }
        cancelInventoryDrag();
    });
    addEventListener('click', e => { if (suppressDragClick) { e.preventDefault(); e.stopImmediatePropagation(); suppressDragClick = false; } }, true);
    addEventListener('keydown', e => {
        if (!pointerDrag?.started || !activeDrag) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cancelInventoryDrag(); }
        else if (e.key.toLowerCase() === 'r') {
            e.preventDefault(); e.stopImmediatePropagation();
            if (e.repeat || !dragContextValid(activeDrag)) return;
            activeDrag.rotated = !(activeDrag.rotated ?? false); drawPointerDrag();
        }
    }, true);
    addEventListener('pointercancel', cancelInventoryDrag);
    addEventListener('blur', cancelInventoryDrag);
    addEventListener('pagehide', cancelInventoryDrag);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelInventoryDrag(); });
    document.addEventListener('pointerout', e => { if (!e.relatedTarget) cancelInventoryDrag(); });
}
function clearPlacementPreview() {
    ui().querySelectorAll('.drop-preview').forEach(node => node.remove());
}
function dragContextValid(drag: InventoryDrag) {
    if (!activeDrag || drag.token !== activeDrag.token || drag.uid !== activeDrag.uid || drag.source !== activeDrag.source || app.conflict || app.pendingSettlement) return false;
    if (drag.runId !== (app.state === 'run' ? app.loadout?.runId || null : null)) return false;
    if (drag.containerId !== (app.lootContext?.containerId || null)) return false;
    if (drag.containerId && (!app.lootContext || !app.raid?.canLootContainer(drag.containerId, app.lootContext.runId))) return false;
    return true;
}
function dropPosition(el: HTMLElement, e: DragEvent) {
    const cell = Number(el.dataset.cell), r = el.getBoundingClientRect(), scale = r.width / el.offsetWidth;
    return { x: Math.floor((e.clientX - r.left) / scale / cell), y: Math.floor((e.clientY - r.top) / scale / cell), cell };
}
function previewDrop(el: HTMLElement, e: DragEvent) {
    clearPlacementPreview();
    if (!activeDrag || !dragContextValid(activeDrag)) return;
    const from = inventory(activeDrag.source), to = inventory(el.dataset.grid!);
    const item = from.items.find(i => i.uid === activeDrag!.uid);
    if (!item) return;
    const { x, y, cell } = dropPosition(el, e), def = D.ITEMS[item.id], size = D.itemSize({ ...item, rotated: activeDrag.rotated ?? item.rotated });
    const error = shopping() ? Shop.shopPlacementError(cart(), activeDrag.source as Shop.ShopSource, el.dataset.grid as Shop.ShopSource, item.uid, x, y) : placementError(from, to, item.uid, x, y, activeDrag.rotated);
    const preview = document.createElement('div');
    preview.className = 'drop-preview' + (error ? ' invalid' : '');
    preview.dataset.valid = String(!error);
    Object.assign(preview.style, { left: `${x * cell}px`, top: `${y * cell}px`, width: `${size.w * cell}px`, height: `${size.h * cell}px` });
    el.appendChild(preview);
    const status = ui().querySelector('.loot-status');
    if (status) status.textContent = error || `放置 ${def.name} × ${item.qty} · ${size.w}×${size.h} 格`;
}
function transferLootItem(source: string, target: string, uid: string, x: number, y: number, rotated = app.placementRotated, quantity = app.placementQuantity) {
    const error = placementError(inventory(source), inventory(target), uid, x, y, rotated, quantity);
    if (error) { toast(error); return; }
    const context = app.lootContext, container = activeLoot();
    if (!context || !container || !app.raid?.canLootContainer(context.containerId, context.runId)) { setOverlay(''); return; }
    const result = saveSession.transferLoot(container, { ...context, from: source as LootEndpoint, to: target as LootEndpoint, uid, x, y, rotated, quantity });
    if (result === 'committed') { audio.pickup(); clearSelection(); app.selectedSource = ''; }
    else {
        toast(result === 'save-failed' ? '保存失败，本次转移已撤回。物品仍在原处。' : result === 'blocked' ? '当前无法转移物品，请先处理存档状态。' : '无法放置：物品或来源已变化，请重新选择。');
        if (result === 'save-failed') { setOverlay('checkpoint-error'); audio.stop(); }
    }
    render();
}
function commitDrop(el: HTMLElement, e: DragEvent) {
    e.preventDefault(); clearPlacementPreview();
    try {
        const drag = JSON.parse(e.dataTransfer?.getData('text/plain') || 'null') as InventoryDrag | null;
        if (!drag || !dragContextValid(drag)) return;
        const target = el.dataset.grid!, { x, y } = dropPosition(el, e), rotated = activeDrag!.rotated;
        const error = shopping() ? Shop.shopPlacementError(cart(), drag.source as Shop.ShopSource, target as Shop.ShopSource, drag.uid, x, y) : placementError(inventory(drag.source), inventory(target), drag.uid, x, y, rotated);
        // Consume the browser drag once, including rejected placements.
        activeDrag = null;
        if (error) { toast(error); render(); return; }
        if (shopping()) { Shop.moveShopItem(cart(), drag.source as Shop.ShopSource, target as Shop.ShopSource, drag.uid, x, y); clearSelection(); render(); }
        else if (app.overlay === 'loot') {
            transferLootItem(drag.source, target, drag.uid, x, y, rotated);
        } else {
            mutate(() => moveQuantity(inventory(drag.source), inventory(target), drag.uid, x, y, rotated));
        }
    } catch { activeDrag = null; toast('拖放未完成，物品仍在原处。'); }
}
function bind() {
    ui().querySelectorAll<HTMLElement>('[data-action]').forEach(el => el.onclick = () => {
        const a = el.dataset.action!, id = el.dataset.id!;
        if (app.conflict && !['export-save', 'export-original', 'refresh'].includes(a)) {
            toast('另一个窗口已更新存档。请刷新此页，加载最新进度。');
            return;
        }
        audio.start();
        audio.click();
        if (app.pendingSettlement && a !== 'export-save' && a !== 'retry-save') return;
        if (app.selectedSource === 'container' && ['equip', 'equip-run', 'use', 'secure', 'drop', 'sell', 'transfer'].includes(a)) return;
        if (shopping() && ['tab', 'deploy', 'menu'].includes(a) && !(a === 'tab' && id === app.tab) && Shop.cartDirty(cart())) {
            app.shopLeave = { action: a as 'tab' | 'deploy' | 'menu', id }; setOverlay('shop-leave'); return;
        }
        switch (a) {
            case 'checkout': if (Shop.saleWarnings(app.save, cart()).length) setOverlay('shop-quest'); else checkout(); break;
            case 'checkout-confirm': checkout(); break;
            case 'shop-leave-confirm': {
                const next = app.shopLeave; app.shopLeave = null; app.shop = null; app.overlay = ''; clearSelection();
                if (next?.action === 'tab') { app.tab = next.id; render(); }
                else if (next?.action === 'menu') changeState('menu');
                else if (next?.action === 'deploy') deploy();
                break;
            }
            case 'container': app.mobileContainer = id; if (!app.placement) clearSelection(); render(); break;
            case 'run-container': app.runContainer = id; if (!app.placement) clearSelection(); render(); break;
            case 'grid-mode': app.inventoryGrid = !app.inventoryGrid; clearSelection(); render(); break;
            case 'place-item': app.placement = true; app.placementQuantity = undefined; app.placementRotated = undefined; if (app.selectedSource === 'stash') app.inventoryGrid = true; render(); break;
            case 'split-item': {
                const item = selected(), qty = Number((document.getElementById('split-quantity') as HTMLInputElement)?.value);
                if (!item || !Number.isInteger(qty) || qty < 1 || qty >= item.qty) { toast('请输入小于当前数量的正整数。'); break; }
                app.placement = true; app.placementQuantity = qty; app.placementRotated = undefined; if (app.selectedSource === 'stash') app.inventoryGrid = true; render(); break;
            }
            case 'rotate-preview': app.placementRotated = !(app.placementRotated ?? selected()?.rotated); render(); break;
            case 'rotate-item': {
                const i = selected(); if (!i) break;
                if (app.overlay !== 'loot' && D.fits(inventory(app.selectedSource), i.id, i.x, i.y, i.uid, !i.rotated)) mutate(() => D.rotateItem(inventory(app.selectedSource), i.uid));
                else { app.placement = true; app.placementQuantity = undefined; app.placementRotated = !i.rotated; if (app.selectedSource === 'stash') app.inventoryGrid = true; render(); }
                break;
            }
            case 'clear-selection': clearSelection(); render(); break;
            case 'use-supply': {
                const source = el.dataset.source === 'safe' ? 'safe' : 'bag', item = inventory(source).items.find(i => i.uid === id);
                if (item && supplies.includes(item.id)) mutate(() => app.raid?.useItem(item.id, inventory(source), item.uid) ?? false, '', null);
                else { toast('这件补给已不可用。'); render(); }
                break;
            }
            case 'pickup-loot': app.raid?.pickupLoot(id); refreshQuickPanel(); break;
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
            case 'title-motion':
                if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    toast('系统已开启「减少动态效果」，景物保持静止。');
                    break;
                }
                app.menuMotion = !app.menuMotion;
                app.game?.scene.getScene('Menu').events.emit('title-motion', app.menuMotion);
                render();
                break;
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
                    toast('上次行动中断，已按撤离失败处理。安全箱内的物品和水手匕首保留。');
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
                closeOverlay();
                break;
            case 'map': setOverlay('map'); break;
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
                if (app.tab !== id) app.shop = null;
                app.tab = id;
                clearSelection();
                render();
                break;
            case 'deploy': deploy(); break;
            case 'quest':
                mutate(() => D.submitQuest(app.save, id), D.QUESTS[id].radio, '物资还没凑齐，请查看任务清单。');
                break;
            case 'upgrade':
                mutate(() => D.upgradeStash(app.save), '仓库已扩建。', `扩建需要完成「${D.QUESTS.repair.name}」，并支付 ¥${D.STASH_UPGRADE_COST}。`);
                break;
            case 'unequip':
                mutate(() => D.unequip(app.save), '主武器已放入仓库。', '仓库放不下武器和枪内子弹，请先腾出空间。');
                break;
            case 'relief':
                mutate(() => D.grantRelief(app.save), '救济物资已放入背包或仓库，放不下的留在水产站。', '暂时领不了救济补给，请先整理背包或仓库。');
                break;
            case 'sell':
                toast(app.selectedSource === 'stash' ? '将物品放进待卖区，再统一结算。' : '先在整备中移入仓库，再到商店出售。');
                app.tab = 'arms'; app.shop = null; clearSelection(); render();
                break;
            case 'equip':
                mutate(() => D.equip(app.save, app.selected), '主武器已装备。', '无法装备，请给换下的武器和弹药腾出空间。');
                break;
            case 'equip-run':
                mutate(() => app.raid?.equipItem(app.selected) ?? false);
                app.selected = '';
                render();
                break;
            case 'transfer': {
                const to = app.selectedSource === 'stash' ? 'bag' : 'stash';
                mutate(() => D.transferItem(inventory(app.selectedSource), inventory(to), app.selected), '物资已转移。', '放不下这件物品，请先整理目标容器。');
                break;
            }
            case 'secure': {
                const to = app.selectedSource === 'safe' ? 'bag' : 'safe';
                mutate(() => D.transferItem(inventory(app.selectedSource), inventory(to), app.selected), '物资已转移。', '放不下这件物品，请先整理目标容器。');
                break;
            }
            case 'use': {
                const i = selected();
                // useItem already explains why treatment is unnecessary; keep that message.
                if (i) mutate(() => app.raid?.useItem(i.id, inventory(app.selectedSource), i.uid) ?? false, '', null);
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
    ui().querySelectorAll<HTMLElement>('[data-uid]').forEach(el => { el.onclick = () => { if (app.placement) return; app.selected = el.dataset.uid!; app.selectedSource = el.dataset.source!; ui().querySelectorAll<HTMLElement>('[data-uid]').forEach(node => { const active = node.dataset.uid === app.selected; node.classList.toggle('selected', active); node.setAttribute('aria-pressed', String(active)); }); const panel = ui().querySelector('.details'); if (panel)
        panel.outerHTML = details(); bind(); }; el.onkeydown = e => { if (e.key === 'Enter')
        el.click(); }; el.ondblclick = () => { if (app.state !== 'hideout' || app.conflict || shopping())
        return; const from = el.dataset.source!; mutate(() => D.transferItem(inventory(from), inventory(from === 'stash' ? 'bag' : 'stash'), el.dataset.uid!)); };
        el.onpointerdown = e => {
            if (playerInput.touch || shopping() || e.button !== 0 || app.placement || app.conflict || app.pendingSettlement) return;
            const grid = el.closest<HTMLElement>('[data-grid]'); if (!grid) return;
            const drag = beginDrag(el.dataset.uid!, el.dataset.source!);
            pointerDrag = { pointerId: e.pointerId, drag, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
                cell: Number(grid.dataset.cell) * grid.getBoundingClientRect().width / grid.offsetWidth, started: false };
            el.setPointerCapture(e.pointerId);
        };
        el.ondragstart = e => {
            if (app.conflict || app.pendingSettlement || !e.dataTransfer) { e.preventDefault(); return; }
            activeDrag = beginDrag(el.dataset.uid!, el.dataset.source!);
            e.dataTransfer.setData('text/plain', JSON.stringify(activeDrag)); e.dataTransfer.effectAllowed = 'move';
        };
        el.ondragend = () => { activeDrag = null; clearPlacementPreview(); };
    });
    ui().querySelectorAll<HTMLElement>('[data-grid]').forEach(el => {
        el.onclick = e => {
            if (!app.placement || !app.selected) return;
            const r = el.getBoundingClientRect(), cell = Number(el.dataset.cell);
            const x = Math.floor((e.clientX - r.left) / (r.width / el.offsetWidth) / cell), y = Math.floor((e.clientY - r.top) / (r.height / el.offsetHeight) / cell);
            if (shopping()) { if (Shop.moveShopItem(cart(), app.selectedSource as Shop.ShopSource, el.dataset.grid as Shop.ShopSource, app.selected, x, y)) { clearSelection(); render(); } else toast('请按清单规则放入有效空格。'); return; }
            if (app.overlay === 'loot') { transferLootItem(app.selectedSource, el.dataset.grid!, app.selected, x, y); return; }
            if (mutate(() => moveQuantity(inventory(app.selectedSource), inventory(el.dataset.grid!), app.selected, x, y, app.placementRotated, app.placementQuantity))) { clearSelection(); render(); }
        };

        el.ondragover = e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; previewDrop(el, e); };
        el.ondragleave = e => { if (!el.contains(e.relatedTarget as Node | null)) clearPlacementPreview(); };
        el.ondrop = e => commitDrop(el, e);
    });
    const exitChoice = document.getElementById('exit-choice') as HTMLSelectElement | null;
    if (exitChoice) exitChoice.onchange = () => { app.selectedExit = exitChoice.value; app.raid?.updateHud(); };
    const questPanel = document.getElementById('raid-quests') as HTMLDetailsElement | null;
    if (questPanel) questPanel.ontoggle = () => { app.tasksExpanded = questPanel.open; };
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
            if (selectedFile.size > SESSION_MAX_BYTES + 512) throw new Error('文件超过行动备份大小限制，请选择游戏导出的备份。');
            const candidate = decodePortableBackup(await selectedFile.text());
            if (app.state !== 'hideout' || app.conflict || app.pendingSettlement) return;
            app.pendingImport = candidate.kind === 'settled' ? candidate.save : null; app.pendingRecoveryImport = candidate.kind === 'session' ? candidate.record : null; setOverlay('import-save');
        } catch (error) { toast(error instanceof Error ? error.message : '无法读取存档文件。'); }
        file.value = '';
    };
}
export function drawMap() {
    const canvas = document.getElementById('map') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!, sx = canvas.width / WORLD_W, sy = canvas.height / WORLD_H;
    ctx.fillStyle = '#0e1a1b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    WORLD.tiles.forEach((row, y) => row.forEach((t, x) => {
        ctx.fillStyle = ['#384b3e', '#849178', '#12363b', '#141e1b', app.raid?.highTide ? '#724840' : '#44665a', '#69735d', '#8e805b'][t] || '#222';
        ctx.fillRect(x * 32 * sx, y * 32 * sy, 32 * sx + 1, 32 * sy + 1);
    }));
    const bounds = canvas.getBoundingClientRect();
    const fontSize = playerInput.touch ? Math.ceil(12 / Math.min(bounds.width / canvas.width, bounds.height / canvas.height)) : 11;
    ctx.font = `${fontSize}px "Microsoft YaHei"`; ctx.textAlign = 'center';
    const label = (name: string, x: number, y: number) => {
        if (playerInput.touch) {
            const half = ctx.measureText(name).width / 2 + 3;
            x = Math.max(half, Math.min(canvas.width - half, x));
            y = Math.max(fontSize + 3, Math.min(canvas.height - 4, y));
        }
        ctx.fillText(name, x, y);
    };
    WORLD.zones.forEach(z => { ctx.fillStyle = '#f0e4b8'; label(z.name, (z.x + z.w / 2) * sx, (z.y + z.h / 2) * sy); });
    app.raid?.config.exits.forEach(e => {
        ctx.strokeStyle = '#d7ed90'; ctx.lineWidth = 2;
        ctx.strokeRect(e.x * sx - 6, e.y * sy - 6, 12, 12);
        ctx.fillStyle = '#d7ed90'; label(e.name, e.x * sx, e.y * sy - 12);
    });
    if (app.raid) {
        ctx.fillStyle = '#fff'; ctx.beginPath();
        ctx.arc(app.raid.player.x * sx, app.raid.player.y * sy, 4, 0, Math.PI * 2); ctx.fill();
    }
}
