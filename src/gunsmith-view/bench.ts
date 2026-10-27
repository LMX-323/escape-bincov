/**
 * The gunsmith workbench panel (#28 M2-05): one gun at a time, a private preview built by clicks, one confirm. The
 * station yard shows it as a full panel and the old tab page as an overlay; both hand it their HideoutRuntime and
 * route the clicks on `data-gs` controls to `act`. It never writes the save itself: every change goes through the
 * Runtime's GunsmithSession (preview, confirm, reset). The model it draws is gunsmith/bench.ts. Its stylesheet,
 * bench.css, goes into the yard's shadow root (station-view/route.ts) and into the page CSS (scripts/build.mjs).
 */
import * as D from '../domain';
import type { GunsmithSession, HideoutRuntime } from '../hideout-runtime/contract';
import { ATTACHMENTS, GUNS, type GunId } from '../gunsmith/catalog';
import type { Build } from '../gunsmith/compat';
import { buildOf, gunSize, nodesOf, type GunState } from '../gunsmith/instance';
import { devicesOn } from '../gunsmith/devices';
import type { GunEdit, GunEditPreview } from '../gunsmith/edit';
import {
    FACTORY_NAMES, POSITION_NAMES, SCORE_ROWS, WHERE_NAMES, benchGuns, benchParts, benchStats, candidateBuild, candidates, capped,
    positions, remountEdits, replaceEdits, without, type BenchGun, type BenchNumbers, type BenchScores, type Candidate, type Capped, type Position,
} from '../gunsmith/bench';
import { inventoryArtUrl } from '../art/item-images';
import { esc } from '../html';

export type BenchCue = 'ok' | 'error' | 'pick' | 'drop';
export interface BenchHost {
    toast(text: string, tone: 'ok' | 'error' | 'info'): void;
    sound(cue: BenchCue): void;
    /** A write failed or another window took the save over: the host's storage dialog takes it from here. */
    storage(): void;
}
/** What `act` asks the host to do next: paint again, or close the panel (nothing is left unconfirmed). */
export type BenchOutcome = 'render' | 'close';

/** Slots drawn above the gun; the rest go below it. */
const TOP = new Set(['stock', 'micro', 'top', 'handguard', 'barrel', 'muzzle']);
/** Long edit lists are rewritten as one removal per root part and one install per part (same candidate) past this. */
const COMPACT_AT = 32;
const CAP_TEXT: Readonly<Record<Capped, [string, string]>> = {
    precise: ['精瞄散布', '最多改善 40%'], spread: ['散布', '最多改善 40%'], kick: ['后坐', '最多改善 40%'],
    raise: ['举枪时间', '不短于原厂的 65%'], reload: ['换弹时间', '不短于原厂的 65%'], range: ['有效距离', '最多增加 25%'], noise: ['枪声范围', '不低于原厂的 40%'],
};

const b = (label: string, act: string, arg = '', cls = '', extra = '') =>
    `<button type="button" class="${cls}" data-gs="${act}"${arg ? ` data-arg="${esc(arg)}"` : ''} ${extra}>${label}</button>`;
const img = (id: string, cls = '') => `<img class="${cls}" alt="" src="${inventoryArtUrl(id)}">`;
const partName = (id: string) => ATTACHMENTS[id]?.name ?? id;
const kg = (n: number) => `${n.toFixed(2)} kg`;
const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
const ammoName = (gun: GunId) => D.ITEMS[GUNS[gun].stats.ammo]?.name ?? '';
const sizeText = (s: { w: number; h: number }) => `${s.w} × ${s.h}`;
/** Before → after when they differ, else the one value. */
const arrow = (a: string, z: string) => a === z ? a : `${a} → <b>${z}</b>`;

export class Workbench {
    private session: GunsmithSession;
    private gunUid: string;
    /** The selected position's key, and whether the list shows that position or every part this gun may take. */
    private at: string | null = null;
    private mode: 'slot' | 'all' = 'slot';
    private unowned = false;
    private detail = false;
    /** The last click that could not be made: the part (or position) and why. */
    private refusal: { name: string; reason: string } | null = null;
    /** Leaving with an unconfirmed preview asks first: to another gun, or closing the panel. */
    private leave: { gun: string | null } | null = null;

