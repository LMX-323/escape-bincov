import Phaser from 'phaser';
import { app, saveSession } from './app';
import { drawWorld } from './art';
import { mapPresentation, roomMap } from './building-world';
import { practice } from './base';
import { FACILITIES, type Attribute, type ExpansionState, type Facility } from './expansion-state';
import { corridor, traversable } from './spatial';
import { ActiveClock, playerInput } from './input';
import { render, setOverlay, toast } from './ui';

const point = (x: number, y: number) => ({ x: (x + .5) * 32, y: (y + .5) * 32 });
export const BASE_POINTS = [
    { id: 'rest', ...point(4, 4), label: '休息区' }, { id: 'medical', ...point(11, 4), label: '医疗区' },
    { id: 'training', ...point(19, 5), label: '训练区' }, { id: 'workbench', ...point(5, 11), label: '工作台' },
    { id: 'blackmarket', ...point(19, 12), label: '黑市商人' }, { id: 'gear', ...point(11, 13), label: '仓库与整备' },
    { id: 'arms', ...point(3, 14), label: '修理铺' }, { id: 'quests', ...point(11, 8), label: '电台任务' },
    { id: 'deploy', ...point(14, 15), label: '出击准备' },
];
export const BASE_MAP = roomMap('water-station', 24, 18, '滨科夫水产站', '安全基地');
for (const [x, y] of [[3, 2], [4, 2], [10, 2], [11, 2], [3, 10], [4, 10], [19, 10], [20, 10]]) BASE_MAP.cells[y][x] = 'low';
for (let x = 2; x <= 7; x++) BASE_MAP.cells[7][x] = 'wall';
for (let x = 10; x <= 15; x++) BASE_MAP.cells[7][x] = 'wall';
BASE_MAP.regions = [{ x: 17 * 32, y: 2 * 32, w: 6 * 32, h: 6 * 32, name: '训练区' }];

/** Safe walking has no raid combat, hunger drain or passive training. */
export class BaseScene extends Phaser.Scene {
    player!: Phaser.GameObjects.Image;
    private state!: ExpansionState;
    private clock = new ActiveClock();
    private nextSave = 0;
    private target = '';
    private status!: Phaser.GameObjects.Text;
    constructor() { super('Base'); }
    create() {
        this.state = structuredClone(app.expansion!); app.base = this; app.raid = null;
        this.clock.reset(); this.nextSave = 0; this.target = '';
        drawWorld(this, mapPresentation(BASE_MAP), BASE_MAP);
        this.player = this.add.image(400, 480, 'player').setDepth(20);
        const width = 24 * 32, height = 18 * 32;
        this.cameras.main.setBounds(-(960 - width) / 2, 0, 960, height).startFollow(this.player, true);
        for (const p of BASE_POINTS) {
            this.add.rectangle(p.x, p.y - 22, 38, 12, p.id === 'training' ? 0x9ba16d : 0x52766a);
            this.add.text(p.x, p.y - 42, p.label, { fontSize: '11px', color: '#eadfba', backgroundColor: '#142720' }).setOrigin(.5).setDepth(12);
        }
        const trainingZone = BASE_MAP.regions![0];
        this.add.rectangle(trainingZone.x + trainingZone.w / 2, trainingZone.y + trainingZone.h / 2, trainingZone.w, trainingZone.h).setStrokeStyle(2, 0xa99b66).setFillStyle(0x657443, .2);
        this.status = this.add.text(384, 548, '', { fontSize: '11px', color: '#d3ddb3', backgroundColor: '#11251f' }).setOrigin(.5).setDepth(30);
        saveSession.attachExpansion({ capture: () => this.snapshotExpansion(), restore: value => this.restoreExpansion(value) });
        this.events.once('shutdown', () => { saveSession.attachExpansion(null); app.base = null; playerInput.clear(); });
        render();
    }
    snapshotExpansion() { return structuredClone(this.state); }
    restoreExpansion(state: ExpansionState) { this.state = structuredClone(state); }
    checkpoint() { return saveSession.persist(); }
    update() {
        const timing = this.clock.tick(performance.now()), frame = playerInput.read(!app.overlay && app.storageOK && !app.conflict && !document.hidden);
        const dt = timing.stalled ? 0 : Math.min(.25, timing.seconds);
        const context = { definition: BASE_MAP, doors: {}, highTide: false };
        const before = { x: this.player.x, y: this.player.y }, length = Math.max(1, Math.hypot(frame.x, frame.y));
        const x = this.player.x + frame.x / length * 110 * dt, y = this.player.y + frame.y / length * 110 * dt;
        if (traversable(context, { x, y: this.player.y }, 'body', 10)) this.player.x = x;
        if (traversable(context, { x: this.player.x, y }, 'body', 10)) this.player.y = y;
        if (this.player.x !== before.x || this.player.y !== before.y) this.player.rotation = Math.atan2(frame.y, frame.x);
        const trainingZone = BASE_MAP.regions![0];
        const inTraining = this.player.x >= trainingZone.x && this.player.x < trainingZone.x + trainingZone.w
            && this.player.y >= trainingZone.y && this.player.y < trainingZone.y + trainingZone.h;
        if (inTraining && !app.overlay) practice(this.state, this.state.base.training.attribute as Attribute, before, this.player, dt, Date.now());
        const nearby = BASE_POINTS.filter(p => Math.hypot(p.x - this.player.x, p.y - this.player.y) < 43 && corridor(context, this.player, p, 'body', 10)).sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))[0];
        const target = nearby?.id ?? '';
        if (target !== this.target || !document.getElementById('base-interaction')?.textContent?.includes(nearby?.label ?? '沿站内')) {
            this.target = target;
            const text = document.getElementById('base-interaction'), touch = document.getElementById('touch-interact');
            if (text) text.textContent = nearby ? `${playerInput.touch ? '点交互' : 'E'} · ${nearby.label}` : '沿站内通道走动，靠近设施可交互';
            if (touch) { touch.textContent = '交互'; touch.setAttribute('aria-label', nearby ? `打开${nearby.label}` : '基地交互'); }
        }
        if (nearby && frame.actions.has('interact')) {
            if (FACILITIES.includes(nearby.id as Facility)) { app.baseFacility = nearby.id; setOverlay('base-facility'); }
            else { app.tab = nearby.id === 'deploy' ? 'gear' : nearby.id; setOverlay('base-menu'); }
        }
        const training = this.state.base.training;
        this.status.setText(inTraining ? `主动练习 · ${training.activeSeconds.toFixed(0)} / 120 秒 · 本轮 ${training.quantity.toFixed(2)} / 1` : '水产站 · 安全区域');
        this.nextSave += timing.seconds;
        if (this.nextSave >= 5 && app.storageOK && !app.conflict && !app.pendingSettlement) {
            this.nextSave = 0;
            if (!this.checkpoint()) { playerInput.clear(); setOverlay('base-save-error'); toast('基地进度保存失败，请重试或导出备份。'); }
        }
    }
}