    constructor(private rt: HideoutRuntime, gun: string, private host: BenchHost) {
        this.gunUid = gun; this.session = rt.openGunsmith(gun);
    }

    /** The gun being edited. */
    get gun() { return this.gunUid; }
    /** A preview with changes is waiting: leaving would drop it. */
    get dirty() { const p = this.session.view().preview; return !!p && p.refusal?.code !== 'unchanged'; }
    /** The leave question is open (Esc answers it with "stay"). */
    get asking() { return this.leave !== null; }

    /** Ask before closing when a preview waits; true when the panel may close now. */
    requestClose(): boolean {
        if (!this.dirty) return true;
        this.leave = { gun: null }; return false;
    }

    act(act: string, arg: string): BenchOutcome {
        switch (act) {
            case 'gun': if (arg !== this.gunUid) { if (this.dirty) this.leave = { gun: arg }; else this.switchGun(arg); } break;
            case 'pos': this.at = arg; this.mode = 'slot'; this.refusal = null; this.host.sound('pick'); break;
            case 'part': this.choose(arg || null); break;
            case 'all': this.mode = this.mode === 'all' ? 'slot' : 'all'; this.refusal = null; break;
            case 'unowned': this.unowned = !this.unowned; break;
            case 'detail': this.detail = !this.detail; break;
            case 'refuse-ok': this.refusal = null; break;
            case 'cancel': this.session.reset(); this.refusal = null; this.host.sound('drop'); break;
            case 'confirm': this.confirm(); break;
            case 'close': if (this.requestClose()) return 'close'; break;
            case 'leave-stay': this.leave = null; break;
            case 'leave-discard': case 'leave-confirm': {
                const next = this.leave; if (!next) break;
                if (act === 'leave-confirm' && !this.confirm()) { this.leave = null; break; }
                this.session.reset(); this.leave = null;
                if (next.gun === null) return 'close';
                this.switchGun(next.gun); break;
            }
        }
        return 'render';
    }

    private switchGun(uid: string) {
        this.session.reset(); this.gunUid = uid; this.session = this.rt.openGunsmith(uid);
        this.at = null; this.mode = 'slot'; this.refusal = null; this.host.sound('pick');
    }

    /** The committed state and, when a preview is shown, the candidate's. */
    private states(): { gun: BenchGun | null; before: GunState | null; after: GunState | null; preview: GunEditPreview | null } {
        const v = this.session.view(), guns = benchGuns(this.rt.snapshot().profile), gun = guns.find(g => g.uid === this.gunUid) ?? null;
        return { gun, before: gun?.state ?? null, after: v.preview?.after ?? gun?.state ?? null, preview: v.preview };
    }

    /** A click on a part (or on the factory card, `id` null) for the selected position, or for its own position in the all view. */
    private choose(id: string | null) {
        const { gun, after } = this.states();
        if (!gun || !after) return;
        const build = buildOf({ id: gun.id, parts: after.parts }), list = positions(build);
        let at = list.find(p => p.key === this.at) ?? null;
        if (this.mode === 'all' && id) {
            // Every part in the all view goes to its own slot: an empty position first, else the first one offered.
            const own = list.filter(p => p.slot === ATTACHMENTS[id].mount);
            at = own.find(p => p.open && !p.part) ?? own.find(p => p.open) ?? own[0] ?? null;
            if (at) this.at = at.key;
        }
        if (!at) return;
        const name = id ? partName(id) : at.part ? FACTORY_NAMES[at.slot] ?? '不装' : '';
        const refuse = (reason: string) => { this.refusal = { name, reason }; this.host.sound('error'); };
        if (!at.open) { refuse(at.reason ?? ''); return; }
        if (id === null ? !at.part : at.part?.id === id) return;
        const c = id ? candidates(this.rt.snapshot().profile, gun.uid, build, at).find(x => x.id === id) : null;
        if (id && !c) { refuse('不能装在这个位置'); return; }
        if (c?.refusal) { refuse(c.refusal); return; }
        if (c && !c.loose && c.elsewhere) { refuse(`这个配件装在「${c.elsewhere}」上，请先在那把枪上拆下。`); return; }
        const base = this.session.view().edits, edits = [...base, ...replaceEdits(at, id, c?.loose ?? null)];
        const r = this.preview(edits);
        if (!r) { return; }
        this.refusal = null;
        // The replaced part's children move onto the new one where it takes them (a second preview: a part not owned
        // gets its placeholder uid from the first). A child that does not fit stays off, in the stash.
        if (at.part && id && r.preview) {
            const fresh = c?.loose?.uid ?? [...r.preview.installs].reverse().find(i => i.id === id && i.parent === at!.parent && i.slot === at!.slot)?.uid;
            if (fresh) {
                const more = remountEdits(build, at.part, fresh, buildOf({ id: gun.id, parts: r.preview.after.parts }));
                if (more.length) this.preview([...edits, ...more], true);
            }
        }
        this.compact();
        this.host.sound('pick');
    }

    /** Preview `edits`; an edit that cannot be made shows its reason (the last preview stays). No change left: no preview. */
    private preview(edits: GunEdit[], quiet = false): { preview: GunEditPreview | undefined } | null {
        const r = this.session.preview(edits);
        if (!r.ok) {
            if (!quiet) { this.refusal = { name: '', reason: r.message }; this.host.sound('error'); }
            if (r.reason === 'storage' || r.reason === 'conflict') this.host.storage();
            return null;
        }
        if (r.preview?.refusal?.code === 'unchanged') this.session.reset();
        return { preview: r.preview };
    }

    /** Past COMPACT_AT edits, the same candidate as one removal per root part and one install per part, when equal. */
    private compact() {
        const v = this.session.view(), gun = v.gun;
        if (!gun || !v.preview || v.edits.length <= COMPACT_AT) return;
        const roots = gun.state.parts.map(p => ({ kind: 'remove', uid: p.uid }) as GunEdit), installs: GunEdit[] = [];
        const rename = new Map<string, string>();
        let unowned = 0;
        const walk = (nodes: GunState['parts'], parent: string | null) => {
            for (const n of nodes) {
                const at = { parent: parent === null ? null : rename.get(parent) ?? parent, slot: n.slot };
                if (n.uid.startsWith('unowned-')) { installs.push({ kind: 'install', id: n.id, at }); rename.set(n.uid, `unowned-${++unowned}`); }
                else installs.push({ kind: 'install', uid: n.uid, at });
            }
            for (const n of nodes) walk(n.children, n.uid);
        };
        walk(v.preview.after.parts, null);
        const before = JSON.stringify(v.preview), edits = [...roots, ...installs], r = this.session.preview(edits);
        // Keep the long list unless the short one gives the very same candidate.
        if (!r.ok || JSON.stringify(r.preview) !== before) this.session.preview(v.edits);
    }

    /** Commit the preview: true once written. A stale preview is worked out again on the base as it is now. */
    private confirm(): boolean {
        const v = this.session.view();
        if (!v.preview) return false;
        if (!v.token) {
            if (v.stale) { this.preview(v.edits, true); this.host.toast('仓库或装备已改变，已按现在的库存重新预览。', 'info'); }
            else if (v.preview.refusal) { this.refusal = { name: '', reason: v.preview.refusal.reason }; this.host.sound('error'); }
            return false;
        }
        const r = this.session.confirm(v.token);
        if (r.ok) { this.refusal = null; this.host.toast(r.message ?? '改装已保存。', 'ok'); this.host.sound('ok'); return true; }
        this.host.toast(r.message, 'error'); this.host.sound('error');
        if (r.reason === 'storage' || r.reason === 'conflict') this.host.storage();
        else if (r.reason === 'stale') this.preview(v.edits, true);
        return false;
    }

    // ---------- drawing ----------

    html(opts: { compact: boolean }): string {
        const { gun, before, after, preview } = this.states();
        const guns = benchGuns(this.rt.snapshot().profile);
        if (!gun || !before || !after) {
            return `<div class="gs gs-empty"><p>${guns.length ? '这把枪已不在基地里。从左边另选一把。' : '基地里没有枪械。先在修理铺买一把，或带回行动里找到的枪。'}</p>${guns.length ? `<div class="gs-guns">${this.gunsHtml(guns, null)}</div>` : ''}</div>`;
        }
        const buildBefore = buildOf({ id: gun.id, parts: before.parts }), buildAfter = buildOf({ id: gun.id, parts: after.parts });
        const list = positions(buildAfter);
        if (!list.some(p => p.key === this.at)) this.at = (list.find(p => p.open) ?? list[0])?.key ?? null;
        const at = list.find(p => p.key === this.at) ?? null;
        const statsBefore = benchStats(buildBefore, devicesOn(before)), statsAfter = benchStats(buildAfter, devicesOn(after));
        const changes = preview ? preview.installs.length + preview.removals.length + preview.moves.length : 0;
        return `<div class="gs${opts.compact ? ' gs-compact' : ''}">
  <section class="gs-col gs-left" aria-label="枪械"><h3><i>01</i>枪械 <small>点一把枪开始改</small></h3><div class="gs-guns">${this.gunsHtml(guns, changes)}</div></section>
  <section class="gs-col gs-mid" aria-label="枪身与属性">${this.bodyHtml(gun, buildBefore, list, at, preview, changes)}${this.statsHtml(statsBefore, statsAfter, buildAfter)}</section>
  <section class="gs-col gs-right" aria-label="配件">${this.partsHtml(gun, buildAfter, at, list, statsAfter.scores)}</section>
  ${this.footHtml(gun, preview)}
  ${this.leave ? this.leaveHtml(guns, changes, !!this.session.view().token) : ''}
</div>`;
    }

    private gunsHtml(guns: BenchGun[], changes: number | null) {
        return guns.map(g => {
            const on = g.uid === this.gunUid, mag = g.magazine ? `弹匣 ${g.magazine.ammo} / ${g.magazine.capacity} 发 · ` : '';
            return `<button type="button" class="gs-gun${on ? ' on' : ''}" data-gs="gun" data-arg="${esc(g.uid)}" aria-pressed="${on}">${img(g.id)}<b>${esc(g.name)}</b><em>${WHERE_NAMES[g.where]}${g.relief ? ' · 救济' : ''}</em><span>${mag}已装 ${g.parts} 件 · ${kg(g.weight)}</span>${on && changes ? `<strong>有 ${changes} 处改动没确认</strong>` : ''}</button>`;
        }).join('');
    }

    private bodyHtml(gun: BenchGun, before: Build, list: Position[], at: Position | null, preview: GunEditPreview | null, changes: number) {
        const changed = new Set([...(preview?.installs ?? []), ...(preview?.moves ?? [])].map(i => i.uid));
        // Where a part comes off: that position (its parent and slot) shows as changed even when it is empty now.
        const emptied = new Set((preview?.removals ?? []).map(r => { const q = before.parts.find(x => x.uid === r.uid); return q ? `${q.parent ?? 'gun'}/${q.slot}` : ''; }));
        const box = (p: Position) => {
            const label = p.part ? partName(p.part.id) : p.open ? FACTORY_NAMES[p.slot] ?? '空' : '未开放';
            // A position whose part comes off (or whose factory part is replaced) is marked as changed too.
            const mark = p.part ? changed.has(p.part.uid) : emptied.has(`${p.parent ?? 'gun'}/${p.slot}`);
            const cls = ['gs-pos', p.key === at?.key ? 'on' : '', p.open ? '' : 'closed', p.part ? '' : 'empty', mark ? 'changed' : ''].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-gs="pos" data-arg="${esc(p.key)}" aria-pressed="${p.key === at?.key}" title="${esc(p.place)}${p.reason ? ` · ${esc(p.reason)}` : ''}"><small>${p.name}</small><b>${esc(label)}</b>${p.open ? '' : `<span>${esc(p.reason ?? '')}</span>`}${mark ? '<i>改</i>' : ''}</button>`;
        };
        const top = list.filter(p => TOP.has(p.slot)), bottom = list.filter(p => !TOP.has(p.slot));
        const mag = gun.magazine ? ` · 弹匣 ${gun.magazine.ammo} / ${arrow(String(preview?.capacity.before ?? gun.magazine.capacity), String(preview?.capacity.after ?? gun.magazine.capacity))} 发${ammoName(gun.id)}` : '';
        const weight = arrow(kg(preview?.weight.before ?? gun.weight), kg(preview?.weight.after ?? gun.weight));
        const size = preview ? arrow(sizeText(preview.size.before), sizeText(preview.size.after)) : sizeText(gunSize({ id: gun.id, parts: gun.state.parts }));
        return `<header class="gs-head"><h3>${esc(gun.name)}${changes ? ` <span class="gs-badge">预览中 · ${changes} 处改动没确认</span>` : ''}</h3><p>${WHERE_NAMES[gun.where]}${mag} · 枪重 ${weight} · 占格 ${size}</p></header>
<div class="gs-stage"><div class="gs-row">${top.map(box).join('')}</div><div class="gs-art">${img(gun.id)}</div><div class="gs-row">${bottom.map(box).join('')}</div></div>
<p class="gs-hint">点枪身上的位置挑配件；点配件只改预览，按「确认」才会改到枪上。</p>`;
    }

    private statsHtml(a: { scores: BenchScores; numbers: BenchNumbers }, z: { scores: BenchScores; numbers: BenchNumbers }, build: Build) {
        const rows = SCORE_ROWS.map(row => {
            const x = a.scores[row.key], y = z.scores[row.key], d = y - x, unit = row.key === 'kg', same = Math.abs(d) < (unit ? .005 : .5);
            const good = row.up ? d > 0 : d < 0, pct = (v: number) => unit ? Math.min(100, v / 6 * 100) : v;
            const lo = Math.min(pct(x), pct(y)), hi = Math.max(pct(x), pct(y));
            const bar = `<span class="gs-bar" aria-hidden="true"><i style="width:${lo}%"></i>${same ? '' : `<i class="${good ? 'up' : 'down'}" style="left:${lo}%;width:${hi - lo}%"></i>`}</span>`;
            const f = (v: number) => unit ? v.toFixed(2) : String(v);
            const val = same ? `${f(x)}${unit ? ' kg' : ''}` : `${f(x)} → ${f(y)}${unit ? ' kg' : ''}`;
            const dv = same ? '<span class="gs-dim">—</span>' : `<span class="${good ? 'up' : 'down'}">${signed(d, unit ? 2 : 0)}</span>`;
            return `<div class="gs-srow"><span>${row.name}</span>${bar}<span class="gs-val">${val}</span><span class="gs-dv">${dv}</span></div>${this.detail ? `<p class="gs-sdet">${detailText(row.key, a.numbers, z.numbers)}</p>` : ''}`;
        }).join('');
        const notes = capped(build).filter(c => c !== 'spread' || !capped(build).includes('precise')).map(c => `<li class="cap">${CAP_TEXT[c][0]}已到配件护栏：${CAP_TEXT[c][1]}，多装的这部分不再起作用。</li>`);
        if (z.numbers.devices) notes.push('<li>激光、灯光开着时更容易被前方的敌人看见，这一项不算在声音暴露里。</li>');
        return `<section class="gs-stats" aria-label="属性对比"><h3>属性对比 <small>现在 → 预览 · 重量和声音暴露越低越好</small>${b(this.detail ? '收起数值' : '看具体数值', 'detail', '', 'mini', `aria-pressed="${this.detail}"`)}</h3>${rows}${notes.length ? `<ul class="gs-notes">${notes.join('')}</ul>` : ''}</section>`;
    }

    private partsHtml(gun: BenchGun, build: Build, at: Position | null, list: Position[], now: BenchScores) {
        const profile = this.rt.snapshot().profile;
        const owned = (c: Candidate) => !!c.loose || c.current || !!c.elsewhere;
        let cards: string, head: string;
        if (this.mode === 'all') {
            const all = benchParts().filter(id => { const g = ATTACHMENTS[id].guns; return !g || g.includes(gun.id); });
            const rows = all.map(id => {
                const spot = list.find(p => p.slot === ATTACHMENTS[id].mount && p.open && !p.part) ?? list.find(p => p.slot === ATTACHMENTS[id].mount) ?? null;
                const c = spot ? candidates(profile, gun.uid, build, spot).find(x => x.id === id) ?? null : null;
                return { id, spot, c };
            }).filter(r => this.unowned || !r.c || owned(r.c));
            head = `<h3>全部配件 <small>能装在${esc(gun.name)}上的样板配件</small></h3>`;
            cards = rows.map(r => r.c && r.spot ? this.cardHtml(r.c, r.spot, build, now, true) : `<div class="gs-card refused"><b>${esc(partName(r.id))}</b><span class="gs-why">这把枪上没有能装它的位置</span></div>`).join('');
        } else if (at) {
            const factory = FACTORY_NAMES[at.slot];
            const shown = at.part ? `现在：${esc(partName(at.part.id))}` : `现在：${factory ?? '空'}`;
            head = `<h3>${at.name} <small>${esc(at.place)}</small></h3><p>${shown}${at.open ? '' : ` · ${esc(at.reason ?? '')}`}</p>`;
            const factoryCard = at.open ? this.factoryHtml(at, build, now) : '';
            const shownList = candidates(profile, gun.uid, build, at).filter(c => this.unowned || owned(c));
            cards = factoryCard + (shownList.length ? shownList.map(c => this.cardHtml(c, at, build, now, false)).join('')
                : `<p class="gs-dim gs-none">${candidates(profile, gun.uid, build, at).length ? '仓库里没有能装在这里的配件。可以打开「显示未拥有的」先看看效果。' : '暂时没有能装在这里的配件。'}</p>`);
        } else { head = '<h3>配件</h3>'; cards = ''; }
        const missing = at && this.mode === 'slot' ? candidates(profile, gun.uid, build, at).filter(c => !owned(c)).length
            : benchParts().filter(id => { const g = ATTACHMENTS[id].guns; return (!g || g.includes(gun.id)) && !build.parts.some(p => p.id === id)
                && ![profile.stash, profile.bag, profile.safe].some(inv => inv.items.some(i => i.id === id)); }).length;
        const tools = `<div class="gs-tools">${b(`显示未拥有的${missing ? `（${missing}）` : ''}`, 'unowned', '', 'mini', `aria-pressed="${this.unowned}"`)}${b(this.mode === 'all' ? '回到位置' : '全部配件', 'all', '', 'mini', `aria-pressed="${this.mode === 'all'}"`)}</div>`;
        const refusal = this.refusal ? `<div class="gs-refuse" role="alert"><p>${this.refusal.name ? `不能装「${esc(this.refusal.name)}」：` : ''}${esc(this.refusal.reason)}</p>${b('知道了', 'refuse-ok', '', 'mini')}</div>` : '';
        return `<header class="gs-rhead">${head}${tools}</header>${refusal}<div class="gs-list">${cards}</div>`;
    }

    /** The card that puts the factory part back (or leaves a rail empty): taking off what sits there. */
    private factoryHtml(at: Position, build: Build, now: BenchScores) {
        const name = FACTORY_NAMES[at.slot] ?? '不装', current = !at.part;
        const delta = current ? '' : deltaText(now, benchStats(without(build, at)).scores);
        const off = at.part ? build.parts.filter(p => p.parent === at.part!.uid).map(p => partName(p.id)) : [];
        return `<button type="button" class="gs-card factory${current ? ' current' : ''}" data-gs="part" data-arg="" aria-pressed="${current}"><span class="gs-fac">${FACTORY_NAMES[at.slot] ? '原厂' : '空'}</span><div><b>${name}</b>${current ? '<em>装着</em>' : ''}<small>${FACTORY_NAMES[at.slot] ? '原厂部件，一直在枪上，不占仓库' : '这个位置空着'}</small>${current ? '' : `<span class="gs-delta">换回后：${delta || '属性不变'}</span>${off.length ? `<span class="gs-why">${esc(off.join('、'))}会一起拆下</span>` : ''}`}</div></button>`;
    }

    private cardHtml(c: Candidate, at: Position, build: Build, now: BenchScores, all: boolean) {
        const def = D.ITEMS[c.id], brand = ATTACHMENTS[c.id].brand;
        const where = c.current ? '' : c.loose ? `${{ stash: '仓库', bag: '背包', safe: '安全箱' }[c.loose.from]} ${c.count} 件` : c.elsewhere ? `装在 ${esc(c.elsewhere)} 上` : `未拥有 · ${esc(c.source)}`;
        let effect = '';
        if (c.refusal) effect = `<span class="gs-why">不能装：${esc(c.refusal)}</span>`;
        else if (!c.current) {
            const cand = candidateBuild(build, at, c.id);
            effect = cand ? `<span class="gs-delta">换上后：${deltaText(now, benchStats(cand).scores) || '属性不变'}</span>` : '';
        }
        const cls = ['gs-card', c.current ? 'current' : '', c.refusal ? 'refused' : '', !c.loose && !c.current ? 'missing' : ''].filter(Boolean).join(' ');
        // In the preview, not yet on the gun: "previewed"; on the gun as committed: "installed".
        const tag = c.current ? `<em>${at.part && this.committed().has(at.part.uid) ? '装着' : '预览中'}</em>` : '';
        return `<button type="button" class="${cls}" data-gs="part" data-arg="${c.id}" aria-pressed="${c.current}">${img(c.id, 'gs-ico')}<div><b>${esc(c.name)}</b>${tag}<small>${all ? `${at.name} · ` : ''}${where}</small><span class="gs-desc">${esc(brandName(brand))} · ${esc(def?.description ?? '')}</span>${effect}</div></button>`;
    }

    /** The uids of the parts on the gun as committed. */
    private committed(): Set<string> {
        const g = this.session.view().gun;
        return new Set(g ? nodesOf(g.state.parts).map(n => n.uid) : []);
    }

    private footHtml(gun: BenchGun, p: GunEditPreview | null) {
        const name = (uid: string | null) => { const n = p && (findPart(p.after, uid) ?? findPart(p.before, uid)); return n ? partName(n.id) : ''; };
        const adds = (p?.installs ?? []).map(i => `<li class="${i.from ? '' : 'missing'}"><i>+</i><b>${esc(partName(i.id))}</b><small>${POSITION_NAMES[i.slot]} · ${i.from ? `从${{ stash: '仓库', bag: '背包', safe: '安全箱' }[i.from]}取` : '未拥有，确认前要先买到'}</small></li>`).join('');
        const rems = (p?.removals ?? []).map(r => `<li class="${r.with ? 'cascade' : ''}"><i>−</i><b>${esc(partName(r.id))}</b><small>${r.with ? `随${esc(name(r.with))}拆下 · ` : `${POSITION_NAMES[ATTACHMENTS[r.id].mount]} · `}放回仓库</small></li>`).join('');
        const moves = (p?.moves ?? []).map(m => `<li><i>↔</i><b>${esc(partName(m.id))}</b><small>换到${esc(name(m.parent) || '枪身')}上</small></li>`).join('');
        const unload = p?.unloaded ? `卸出 ${p.unloaded.normal + p.unloaded.relief} 发${esc(D.ITEMS[p.unloaded.ammo]?.name ?? '')}，放进仓库${p.unloaded.relief ? `（其中救济 ${p.unloaded.relief} 发）` : ''}` : '不用卸弹';
        const sum = p ? `<dl class="gs-sum"><div><dt>枪重</dt><dd>${arrow(kg(p.weight.before), kg(p.weight.after))}</dd></div><div><dt>弹匣</dt><dd>${arrow(`${p.capacity.before} 发`, `${p.capacity.after} 发`)}</dd></div>${gun.where === 'equipment' ? `<div><dt>子弹</dt><dd>${unload}</dd></div>` : ''}<div><dt>占格</dt><dd>${arrow(sizeText(p.size.before), sizeText(p.size.after))}</dd></div></dl>` : '<p class="gs-dim gs-sum">还没有改动。</p>';
        const token = !!this.session.view().token, why = p?.refusal && p.refusal.code !== 'unchanged' ? `<p class="gs-block" role="alert">${esc(p.refusal.reason)}</p>` : `<p class="gs-dim">${p ? '确认后一次保存；取消会回到当前配置。' : '改动只在预览里，确认前不会动到枪和仓库。'}</p>`;
        return `<footer class="gs-foot"><div class="gs-pend"><h4>待装 <small>${p?.installs.length ?? 0} 件</small></h4><ul>${adds || '<li class="none">没有要装的配件</li>'}</ul></div>
<div class="gs-pend"><h4>待卸 <small>${p?.removals.length ?? 0} 件</small></h4><ul>${rems || '<li class="none">没有要拆的配件</li>'}${moves}</ul></div>
${sum}<div class="gs-acts">${why}<div>${b('取消', 'cancel', '', '', p ? '' : 'disabled')}${b('确认', 'confirm', '', 'primary', token ? '' : 'disabled')}</div></div></footer>`;
    }

    private leaveHtml(guns: BenchGun[], changes: number, token: boolean) {
        const next = this.leave?.gun ? guns.find(g => g.uid === this.leave!.gun) : null;
        return `<div class="gs-veil"><section class="gs-dialog" role="dialog" aria-modal="true" aria-label="有改动没确认"><h3>有 ${changes} 处改动没确认</h3><p>${next ? `换到「${esc(next.name)}」之前，先处理这把枪的改动。` : '关闭工作台之前，先处理这把枪的改动。'}</p>
<div class="gs-dacts">${b(next ? '确认改动后换' : '确认改动后关闭', 'leave-confirm', '', 'primary', token ? '' : 'disabled')}${b('放弃改动', 'leave-discard')}${b('留下继续改', 'leave-stay')}</div>${token ? '' : '<p class="gs-dim">这些改动现在还不能确认，只能放弃或留下继续改。</p>'}</section></div>`;
    }
}

const brandName = (brand: string) => ({ beidi: '北堤', yanwan: '盐湾', binji: '滨机' } as Record<string, string>)[brand] ?? '';
function findPart(state: GunState, uid: string | null) {
    const walk = (nodes: GunState['parts']): GunState['parts'][number] | null => { for (const n of nodes) { if (n.uid === uid) return n; const c = walk(n.children); if (c) return c; } return null; };
    return uid === null ? null : walk(state.parts);
}
/** The scores that change from `a` to `z`, up to three and the weight: "精度 +6 · 操控 −8 · 重量 +0.35 kg". */
function deltaText(a: BenchScores, z: BenchScores): string {
    const out: string[] = [];
    for (const row of SCORE_ROWS) {
        if (row.key === 'kg') continue;
        const d = z[row.key] - a[row.key];
        if (Math.abs(d) >= 1 && out.length < 3) out.push(`${row.name} <span class="${(row.up ? d > 0 : d < 0) ? 'up' : 'down'}">${signed(d)}</span>`);
    }
    const dk = z.kg - a.kg;
    if (Math.abs(dk) >= .005) out.push(`重量 <span class="${dk < 0 ? 'up' : 'down'}">${signed(dk, 2)} kg</span>`);
    return out.join(' · ');
}
/** The numbers behind one comparison row, before → after. */
function detailText(key: keyof BenchScores, a: BenchNumbers, z: BenchNumbers): string {
    const n = (x: number, d: number, u = '') => `${x.toFixed(d)}${u}`, ar = (x: number, y: number, d: number, u = '') => arrow(n(x, d, u), n(y, d, u));
    switch (key) {
        case 'fire': return `单发伤害 ${z.damage}${z.pellets > 1 ? ` × ${z.pellets} 颗弹丸` : ''} · 射击间隔 ${n(z.cooldown, 2)} 秒。普通配件不改火力。`;
        case 'acc': return `精瞄散布 ${ar(a.aimed, z.aimed, 2, '°')} · 腰射散布 ${ar(a.hip, z.hip, 2, '°')} · 有效距离 ${ar(a.range, z.range, 0)}${z.laserHip !== null ? ` · 激光开着时腰射 ${n(z.laserHip, 2)}°` : ''}`;
        case 'ctl': return `每发后坐 ${ar(a.kick, z.kick, 2, '°')} · 每发散布增长 ${ar(a.bloom, z.bloom, 2, '°')} · 停火后恢复 ${ar(a.recover, z.recover, 1)}`;
        case 'hdl': return `举枪到精瞄 ${ar(a.raise, z.raise, 2, ' 秒')} · 晃动 ${ar(a.sway, z.sway, 2)}`;
        case 'feed': return `弹匣 ${ar(a.magazine, z.magazine, 0, ' 发')} · 换弹 ${ar(a.reload, z.reload, 2, ' 秒')}`;
        case 'kg': return '整枪重量，不含子弹。';
        case 'noise': return `敌人听到枪声的范围 ${ar(a.noise, z.noise, 0)}${z.suppressed ? ' · 已消音' : ''}`;
    }
}
