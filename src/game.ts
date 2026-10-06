import { exitBearing, questProgress } from './qol';
import Phaser from 'phaser';
import { createTextures, drawWorld } from './art';
import { drawTitleBackdrop, drawStationBackdrop } from './title-art';
import { WORLD, WORLD_W, WORLD_H, TILE, isWalkable, lineOfSight, findPath, findDryRefuge, type RunConfig, type Point, type MapData } from './world';
import * as D from './domain';
import type { LootContainer } from './loot';
import { SURVIVAL as B } from './balance';
import { app, audio, saveSession } from './app';
import { playerInput, ActiveClock, type InputFrame } from './input';
import { WORLD_VERSION, type RaidCheckpoint, type EnemyState } from './checkpoint';
import { mapPresentation } from './building-world';
import { resolveExpansionWorld } from './expansion-worlds';
import type { ExpansionState, WorldDefinition } from './expansion-state';
import { derivedLimits, entityUid } from './expansion-state';
import { advanceRaidBody, enemyDamage, recordMotion, rpgMultipliers, useRpgItem } from './rpg';
import { corridor, doorAnchor, interactionTarget, spacePath, spaceSize, toggleDoor, traversable, type Interaction, type SpaceContext } from './spatial';
import { advanceLayerShots, changeLayer, damageLayerEnemy } from './layer-transition';
import { advancePursuits } from './pursuit';
import type { ExpansionTransaction } from './session';
import { render, setOverlay, openLoot, finish, toast, drawMap, refreshQuickPanel } from './ui';
export class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }
    create() { createTextures(this); this.scene.start('Menu'); }
}
export class MenuScene extends Phaser.Scene {
    constructor() { super('Menu'); }
    create() { drawTitleBackdrop(this, app.menuMotion); render(); }
}
export class HideoutScene extends Phaser.Scene {
    constructor() { super('Hideout'); }
    create() { drawStationBackdrop(this); this.add.rectangle(480, 270, 960, 540, 0x081211, .55); render(); }
}
export class ResultScene extends Phaser.Scene {
    constructor() { super('Result'); }
    create() { drawStationBackdrop(this); render(); }
}
type Enemy = {
    uid: string;
    sprite: Phaser.GameObjects.Image;
    id: string;
    hp: number;
    home: Point;
    target: Point;
    state: 'patrol' | 'investigate' | 'chase' | 'attack' | 'return';
    timer: number;
    cooldown: number;
    path: Point[];
    repath: number;
    alert: number;
};
type Ground = {
    uid: string;
    sprite: Phaser.GameObjects.Image;
    id: string;
    qty: number;
    relief?: boolean;
};
type Bullet = {
    uid: string;
    sprite: Phaser.GameObjects.Image;
    vx: number;
    vy: number;
    left: number;
    damage: number;
    enemy: boolean;
    owner?: string;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const css = (id: string, text: string) => { const el = document.getElementById(id); if (el)
    el.textContent = text; };
export class RaidScene extends Phaser.Scene {
    private layered: ExpansionState | null = null;
    private worldArt: Phaser.GameObjects.Container | null = null;
    private worldLabels: Phaser.GameObjects.GameObject[] = [];
    private pendingLayer: ExpansionTransaction | null = null;
    private inputSuppressed = false;
    private mapCache = new Map<string, MapData>();
    private roof: Phaser.GameObjects.Graphics | null = null;
    private roofSignature = '';
    config!: RunConfig;
    player!: Phaser.GameObjects.Image;
    enemies: Enemy[] = [];
    loot: Ground[] = [];
    containers: LootContainer[] = [];
    private containerSprites: Phaser.GameObjects.Image[] = [];
    bullets: Bullet[] = [];
    hp: number = B.maxHealth;
    stamina: number = B.maxStamina;
    pollution = 0;
    bleeding = 0;
    kills = 0;
    elapsed = 0;
    highTide = false;
    mag = 0;
    magRelief = 0;
    knife = false;
    reloadLeft = 0;
    fireCooldown = 0;
    extractTime = 0;
    private random = D.seededRandom(0);
    private clock = new ActiveClock();
    private inputFrame = playerInput.read(false);
    private nextEntity = 1;
    private checkpointAt = 0;
    lastStall: { seconds: number; at: number } | null = null;
    private fx!: Phaser.GameObjects.Graphics;
    private weather!: Phaser.GameObjects.Graphics;
    private flood!: Phaser.GameObjects.Graphics;
    private cross!: Phaser.GameObjects.Graphics;
    private hudTime = 0;
    private stepTime = 0;
    private warned = false;
    private tideChanged = false;
    private shotNoise: Point | null = null;
    private noiseRadius = 510;
    private noiseTime = 0;
    private radioTime = 12;
    private locked = false;
    private extracted = false;
    private hitTime = 0;
    private hitNotice = 0;
    private hitDirections: { sector: number; angle: number; left: number }[] = [];
    private noteSeen = new Set<string>();
    private exhausted = false;
    private lootTargetId = '';
    constructor() { super('Raid'); }
    create() {
        this.config = this.registry.get('runConfig');
        this.layered = app.expansion?.raid ? structuredClone(app.expansion) : null;
        this.pendingLayer = null;
        app.raid = this;
        this.enemies = [];
        this.loot = [];
        this.containers = [];
        this.lootTargetId = ''; app.selectedExit = ''; app.tasksExpanded = false; this.hitDirections = [];
        this.containerSprites = [];
        this.bullets = [];
        this.hp = B.maxHealth;
        this.stamina = B.maxStamina;
        this.pollution = 0;
        this.bleeding = 0;
        this.kills = 0;
        this.elapsed = 0;
        this.knife = false;
        this.reloadLeft = 0;
        this.fireCooldown = 0;
        this.extractTime = 0;
        this.hudTime = 0;
        this.stepTime = 0;
        this.warned = false;
        this.tideChanged = false;
        this.radioTime = 12;
        this.locked = false;
        this.extracted = false;
        this.hitTime = 0; this.hitNotice = 0;
        this.noteSeen = new Set();
        this.shotNoise = null;
        this.noiseTime = 0;
        this.random = D.seededRandom(this.config.seed + 771);
        this.highTide = this.config.initialHigh;
        this.flood = this.add.graphics().setDepth(2);
        this.drawEnvironment();
        this.player = this.add.image(this.config.spawn.x, this.config.spawn.y, 'player').setDepth(8);
        this.fx = this.add.graphics().setDepth(9);
        this.weather = this.add.graphics().setDepth(20).setScrollFactor(0);
        this.cross = this.add.graphics().setDepth(30).setScrollFactor(0);
        const mapSize = this.space ? spaceSize(this.space.definition) : { width: WORLD_W, height: WORLD_H };
        this.setMapBounds(mapSize);
        this.cameras.main.startFollow(this.player, true, .14, .14);
        this.cameras.main.setRoundPixels(true);
        this.input.mouse!.disableContextMenu();
        this.releaseInput();
        if (this.layered) {
            this.restoreExpansion(this.layered);
            saveSession.attachExpansion({ capture: () => this.snapshotExpansion(), restore: value => this.restoreExpansion(value) });
        } else {
            if (!app.checkpoint) throw new Error('Missing deployment checkpoint');
            this.restore(app.checkpoint);
            saveSession.attachRaid({ capture: () => this.snapshot(), restore: value => this.restore(value) });
        }
        this.events.once('shutdown', () => { saveSession.attachRaid(null); saveSession.attachExpansion(null); playerInput.clear(); });
        this.checkpointAt = this.elapsed;
        audio.start();
        render();
        if (playerInput.touch && (innerWidth < innerHeight || innerHeight < 280)) setOverlay('rotate');
    }
    lock() { this.locked = true; this.releaseInput(); }
    releaseInput() { playerInput.clear(); this.clock.reset(); this.extractTime = 0; }
    /** A panel close must wait for existing presses to be released before gameplay resumes. */
    suppressHeldInput(extraKey?: string): void {
        playerInput.suppressHeld(extraKey);
        this.extractTime = 0;
        this.inputSuppressed = true;
    }
    get layeredWorld(): WorldDefinition | null { return this.layered?.raid ? resolveExpansionWorld(this.layered.raid.worldVersion) ?? null : null; }
    get space(): SpaceContext | null {
        const raid = this.layered?.raid, world = this.layeredWorld;
        return raid && world ? { definition: world.maps[raid.currentMap], doors: raid.maps[raid.currentMap].doors, highTide: this.highTide } : null;
    }
    get mapData(): MapData {
        const map = this.space?.definition;
        if (!map) return WORLD;
        if (!this.mapCache.has(map.id)) this.mapCache.set(map.id, mapPresentation(map));
        return this.mapCache.get(map.id)!;
    }
    get visibleExits() { return !this.space || ['coast', 'mall-f1'].includes(this.space.definition.id) ? this.config.exits : []; }
    private walkable(x: number, y: number, highTide = false, radius = 10): boolean {
        return this.space ? traversable({ ...this.space, highTide }, { x, y }, 'body', radius) : isWalkable(x, y, highTide, radius);
    }
    private sight(a: Point, b: Point, highTide = false, radius = 0): boolean {
        return this.space ? corridor({ ...this.space, highTide }, a, b, radius ? 'body' : 'sight', radius) : lineOfSight(a, b, highTide, radius);
    }
    private path(from: Point, to: Point, highTide = false): Point[] {
        return this.space ? spacePath({ ...this.space, highTide }, from, to, true) : findPath(from, to, highTide);
    }
    private dryRefuge(from: Point): Point | null {
        if (!this.space) return findDryRefuge(from);
        const context = { ...this.space, highTide: true }, map = context.definition, points: Point[] = [];
        for (let y = 0; y < map.cells.length; y++) for (let x = 0; x < map.cells[y].length; x++) {
            const point = { x: x * 32 + 16, y: y * 32 + 16 };
            if (traversable(context, point, 'body', 10)) points.push(point);
        }
        points.sort((a, b) => distance(from, a) - distance(from, b) || a.y - b.y || a.x - b.x);
        return points.find(p => spacePath({ ...context, highTide: false }, from, p, true).length) ?? null;
    }
    private setMapBounds(size: { width: number; height: number }): void {
        this.cameras.main.setBounds(-Math.max(0, (960 - size.width) / 2), -Math.max(0, (540 - size.height) / 2), Math.max(960, size.width), Math.max(540, size.height));
    }
    private drawEnvironment(): void {
        this.roof?.destroy(); this.roof = null; this.roofSignature = '';
        this.worldArt?.destroy(); this.worldLabels.forEach(l => l.destroy()); this.worldLabels = [];
        this.worldArt = drawWorld(this, this.mapData, this.space?.definition).setDepth(0);
        this.mapData.notes.forEach(n => {
            this.worldLabels.push(this.add.image(n.x, n.y, 'note').setDepth(3));
        });
        this.visibleExits.forEach(e => {
            const g = this.add.graphics().setDepth(3);
            g.lineStyle(2, 0xb4ce7d, .75).strokeCircle(e.x, e.y, 48); g.lineStyle(1, 0xb4ce7d, .4).strokeCircle(e.x, e.y, 54); g.fillStyle(0xb4ce7d, .08).fillCircle(e.x, e.y, 48);
            this.worldLabels.push(g, this.add.text(e.x, e.y - 70, `${e.name}\n${playerInput.touch ? '停稳，按住撤离 3 秒' : '按住 E 3 秒 · 撤离'}`, { fontFamily: 'Microsoft YaHei', fontSize: '12px', color: '#dae5aa', align: 'center', backgroundColor: '#19281ee6', padding: { x: 8, y: 4 } }).setOrigin(.5).setDepth(3).setData('exit', e.name));
        });
        if (this.space) {
            const map = this.space.definition, g = this.add.graphics().setDepth(3); this.worldLabels.push(g);
            this.roof = this.add.graphics().setDepth(11);
            map.regions?.forEach(r => {
                const color = [0x748c64, 0x6f9795, 0x98775c, 0x7c7794, 0x959261, 0x668580][(r.theme ?? 0) % 6];
                g.fillStyle(color, r.inside === false ? .03 : .12).fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
                g.lineStyle(1, color, .45).strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
                this.worldLabels.push(this.add.text(r.x + r.w / 2, r.y + 16, r.name, { fontSize: '11px', color: '#dedebd', backgroundColor: '#13241ed9' }).setOrigin(.5).setDepth(3));
                // Distinct floor motifs: clothing diamond, food price bands, wet tile lines,
                // workshop cable marks and diagonal promotion paint remain visual only.
                for (let i = 0; i < 4; i++) {
                    const x = r.x + 32 + i * Math.max(12, (r.w - 64) / 4), y = r.y + r.h - 22;
                    if (/服装/.test(r.name)) g.lineStyle(1, color, .7).strokeTriangle(x, y - 8, x - 7, y, x + 7, y);
                    else if (/促销|五金|卸货/.test(r.name)) g.lineStyle(2, color, .7).lineBetween(x, y, x + 9, y - 7);
                    else g.fillStyle(color, .7).fillRect(x, y, 8, (r.theme ?? 0) % 3 + 2);
                }
            });
            map.cells.forEach((row, y) => row.forEach((cell, x) => {
                if (cell === 'window') { g.fillStyle(0x679a9b).fillRect(x * 32 + 3, y * 32 + 10, 26, 12); g.lineStyle(2, 0xa5c4b6).strokeRect(x * 32 + 3, y * 32 + 10, 26, 12); }
                if (cell === 'low' && !map.decorations?.some(d => Math.floor(d.x / 32) === x && Math.floor(d.y / 32) === y)) { g.fillStyle(0x6e5c44).fillRect(x * 32 + 3, y * 32 + 3, 26, 26); g.lineStyle(2, 0x9b8970).strokeRect(x * 32 + 3, y * 32 + 3, 26, 26); }
            }));
            map.doors.forEach(d => { const open = this.space!.doors[d.id]; g.fillStyle(open ? 0x9fbd82 : 0x916c4a).fillRect(d.x * 32 + (open ? 2 : 5), d.y * 32 + 3, open ? 4 : 22, 26); });
            map.decorations?.filter(d => d.kind === 'V').forEach(d => {
                g.fillStyle(0xc7b995, .45).fillRect(d.x - 7, d.y - 4, 14, 8);
                g.lineStyle(1, 0x415c43).lineBetween(d.x - 4, d.y, d.x + 4, d.y);
            });
            map.entries.forEach(e => {
                g.lineStyle(2, 0xd1b778).strokeRect(e.at.x - 13, e.at.y - 13, 26, 26);
                for (let y = -9; y <= 9; y += 6) g.lineBetween(e.at.x - 10, e.at.y + y, e.at.x + 10, e.at.y + y);
                this.worldLabels.push(this.add.text(e.at.x, e.at.y - 30, e.label ?? '楼层入口', { fontSize: '11px', color: '#f0dfb0', backgroundColor: '#19281ee6', padding: { x: 3, y: 2 } }).setOrigin(.5).setDepth(3));
            });
            this.setMapBounds(spaceSize(map));
        }
        this.drawFlood();
    }

    private drawRoofs(): void {
        if (!this.roof || !this.space) return;
        const signature = `${Math.floor(this.player.x / 16)},${Math.floor(this.player.y / 16)}:${JSON.stringify(this.space.doors)}`;
        if (signature === this.roofSignature) return;
        this.roofSignature = signature; this.roof.clear();
        for (const r of this.space.definition.regions ?? []) {
            if (r.inside === false) continue;
            const inside = this.player.x >= r.x && this.player.x < r.x + r.w && this.player.y >= r.y && this.player.y < r.y + r.h;
            const near = { x: Math.max(r.x + 40, Math.min(r.x + r.w - 40, this.player.x)), y: Math.max(r.y + 40, Math.min(r.y + r.h - 40, this.player.y)) };
            if (!r.sealed && (inside || distance(this.player, near) < 80 && this.sight(this.player, near))) continue;
            this.roof.fillStyle(0x263f32, .97).fillRect(r.x, r.y, r.w, r.h);
            this.roof.lineStyle(2, 0x70816a, .5).strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
        }
    }

    snapshotExpansion(): ExpansionState {
        if (!this.layered?.raid) throw new Error('没有多层行动。');
        const state = structuredClone(this.layered), raid = state.raid!, c = this.snapshot(), layer = raid.maps[raid.currentMap];
        Object.assign(state.body, { hp: this.hp, stamina: this.stamina, pollution: this.pollution, bleeding: !!this.bleeding, exhausted: this.exhausted });
        Object.assign(raid, { player: c.player, loadout: c.loadout, elapsed: c.elapsed, highTide: c.highTide, warned: c.warned, tideChanged: c.tideChanged,
            kills: c.kills, rng: c.rng, nextEntity: c.nextEntity, reloadLeft: c.reloadLeft, fireCooldown: c.fireCooldown, knife: c.knife, hitTime: c.hitTime });
        const projected = raid.pursuits.filter(p => p.sourceMap === raid.currentMap);
        layer.enemies = c.enemies.filter(e => !projected.some(p => p.enemy.uid === e.uid));
        projected.forEach(p => { const enemy = c.enemies.find(e => e.uid === p.enemy.uid); if (enemy) p.enemy = enemy; });
        Object.assign(layer, { loot: c.loot, containers: c.containers!, bullets: c.bullets,
            noise: c.shotNoise && c.noiseTime > 0 ? { at: c.shotNoise, radius: c.noiseRadius, remaining: c.noiseTime } : null });
        return state;
    }
    restoreExpansion(state: ExpansionState): void {
        const oldMap = this.layered?.raid?.currentMap; this.layered = structuredClone(state);
        // A durable terminal write restores body/base state before the scene stops.
        if (!this.layered.raid) return;
        const raid = this.layered.raid!, layer = raid.maps[raid.currentMap];
        if (oldMap !== raid.currentMap) this.drawEnvironment();
        this.restore({ version: 2, worldVersion: WORLD_VERSION, seed: raid.seed, runId: raid.runId, loadout: raid.loadout, player: raid.player,
            hp: state.body.hp, stamina: state.body.stamina, pollution: state.body.pollution, bleeding: Number(state.body.bleeding),
            kills: raid.kills, elapsed: raid.elapsed, highTide: raid.highTide, knife: raid.knife, reloadLeft: raid.reloadLeft, fireCooldown: raid.fireCooldown,
            warned: raid.warned, tideChanged: raid.tideChanged, shotNoise: layer.noise?.at ?? null, noiseRadius: layer.noise?.radius ?? 510, noiseTime: layer.noise?.remaining ?? 0,
            hitTime: raid.hitTime, exhausted: state.body.exhausted, stepTime: this.stepTime, noteSeen: [], rng: raid.rng, nextEntity: raid.nextEntity,
            enemies: [...layer.enemies, ...raid.pursuits.filter(p => p.sourceMap === raid.currentMap).map(p => p.enemy)], loot: layer.loot, containers: layer.containers, bullets: layer.bullets });
    }
    retryLayerMutation(): boolean {
        if (!this.pendingLayer) return this.checkpoint();
        const result = saveSession.commitExpansionMutation(this.pendingLayer);
        if (result !== 'committed') return false;
        this.pendingLayer = null; this.drawEnvironment(); this.suppressHeldInput(); this.updateHud(); return true;
    }
    private layerMutation(action: (state: ExpansionState) => boolean | void, suppress = false): boolean {
        const ticket = saveSession.prepareExpansionMutation(draft => action(draft.expansion));
        if (!ticket) return false;
        const result = saveSession.commitExpansionMutation(ticket);
        if (result === 'save-failed') { this.pendingLayer = ticket; setOverlay('checkpoint-error'); return false; }
        if (result !== 'committed') return false;
        this.drawEnvironment(); if (suppress) this.suppressHeldInput(); return true;
    }
    getLootContainer(id: string): LootContainer | undefined { return this.containers.find(container => container.id === id); }
    canLootContainer(id: string, runId: string): boolean {
        const container = this.getLootContainer(id);
        return !!container && !!runId && !!this.player && app.state === 'run' && app.raid === this && this.scene.isActive()
            && app.loadout?.runId === runId && app.save.activeRun?.runId === runId && container.runId === runId
            && !this.locked && !this.extracted && this.hp > 0 && !app.pendingSettlement && !app.conflict
            && distance(this.player, container) < 43 && this.walkable(container.x, container.y, this.highTide)
            && this.sight(this.player, container, this.highTide, 10);
    }
    private lootTargets(): LootContainer[] {
        const targets = this.containers.filter(container => this.canLootContainer(container.id, container.runId));
        // Stable ties preserve creation order, including the numbers on overlapping corpses.
        targets.sort((a, b) => distance(a, this.player) - distance(b, this.player));
        if (!targets.some(container => container.id === this.lootTargetId)) this.lootTargetId = targets[0]?.id || '';
        return targets;
    }
    /** Selection is local UI state; opening still rechecks the current run, range and tide. */
    cycleLootTarget(delta: number): boolean {
        if (!Number.isFinite(delta) || !delta || playerInput.touch || app.overlay || this.paused
            || this.visibleExits.some(exit => distance(exit, this.player) < 48)) return false;
        const targets = this.lootTargets();
        if (targets.length < 2) return false;
        const index = targets.findIndex(container => container.id === this.lootTargetId);
        this.lootTargetId = targets[(index + Math.sign(delta) + targets.length) % targets.length].id;
        return true;
    }
    private lootTargetName(container: LootContainer): string {
        const sameName = this.containers.filter(other => other.name === container.name);
        return sameName.length > 1 ? `${container.name} ${sameName.findIndex(other => other.id === container.id) + 1}` : container.name;
    }
    private createLootContainer(id: string, kind: LootContainer['kind'], name: string, x: number, y: number, items: { id: string; qty: number }[]): void {
        if (this.getLootContainer(id)) return;
        const inventory = D.createInventory(6, 5);
        for (const item of items) {
            if (D.addItem(inventory, item.id, item.qty)) throw new Error('战利品超过容器容量');
        }
        this.containers.push({ id, runId: app.loadout!.runId!, kind, name, x, y, inventory });
    }
    private validateLootContext(): void {
        const context = app.lootContext;
        if (context && !this.canLootContainer(context.containerId, context.runId)) setOverlay('');
    }
    checkpoint(): boolean {
        if (this.locked || this.extracted || app.pendingSettlement || app.conflict) return false;
        const ok = saveSession.persist();
        if (ok) this.checkpointAt = this.elapsed;
        else { setOverlay('checkpoint-error'); audio.stop(); }
        return ok;
    }
    snapshot(): RaidCheckpoint {
        this.syncMagazine();
        const actor = (sprite: Phaser.GameObjects.Image) => ({ x: sprite.x, y: sprite.y, rotation: sprite.rotation });
        return structuredClone({ version: 2, worldVersion: WORLD_VERSION, seed: this.config.seed, runId: app.loadout!.runId!,
            loadout: app.loadout!, player: actor(this.player), hp: this.hp, stamina: this.stamina, pollution: this.pollution,
            bleeding: this.bleeding, kills: this.kills, elapsed: this.elapsed, highTide: this.highTide, knife: this.knife,
            reloadLeft: this.reloadLeft, fireCooldown: this.fireCooldown, warned: this.warned, tideChanged: this.tideChanged,
            shotNoise: this.shotNoise, noiseRadius: this.noiseRadius, noiseTime: this.noiseTime, hitTime: this.hitTime,
            exhausted: this.exhausted, stepTime: this.stepTime, noteSeen: [...this.noteSeen], rng: this.random.getState(), nextEntity: this.nextEntity,
            enemies: this.enemies.map(({ sprite, ...e }) => ({ ...e, ...actor(sprite) })),
            loot: this.loot.map(({ sprite, ...l }) => ({ ...l, x: sprite.x, y: sprite.y, relief: !!l.relief })),
            containers: this.containers,
            bullets: this.bullets.map(({ sprite, ...b }) => ({ ...b, ...actor(sprite) })),
        });
    }
    /** Synchronous transaction rollback preserves held inputs and the foreground clock.
     * Loading a raid, pausing and losing focus release input at their lifecycle boundaries. */
    restore(c: RaidCheckpoint) {
        app.loadout = structuredClone(c.loadout);
        for (const key of ['hp','stamina','pollution','bleeding','kills','elapsed','highTide','knife','reloadLeft','fireCooldown',
            'warned','tideChanged','noiseRadius','noiseTime','hitTime','exhausted','stepTime','nextEntity'] as const) (this as any)[key] = c[key];
        this.player.setPosition(c.player.x, c.player.y).setRotation(c.player.rotation);
        this.mag = c.loadout.ammo; this.magRelief = c.loadout.ammoRelief;
        this.player.setTexture('player-' + this.currentWeapon.id);
        this.random = D.seededRandom(c.rng); this.noteSeen = new Set(c.noteSeen); this.shotNoise = c.shotNoise ? { ...c.shotNoise } : null;
        if (this.layered) {
            const sync = <T extends { uid: string; sprite: Phaser.GameObjects.Image }, S extends { uid: string }>(old: T[], states: S[], create: (state: S) => T, update: (entity: T, state: S) => void): T[] => {
                const existing = new Map(old.map(e => [e.uid, e]));
                const result = states.map(state => { const entity = existing.get(state.uid) ?? create(state); existing.delete(state.uid); update(entity, state); return entity; });
                existing.forEach(e => e.sprite.destroy()); return result;
            };
            this.enemies = sync(this.enemies, c.enemies, e => ({ ...structuredClone(e), sprite: this.add.image(e.x, e.y, e.id) }), (e, state) => {
                const { x, y, rotation, ...values } = state; Object.assign(e, structuredClone(values));
                e.sprite.setPosition(x, y).setRotation(rotation).setTexture(e.hp > 0 ? e.id : `corpse-${e.id}`).setDepth(e.hp > 0 ? 6 : 3).setAlpha(1).clearTint();
            });
            this.loot = sync(this.loot, c.loot, l => ({ ...l, sprite: this.add.image(l.x, l.y, `loot-${l.id}`).setDepth(4) }), (l, state) => {
                const { x, y, ...values } = state; Object.assign(l, values); l.sprite.setPosition(x, y).setTexture(`loot-${l.id}`).clearTint();
            });
            this.bullets = sync(this.bullets, c.bullets, b => ({ ...b, sprite: this.add.image(b.x, b.y, 'bullet').setDepth(10) }), (b, state) => {
                const { x, y, rotation, ...values } = state; Object.assign(b, values); b.sprite.setPosition(x, y).setRotation(rotation).setTint(b.enemy ? 0xe48c64 : 0xffffff);
            });
            const oldCrates = this.containers.filter(c => c.kind === 'crate').map(c => [c.id, c.x, c.y, c.inventory.items.length > 0]);
            const newCrates = (c.containers ?? []).filter(c => c.kind === 'crate').map(c => [c.id, c.x, c.y, c.inventory.items.length > 0]);
            if (JSON.stringify(oldCrates) !== JSON.stringify(newCrates)) {
                this.containerSprites.forEach(s => s.destroy()); this.containerSprites = (c.containers ?? []).filter(c => c.kind === 'crate').map(c => this.add.image(c.x, c.y, c.inventory.items.length ? 'loot-crate' : 'loot-crate-empty').setDepth(4).setData('containerId', c.id));
            }
            this.containers = structuredClone(c.containers ?? []); this.drawFlood(); return;
        }
        for (const entity of [...this.enemies, ...this.loot, ...this.bullets]) entity.sprite.destroy();
        this.enemies = c.enemies.map(({ x, y, rotation, ...e }) => {
            const sprite = this.add.image(x, y, e.id).setRotation(rotation).setDepth(e.hp > 0 ? 6 : 3);
            if (e.hp <= 0) sprite.setTexture(`corpse-${e.id}`);
            return { ...structuredClone(e), sprite };
        });
        this.loot = c.loot.map(({ x, y, ...l }) => ({ ...l, sprite: this.add.image(x, y, `loot-${l.id}`).setDepth(4) }));
        for (const sprite of this.containerSprites) sprite.destroy();
        this.containers = structuredClone(c.containers ?? []);
        this.containerSprites = this.containers.filter(container => container.kind === 'crate')
            .map(container => this.add.image(container.x, container.y, container.inventory.items.length ? 'loot-crate' : 'loot-crate-empty').setDepth(4).setData('containerId', container.id));
        this.bullets = c.bullets.map(({ x, y, rotation, ...b }) => ({ ...b, sprite: this.add.image(x, y, 'bullet').setRotation(rotation).setDepth(10).setTint(b.enemy ? 0xe48c64 : 0xffffff) }));
        this.drawFlood();
    }
    get paused() { return this.locked || ['pause', 'help', 'abandon', 'rotate', 'checkpoint-error'].includes(app.overlay); }
    get currentWeapon() { return D.WEAPONS[!this.knife && app.loadout?.weapon ? app.loadout.weapon : 'knife']; }
    drawFlood() { this.flood.clear(); for (let y = 0; y < this.mapData.tiles.length; y++)
        for (let x = 0; x < this.mapData.tiles[y].length; x++)
            if (this.mapData.tiles[y][x] === 4) {
                this.flood.fillStyle(this.highTide ? 0x345958 : 0x665446, this.highTide ? .87 : .2).fillRect(x * TILE, y * TILE, TILE, TILE);
                if (this.highTide) {
                    this.flood.lineStyle(1, 0xa96a54, .45).lineBetween(x * TILE + 4, y * TILE + 12, x * TILE + 25, y * TILE + 12);
                }
            } }
    private allocateEntityUid() { const serial = this.nextEntity++; return this.layered?.raid ? entityUid(this.layered.raid, serial) : `entity-${serial}`; }
    spawnLoot(x: number, y: number, id: string, qty: number, relief = false) { this.loot.push({ uid: this.allocateEntityUid(), sprite: this.add.image(x, y, `loot-${id}`).setDepth(4), id, qty, relief }); }
    nearbyLoot() { return this.loot.filter(l => distance(l.sprite, this.player) < 43 && this.sight(l.sprite, this.player, this.highTide, this.space ? 10 : 0)).sort((a, b) => distance(a.sprite, this.player) - distance(b.sprite, this.player) || a.uid.localeCompare(b.uid)); }
    pickupLoot(uid: string) {
        const loot = this.nearbyLoot().find(l => l.uid === uid);
        if (!loot) { toast('这件物资已不在拾取范围内。'); return false; }
        const result = saveSession.mutate(() => {
            const left = D.addItem(app.loadout!.bag, loot.id, loot.qty, !!loot.relief);
            if (left === loot.qty) return false;
            loot.qty = left;
            if (!left) { loot.sprite.destroy(); this.loot.splice(this.loot.indexOf(loot), 1); }
        }, this);
        if (result === 'committed') { audio.pickup(); toast('物资已收入背包。', 'success'); }
        else if (result === 'rejected') toast('背包空间不足，请整理物资。');
        else if (result === 'save-failed') { setOverlay('checkpoint-error'); toast('保存失败，本次拾取已撤回。'); }
        return result === 'committed';
    }
    drop(item: D.Item) { this.spawnLoot(this.player.x, this.player.y, item.id, item.qty, !!item.relief); }
    syncMagazine() { if (app.loadout) {
        app.loadout.ammo = this.mag;
        app.loadout.ammoRelief = this.magRelief;
    } }
    loadMagazine() { const loaded = D.reloadMagazine(app.loadout!.weapon || 'knife', this.mag, this.magRelief, app.loadout!.bag); this.mag = loaded.ammo; this.magRelief = loaded.ammoRelief; this.syncMagazine(); }
    equipItem(uid: string) { this.syncMagazine(); if (!D.equipRun(app.loadout!, uid)) {
        toast('无法装备，背包装不下换下的武器和弹药。请先腾出空间。');
        return false;
    } this.mag = app.loadout!.ammo; this.magRelief = app.loadout!.ammoRelief; this.knife = false; this.reloadLeft = 0; this.startReload(); this.player.setTexture('player-' + this.currentWeapon.id); toast('已装备' + this.currentWeapon.name); return true; }
    carriedWeight() { const l = app.loadout!, w = D.WEAPONS[l.weapon || 'knife']; return D.weight(l.bag) + D.weight(l.safe) + (l.weapon ? D.ITEMS[l.weapon].weight : 0) + D.ITEMS.knife.weight + (w.ammo ? D.ITEMS[w.ammo].weight * this.mag : 0) + (this.layered?.charm ? D.ITEMS[this.layered.charm.id].weight : 0); }
    carryLimit() { return this.layered ? derivedLimits(this.layered).carry : B.carryLimit; }
    say(message: string, seconds = 7) { css('radio', message); const el = document.getElementById('radio'); if (el)
        el.style.display = 'block'; this.radioTime = seconds; audio.radio(); }
    useItem(id: string, inv: D.Inventory = app.loadout!.bag, itemUid?: string) {
        const chosen = itemUid ? inv.items.find(i => i.uid === itemUid && i.id === id && i.qty > 0) : null;
        if (itemUid && !chosen) return false;
        if (this.layered) {
            if (!D.count(inv, id)) return false;
            const state = this.snapshotExpansion();
            if (!useRpgItem(state, id)) { toast('当前状态无需使用这件补给。'); return false; }
            if (chosen) { chosen.qty--; if (!chosen.qty) inv.items = inv.items.filter(i => i.uid !== chosen.uid); }
            else D.removeItem(inv, id, 1);
            state.raid!.loadout = structuredClone(app.loadout!); this.restoreExpansion(state);
            return true;
        }
        if (!['bandage', 'medkit', 'water', 'food', 'antidote'].includes(id) || !D.count(inv, id))
            return false;
        if (id === 'bandage') {
            if (this.hp >= B.maxHealth && !this.bleeding) {
                toast('生命已满，且没有流血，无需使用绷带。');
                return false;
            }
            this.hp = Math.min(B.maxHealth, this.hp + B.bandageHeal);
            this.bleeding = 0;
        }
        if (id === 'medkit') {
            if (this.hp >= B.maxHealth && !this.bleeding) {
                toast('生命已满，且没有流血，无需使用急救包。');
                return false;
            }
            this.hp = Math.min(B.maxHealth, this.hp + B.medkitHeal);
            this.bleeding = 0;
        }
        if (id === 'water') {
            this.stamina = B.maxStamina;
            this.pollution = Math.max(0, this.pollution - B.waterCleanse);
        }
        if (id === 'food') {
            this.stamina = Math.min(B.maxStamina, this.stamina + B.foodStamina);
            this.hp = Math.min(B.maxHealth, this.hp + B.foodHeal);
        }
        if (id === 'antidote')
            this.pollution = Math.max(0, this.pollution - B.antidoteCleanse);
        if (chosen) { chosen.qty--; if (!chosen.qty) inv.items = inv.items.filter(i => i.uid !== chosen.uid); }
        else D.removeItem(inv, id, 1);
        audio.pickup();
        toast(`已使用${D.ITEMS[id].name}`);
        return true;
    }
    heal() { const bag = app.loadout!.bag; const id = this.bleeding && D.count(bag, 'bandage') ? 'bandage' : D.count(bag, 'medkit') ? 'medkit' : D.count(bag, 'bandage') ? 'bandage' : null; if (id) {
        const result = saveSession.mutate(() => this.useItem(id), this);
        if (result === 'save-failed') setOverlay('checkpoint-error');
        else if (result === 'committed' && this.layered) toast(`已使用${D.ITEMS[id].name}`);
    } else
        toast('背包中没有绷带或急救包。'); }
    move(sprite: Phaser.GameObjects.Image, dx: number, dy: number, canEscapeFlood = false) { const escaping = canEscapeFlood && !this.walkable(sprite.x, sprite.y, true, 10) && this.walkable(sprite.x, sprite.y, false, 10); const high = this.highTide && !escaping; if (this.walkable(sprite.x + dx, sprite.y, high, 10))
        sprite.x += dx; if (this.walkable(sprite.x, sprite.y + dy, high, 10))
        sprite.y += dy; }
    startReload() { const w = this.currentWeapon; if (w.ammo && !this.reloadLeft && this.mag < w.magazine) {
        if (!D.count(app.loadout!.bag, w.ammo)) {
            toast('背包中没有适用的备用弹药。');
            return;
        }
        this.reloadLeft = w.reload;
        audio.click();
    } }
    shoot() {
        const w = this.currentWeapon;
        if (this.fireCooldown > 0 || this.reloadLeft > 0)
            return;
        if (w.ammo && this.mag <= 0) {
            this.startReload();
            return;
        }
        this.fireCooldown = w.cooldown;
        if (!w.ammo) {
            audio.shot('knife');
            const hit = this.enemies.find(e => e.hp > 0 && distance(e.sprite, this.player) < w.range && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.sprite.y - this.player.y, e.sprite.x - this.player.x) - this.player.rotation)) < 1.15 && this.sight(this.player, e.sprite, this.highTide, this.space ? 10 : 0));
            if (hit)
                this.damageEnemy(hit, w.damage);
            this.fx.lineStyle(3, 0xe4debb, .85).beginPath().arc(this.player.x, this.player.y, 32, this.player.rotation - .7, this.player.rotation + .7).strokePath();
            return;
        }
        this.mag--;
        if (this.magRelief > 0)
            this.magRelief--;
        this.syncMagazine();
        audio.shot(w.id);
        this.shotNoise = { x: this.player.x, y: this.player.y };
        this.noiseRadius = B.gunNoiseRange;
        this.noiseTime = .6;
        const aim = (this.inputFrame.precise ? .35 : 1) * (this.layered ? rpgMultipliers(this.snapshotExpansion()).recoil : 1);
        for (let i = 0; i < w.pellets; i++) {
            const angle = this.player.rotation + (this.random() - .5) * w.spread * aim;
            this.bullets.push({ uid: this.allocateEntityUid(), sprite: this.add.image(this.player.x + Math.cos(angle) * 17, this.player.y + Math.sin(angle) * 17, 'bullet').setRotation(angle).setDepth(10), vx: Math.cos(angle) * 760, vy: Math.sin(angle) * 760, left: w.range, damage: w.damage, enemy: false });
        }
        this.fx.fillStyle(0xffe5a0, 1).fillCircle(this.player.x + Math.cos(this.player.rotation) * 23, this.player.y + Math.sin(this.player.rotation) * 23, 4);
        this.cameras.main.shake(40, .0008);
    }
    damageEnemy(e: Enemy, damage: number) { if (e.hp <= 0) return;
        if (this.layered) {
            const state = this.snapshotExpansion(), raid = state.raid!, mapId = raid.currentMap;
            const enemy = raid.maps[mapId].enemies.find(actor => actor.uid === e.uid) ?? raid.pursuits.find(p => p.enemy.uid === e.uid)?.enemy;
            if (enemy) { damageLayerEnemy(state, this.layeredWorld!.maps[mapId].id, enemy, damage, false); this.restoreExpansion(state); audio.hit(); }
            return;
        }
        e.hp = D.applyDamage(e.hp, damage); e.sprite.setTintFill(0xe9ccb5); this.time.delayedCall(70, () => { if (e.sprite.active && e.hp > 0)
        e.sprite.clearTint(); }); e.state = 'chase'; e.alert = 6; e.target = { x: this.player.x, y: this.player.y }; audio.hit(); if (e.hp <= 0) {
        this.kills++;
        e.sprite.setTexture(`corpse-${e.id}`).clearTint().setRotation(e.sprite.rotation + Math.PI / 2).setAlpha(1).setDepth(3);
        const drops = D.rollLoot(this.config.seed + this.kills * 47, e.id === 'elite' ? 3 : 1);
        // Keep the old scatter-offset random calls so later combat rolls do not shift.
        for (let i = 0; i < drops.length; i++) { this.random(); this.random(); }
        this.createLootContainer(`corpse-${e.uid}`, 'corpse', `${D.ENEMIES[e.id].name}遗体`, e.sprite.x, e.sprite.y, drops);
    } }
    private showIncomingHit(source?: Point): void {
        if (source) {
            const angle = Math.atan2(source.y - this.player.y, source.x - this.player.x), sector = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
            this.hitDirections = this.hitDirections.filter(hit => hit.sector !== sector);
            this.hitDirections.push({ sector, angle, left: 1 });
        }
        this.hitNotice = 1;
    }
    hurt(amount: number, source?: Point, owner?: string) { if (this.extracted)
        return;
        this.showIncomingHit(source);
        if (this.layered) {
            const state = this.snapshotExpansion(); enemyDamage(state, amount, owner, this.random()); state.raid!.rng = this.random.getState();
            this.restoreExpansion(state); this.extractTime = 0; audio.hit(); if (this.hp <= 0) finish('death'); return;
        }
        this.hp = D.applyDamage(this.hp, amount); this.hitTime = .25; this.extractTime = 0; if (this.random() < B.bleedChance)
        this.bleeding = 1; audio.hit(); this.cameras.main.shake(100, .002); if (this.hp <= 0)
        finish('death'); }
    update(_time: number, _delta: number) {
        if (this.player) this.validateLootContext();
        if (app.overlay === 'loot') this.suppressHeldInput();
        if (app.state !== 'run' || !this.player || this.extracted || this.paused) { this.clock.reset(); return; }
        const tick = this.clock.tick(performance.now());
        if (tick.stalled) { this.lastStall = { seconds: tick.seconds, at: performance.now() }; setOverlay('pause'); toast('画面暂时停顿，行动已暂停。准备好后继续。'); return; }
        this.elapsed += tick.seconds;
        if (this.elapsed >= this.config.duration) { this.extracted = true; finish('timeout'); return; }
        const frame = playerInput.read(!app.overlay); this.inputSuppressed = false;
        for (let i = 0; i < tick.steps; i++) {
            if (app.state !== 'run' || this.paused) break;
            this.inputFrame = i === 0 ? frame : { ...frame, actions: new Set(), firePressed: false, fireHeld: false };
            if (this.inputSuppressed) this.inputFrame = { ...this.inputFrame, x: 0, y: 0, sprint: false, aim: null, firePressed: false, fireHeld: false, interactHeld: false, actions: new Set() };
            this.step(tick.seconds / tick.steps);
        }
        if (app.state === 'run' && !this.paused && this.elapsed - this.checkpointAt >= 2) this.checkpoint();
    }
    private step(dt: number) {
        const tideFlipped = !this.tideChanged && this.elapsed >= this.config.tideAt;
        if (this.layered?.raid) {
            const layer = this.layered.raid.maps[this.layered.raid.currentMap];
            layer.localTime = Math.min(this.elapsed, layer.localTime + dt);
        }
        this.fireCooldown = Math.max(0, this.fireCooldown - dt);
        this.noiseTime = Math.max(0, this.noiseTime - dt);
        this.hitTime = Math.max(0, this.hitTime - dt);
        this.hitNotice = Math.max(0, this.hitNotice - dt);
        this.hitDirections = this.hitDirections.map(hit => ({ ...hit, left: hit.left - dt })).filter(hit => hit.left > 0);
        this.fx.clear();
        if (this.elapsed >= this.config.duration) {
            this.extracted = true;
            finish('timeout');
            return;
        }
        if (!this.warned && this.elapsed >= this.config.warningAt) {
            this.warned = true;
            this.say('潮汐预警：30 秒后潮位变化。请离开浅滩，走高架路或海堤。', 12);
        }
        if (tideFlipped) {
            this.tideChanged = true;
            this.highTide = !this.highTide;
            this.drawFlood();
            for (const e of this.enemies) {
                e.path = [];
                e.repath = 0;
                if (this.highTide && !this.walkable(e.sprite.x, e.sprite.y, true, 10)) {
                    const refuge = this.dryRefuge(e.sprite);
                    if (refuge) {
                        e.target = refuge;
                        e.state = 'return';
                        e.path = this.path(e.sprite, refuge, false);
                    }
                }
            }
            this.say(this.highTide ? '涨潮了，浅滩无法通行。高架路和海堤仍可通行。' : '退潮了，浅滩可以通行。涉水仍会积累污染。', 10);
            this.validateLootContext();
        }
        const input = !app.overlay, frame = this.inputFrame;
        const dx = input ? frame.x : 0, dy = input ? frame.y : 0;
        if (input) {
            if (frame.actions.has('reload')) this.startReload();
            if (frame.actions.has('heal')) this.heal();
            if (frame.actions.has('primary')) { this.knife = false; this.reloadLeft = 0; }
            if (frame.actions.has('knife')) { this.knife = true; this.reloadLeft = 0; }
        }
        if (this.paused) return;
        this.player.setTexture('player-' + this.currentWeapon.id);
        if (this.stamina <= B.exhaustedAt)
            this.exhausted = true;
        if (this.stamina >= B.sprintRecoveryAt)
            this.exhausted = false;
        const beforeMove = { x: this.player.x, y: this.player.y };
        const limits = this.layered ? derivedLimits(this.layered) : { hp: B.maxHealth, stamina: B.maxStamina, carry: B.carryLimit };
        const moving = !!(dx || dy), over = Math.max(0, this.carriedWeight() - limits.carry), sprint = input && frame.sprint && moving && !this.exhausted;
        const speed = (sprint ? B.sprintSpeed : B.walkSpeed) * (this.inputFrame.precise && !sprint ? B.aimSpeedFactor : 1) / Math.max(1, 1 + over * B.overloadSlowdownPerKg) * (this.layered ? rpgMultipliers(this.layered).movement : 1);
        if (moving) {
            const len = Math.max(1, Math.hypot(dx, dy));
            this.move(this.player, dx / len * speed * dt, dy / len * speed * dt, true);
            this.stepTime -= dt;
            if (this.stepTime <= 0) {
                audio.step();
                this.stepTime = sprint ? .25 : .42;
                if (sprint && this.noiseTime <= .15) {
                    this.shotNoise = { x: this.player.x, y: this.player.y };
                    this.noiseRadius = B.sprintNoiseRange;
                    this.noiseTime = .15;
                }
            }
        }
        if (this.layered) {
            const state = this.snapshotExpansion(), flooded = this.space!.definition.cells[Math.floor(this.player.y / 32)]?.[Math.floor(this.player.x / 32)] === 'tide';
            const spent = advanceRaidBody(state, dt, sprint, this.carriedWeight(), flooded);
            recordMotion(state, beforeMove, this.player, dt, spent, this.carriedWeight()); this.restoreExpansion(state);
        } else this.stamina = Phaser.Math.Clamp(this.stamina + (sprint ? -(B.sprintDrain + over) : B.staminaRecovery) * dt, 0, B.maxStamina);
        if (input) {
            if (frame.touch) {
                if (frame.aim) this.player.rotation = Math.atan2(frame.aim.y, frame.aim.x);
            } else {
                const rect = this.game.canvas.getBoundingClientRect();
                const world = this.cameras.main.getWorldPoint((frame.pointer.x - rect.left) / rect.width * 960, (frame.pointer.y - rect.top) / rect.height * 540);
                this.player.rotation = Math.atan2(world.y - this.player.y, world.x - this.player.x);
            }
            if (frame.firePressed || frame.fireHeld) this.shoot();
        }
        if (this.reloadLeft > 0) {
            this.reloadLeft = Math.max(0, this.reloadLeft - dt);
            if (this.reloadLeft === 0) {
                this.loadMagazine();
                audio.click();
            }
        }
        const flooded = this.mapData.tiles[Math.floor(this.player.y / TILE)]?.[Math.floor(this.player.x / TILE)] === 4;
        if (!this.layered) {
            this.pollution = Phaser.Math.Clamp(this.pollution + (flooded ? (this.highTide ? B.pollutionHighTide : B.pollutionLowTide) : -B.pollutionRecovery) * dt, 0, 100);
            this.hp -= dt * (this.bleeding * B.bleedDamage + (this.pollution > B.pollutionDamageThreshold ? (this.pollution - B.pollutionDamageBase) * B.pollutionDamageFactor : 0));
        }
        if (this.hp <= 0) {
            finish('death');
            return;
        }
        if (this.layered) {
            const state = this.snapshotExpansion();
            const changed = advancePursuits(state, this.layeredWorld!, tideFlipped);
            if (changed) { if (!this.layerMutation(candidate => { Object.assign(candidate, state); })) return; }
            else this.restoreExpansion(state);
        }
        for (const e of this.enemies)
            if (e.hp > 0) {
                if (this.layered?.raid?.pursuits.some(p => p.enemy.uid === e.uid)) continue;
                this.updateEnemy(e, dt);
                if (app.state !== 'run' || this.locked)
                    return;
            }
        this.updateBullets(dt);
        if (app.state !== 'run' || this.locked)
            return;
        this.interact(dt, input, moving);
        if (app.state !== 'run' || this.locked)
            return;
        this.drawEffects(dt);
        this.drawRoofs();
        this.radioTime -= dt;
        if (this.radioTime <= 0) {
            const el = document.getElementById('radio');
            if (el)
                el.style.display = 'none';
        }
        this.hudTime -= dt;
        if (this.hudTime <= 0) {
            this.hudTime = .1;
            this.updateHud();
            if (app.overlay === 'map')
                drawMap();
        }
    }
    updateEnemy(e: Enemy, dt: number) {
        const def = D.ENEMIES[e.id], dist = distance(e.sprite, this.player), sees = dist < def.vision && this.sight(e.sprite, this.player);
        e.timer -= dt;
        e.cooldown -= dt;
        e.repath -= dt;
        e.alert = Math.max(0, e.alert - dt);
        const escaping = this.highTide && !this.walkable(e.sprite.x, e.sprite.y, true, 10);
        if (escaping) {
            const refuge = this.dryRefuge(e.sprite);
            if (refuge) {
                if (!e.path.length || e.repath <= 0) {
                    e.path = this.path(e.sprite, refuge, false);
                    e.repath = 1;
                }
                while (e.path.length && distance(e.sprite, e.path[0]) < 10)
                    e.path.shift();
                const target = e.path[0] || refuge, angle = Math.atan2(target.y - e.sprite.y, target.x - e.sprite.x);
                e.sprite.rotation = angle;
                this.move(e.sprite, Math.cos(angle) * def.speed * dt, Math.sin(angle) * def.speed * dt, true);
            }
            return;
        }
        if (sees) {
            e.state = dist < def.range ? 'attack' : 'chase';
            e.target = { x: this.player.x, y: this.player.y };
            e.alert = 5;
        }
        else if (this.noiseTime > 0 && this.shotNoise && distance(e.sprite, this.shotNoise) < this.noiseRadius) {
            e.state = 'investigate';
            e.target = { ...this.shotNoise };
            e.alert = 5;
        }
        else if ((e.state === 'chase' || e.state === 'attack') && e.alert <= 0) {
            e.state = 'return';
            e.target = e.home;
        }
        if (e.state === 'investigate' && distance(e.sprite, e.target) < 24 && e.alert <= 0) {
            e.state = 'return';
            e.target = e.home;
        }
        if (e.state === 'return' && distance(e.sprite, e.home) < 28) {
            e.state = 'patrol';
            e.timer = 0;
        }
        if (e.state === 'patrol' && e.timer <= 0) {
            const p = { x: e.home.x + (this.random() - .5) * 170, y: e.home.y + (this.random() - .5) * 170 };
            if (this.walkable(p.x, p.y, this.highTide))
                e.target = p;
            e.timer = 3 + this.random() * 4;
        }
        if (e.state === 'attack' && sees) {
            e.sprite.rotation = Math.atan2(this.player.y - e.sprite.y, this.player.x - e.sprite.x);
            if (e.cooldown <= 0) {
                e.cooldown = def.cooldown;
                const angle = e.sprite.rotation + (this.random() - .5) * .16;
                if (e.id === 'salt' || e.id === 'elite') {
                    this.bullets.push({ uid: this.allocateEntityUid(), sprite: this.add.image(e.sprite.x + Math.cos(angle) * 18, e.sprite.y + Math.sin(angle) * 18, 'bullet').setTint(0xe48c64).setRotation(angle).setDepth(10), vx: Math.cos(angle) * 365, vy: Math.sin(angle) * 365, left: def.range + 70, damage: def.damage, enemy: true, ...(this.layered ? { owner: e.uid } : {}) });
                    audio.shot('enemy');
                }
                else if (!this.space || this.sight(e.sprite, this.player, this.highTide, 10))
                    this.hurt(def.damage, e.sprite, e.uid);
            }
            return;
        }
        if (distance(e.sprite, e.target) > 12) {
            if (e.repath <= 0) {
                e.path = this.path(e.sprite, e.target, this.highTide);
                e.repath = .9 + this.random() * .6;
            }
            let target = e.target;
            if (!this.sight(e.sprite, target, this.highTide, 10) || !this.walkable(target.x, target.y, this.highTide)) {
                while (e.path.length && distance(e.sprite, e.path[0]) < 14)
                    e.path.shift();
                if (e.path.length)
                    target = e.path[0];
                else
                    return;
            }
            const angle = Math.atan2(target.y - e.sprite.y, target.x - e.sprite.x);
            if (this.space) {
                const next = { x: e.sprite.x + Math.cos(angle) * (def.speed * dt + 12), y: e.sprite.y + Math.sin(angle) * (def.speed * dt + 12) };
                const door = this.space.definition.doors.find(d => Math.floor(next.x / 32) === d.x && Math.floor(next.y / 32) === d.y);
                if (door && !this.space.doors[door.id]) {
                    this.layerMutation(state => { state.raid!.maps[state.raid!.currentMap].doors[door.id] = true; }); return;
                }
            }
            e.sprite.rotation = angle;
            this.move(e.sprite, Math.cos(angle) * def.speed * dt, Math.sin(angle) * def.speed * dt, true);
        }
    }
    updateBullets(dt: number) {
        if (this.layered) {
            const state = this.snapshotExpansion(); advanceLayerShots(state, this.layeredWorld!, state.raid!.currentMap, dt, (uid, critical) => {
                audio.hit(); if (critical) {
                    const enemy = this.enemies.find(e => e.uid === uid);
                    if (enemy) { const text = this.add.text(enemy.sprite.x, enemy.sprite.y - 35, '爆头', { fontSize: '12px', color: '#ffd596', backgroundColor: '#392a20' }).setOrigin(.5).setDepth(15); this.time.delayedCall(500, () => text.destroy()); }
                }
            }, source => { this.showIncomingHit(source); this.extractTime = 0; audio.hit(); });
            this.restoreExpansion(state); if (this.hp <= 0) finish('death'); return;
        }
        for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i], speed = Math.hypot(b.vx, b.vy), steps = Math.ceil(speed * dt / 7);
        let remove = false;
        for (let j = 0; j < steps; j++) {
            b.sprite.x += b.vx * dt / steps;
            b.sprite.y += b.vy * dt / steps;
            b.left -= speed * dt / steps;
            const t = this.mapData.tiles[Math.floor(b.sprite.y / TILE)]?.[Math.floor(b.sprite.x / TILE)];
            if (t === 3 || t === undefined || b.left <= 0) {
                remove = true;
                break;
            }
            if (b.enemy) {
                if (distance(b.sprite, this.player) < 12) {
                    this.hurt(b.damage, { x: this.player.x - b.vx, y: this.player.y - b.vy });
                    remove = true;
                    break;
                }
            }
            else {
                const e = this.enemies.find(e => e.hp > 0 && distance(e.sprite, b.sprite) < 14);
                if (e) {
                    this.damageEnemy(e, b.damage);
                    remove = true;
                    break;
                }
            }
        }
        if (remove) {
            b.sprite.destroy();
            this.bullets.splice(i, 1);
        }
        if (app.state !== 'run' || this.locked)
            return;
    } }
    interact(dt: number, input: boolean, moving: boolean) {
        if (this.layered) { this.interactLayered(dt, input, moving); return; }
        const el = document.getElementById('interaction');
        if (!el)
            return;
        let text = '';
        const exit = this.visibleExits.find(e => distance(e, this.player) < 48);
        const nearby = this.nearbyLoot();
        const targets = this.lootTargets();
        const candidates: { point: Point; ground?: Ground; container?: LootContainer; key: string }[] = [
            ...nearby.map(ground => ({ point: ground.sprite, ground, key: ground.uid })),
            ...targets
                .map(container => ({ point: container, container, key: container.id })),
        ];
        candidates.sort((a, b) => distance(a.point, this.player) - distance(b.point, this.player)
            || a.point.x - b.point.x || a.point.y - b.point.y || a.key.localeCompare(b.key));
        // The touch interaction button keeps nearest-item behavior; source names open exact containers.
        const container = playerInput.touch ? candidates[0]?.container : targets.find(target => target.id === this.lootTargetId);
        const loot = playerInput.touch ? candidates[0]?.ground : nearby[0];
        const note = this.mapData.notes.find(n => distance(n, this.player) < 43);
        const touchButton = document.getElementById('touch-interact');
        if (touchButton) touchButton.textContent = exit ? '按住撤离' : container ? '搜刮' : loot ? '拾取' : note ? '阅读' : '交互';
        if (exit) {
            text = `${exit.name}　·　站稳并按住 E 3 秒撤离`;
            if (input && this.inputFrame.interactHeld && !moving && !this.hitTime) {
                this.extractTime += dt;
                text = `正在撤离　${Math.min(B.extractionSeconds, this.extractTime).toFixed(1)} / ${B.extractionSeconds.toFixed(1)} 秒`;
                if (this.extractTime >= B.extractionSeconds) {
                    this.extracted = true;
                    this.syncMagazine();
                    finish('extract');
                    return;
                }
            }
            else
                this.extractTime = 0;
        }
        else {
            this.extractTime = 0;
            if (container) {
                text = `E 搜刮　${container.name}${container.inventory.items.length ? '' : ' · 已搜空'}`;
                if (input && this.inputFrame.actions.has('interact')) openLoot(container.id, container.runId);
            }
            else if (loot) {
                text = `E 拾取　${D.ITEMS[loot.id].name} × ${loot.qty}`;
                if (input && this.inputFrame.actions.has('interact')) {
                    this.pickupLoot(loot.uid);
                }
            }
            else if (note) {
                text = `E 阅读　${note.title}`;
                if (input && this.inputFrame.actions.has('interact')) {
                    this.say(`${note.title}：${note.text}`, 14);
                    this.noteSeen.add(note.title);
                    if (playerInput.touch) { app.reading = { title: note.title, text: note.text }; setOverlay('reading'); }
                }
            }
        }
        text = playerInput.touch ? text.replace('站稳并按住 E 3 秒撤离', '停稳，按住「撤离」3 秒').replace('E 搜刮', '点「搜刮」').replace('E 拾取', '附近物资').replace('E 阅读', '附近记录') : text;
        this.renderInteraction(text, exit ? [] : targets, nearby, !!(exit || container));
    }
    private renderInteraction(text: string, targets: LootContainer[], nearby: Ground[], showNearby: boolean): void {
        const el = document.getElementById('interaction');
        if (!el) return;
        const listedTargets = targets.map(target => ({
            id: target.id, name: this.lootTargetName(target), empty: !target.inventory.items.length,
        }));
        if (listedTargets.length) text = playerInput.touch ? '点名称搜刮' : listedTargets.length > 1
            ? `滚轮切换 · E 搜刮　${listedTargets.findIndex(target => target.id === this.lootTargetId) + 1} / ${listedTargets.length}`
            : 'E 搜刮';
        const signature = JSON.stringify([text, nearby.length, listedTargets, this.lootTargetId]);
        if (el.dataset.content !== signature) {
            el.dataset.content = signature; el.replaceChildren();
            const description = document.createElement('span'); description.textContent = text; el.append(description);
            if (listedTargets.length) {
                const list = document.createElement('ul'); list.className = 'loot-targets'; list.setAttribute('aria-label', '附近可搜刮的箱子和尸体');
                for (const target of listedTargets) {
                    const row = document.createElement('li'); row.dataset.lootTarget = target.id;
                    const selected = target.id === this.lootTargetId;
                    if (selected) row.setAttribute('aria-current', 'true');
                    row.textContent = `${selected ? '▶ ' : ''}${target.name}${target.empty ? ' · 已搜空' : ''}`;
                    if (playerInput.touch) {
                        const button = document.createElement('button'); button.textContent = row.textContent;
                        button.onclick = () => {
                            if (app.overlay || this.paused || this.visibleExits.some(e => distance(e, this.player) < 48)) return;
                            openLoot(target.id, app.loadout!.runId!);
                        };
                        row.replaceChildren(button);
                    }
                    list.append(row);
                }
                el.append(list);
            }
            if (nearby.length > 1 || (showNearby && nearby.length)) {
                const button = document.createElement('button'); button.textContent = `附近 ${nearby.length}`; button.dataset.action = 'nearby'; button.onclick = () => setOverlay('nearby'); el.append(button);
            }
        }
        el.style.display = text && !app.overlay ? 'block' : 'none';
        const selectedRow = el.querySelector<HTMLElement>('.loot-targets [aria-current="true"]');
        if (!playerInput.touch && selectedRow && el.style.display !== 'none') {
            const list = selectedRow.parentElement!;
            if (selectedRow.offsetTop < list.scrollTop) list.scrollTop = selectedRow.offsetTop;
            else if (selectedRow.offsetTop + selectedRow.offsetHeight > list.scrollTop + list.clientHeight)
                list.scrollTop = selectedRow.offsetTop + selectedRow.offsetHeight - list.clientHeight;
        }
        const height = `${el.offsetHeight}px`;
        if (document.documentElement.style.getPropertyValue('--interaction-height') !== height)
            document.documentElement.style.setProperty('--interaction-height', height);
    }
    private interactLayered(dt: number, input: boolean, moving: boolean): void {
        const context = this.space!, map = context.definition, candidates: Interaction[] = [
            ...this.visibleExits.map(e => ({ id: e.id, kind: 'exit' as const, at: e, label: e.name })),
            ...map.entries.map(e => ({ id: e.id, kind: 'entry' as const, at: e.at, label: e.label ?? '楼层入口' })),
            ...this.loot.map(l => ({ id: l.uid, kind: 'ground' as const, at: l.sprite, label: `拾取 · ${D.ITEMS[l.id].name} × ${l.qty}` })),
            ...this.containers.map(c => ({ id: c.id, kind: 'container' as const, at: c, label: `搜刮 · ${c.name}${c.inventory.items.length ? '' : ' · 已搜空'}` })),
            ...this.mapData.notes.map(n => ({ id: n.title, kind: 'note' as const, at: n, label: `阅读 · ${n.title}` })),
        ];
        for (const door of map.doors) {
            const at = doorAnchor(context, door.id, this.player);
            if (at) candidates.push({ id: door.id, kind: 'door', at, label: context.doors[door.id] ? '关门' : '开门' });
        }
        let target = interactionTarget(context, this.player, candidates);
        const targets = this.lootTargets(), touch = document.getElementById('touch-interact');
        const listAvailable = target?.kind === 'container' || target?.kind === 'ground';
        if (listAvailable && !playerInput.touch) {
            const selected = targets.find(c => c.id === this.lootTargetId);
            if (selected) target = { id: selected.id, kind: 'container', at: selected, label: `搜刮 · ${this.lootTargetName(selected)}` };
        }
        if (touch) { touch.textContent = target?.kind === 'exit' ? '按住撤离' : target?.label.split(' · ')[0] ?? '交互'; touch.setAttribute('aria-label', target?.label ?? '交互'); }
        let text = target ? `${playerInput.touch ? '点' : 'E'} ${target.label}` : '';
        if (target?.kind === 'exit') {
            text = `${target.label} · ${playerInput.touch ? '停稳，按住「撤离」3 秒' : '站稳并按住 E 3 秒撤离'}`;
            if (input && this.inputFrame.interactHeld && !moving && !this.hitTime) {
                this.extractTime += dt; text = `正在撤离　${Math.min(3, this.extractTime).toFixed(1)} / 3.0 秒`;
                if (this.extractTime >= 3) { this.extracted = true; finish('extract'); return; }
            } else this.extractTime = 0;
        } else {
            this.extractTime = 0;
            if (input && target && this.inputFrame.actions.has('interact')) {
                if (target.kind === 'entry') {
                    if (!this.layerMutation(state => changeLayer(state, this.layeredWorld!, target.id), true) && app.storageOK) toast('入口被挡住，暂时无法进入。');
                } else if (target.kind === 'door') {
                    this.layerMutation(state => {
                        const raid = state.raid!, layer = raid.maps[raid.currentMap];
                        const living = [...layer.enemies, ...raid.pursuits.filter(p => p.sourceMap === raid.currentMap).map(p => p.enemy)].filter(e => e.hp > 0);
                        const result = toggleDoor({ definition: map, doors: layer.doors, highTide: raid.highTide }, target.id, raid.player, living);
                        if (result === 'occupied') { toast('门口有人，暂时不能关门。'); return false; }
                        return result !== 'unreachable';
                    }, true);
                } else if (target.kind === 'ground') this.pickupLoot(target.id);
                else if (target.kind === 'container') openLoot(target.id, app.loadout!.runId!);
                else if (target.kind === 'note') {
                    const note = this.mapData.notes.find(n => n.title === target.id)!; this.say(`${note.title}：${note.text}`, 14);
                    if (playerInput.touch) { app.reading = { title: note.title, text: note.text }; setOverlay('reading'); }
                }
            }
        }
        this.renderInteraction(text, listAvailable ? targets : [], this.nearbyLoot(), !!target);
    }
    drawEffects(dt: number) {
        this.weather.clear();
        const cam = this.cameras.main;
        this.weather.fillStyle(0x0c242a, .12).fillRect(0, 0, 960, 540);
        this.weather.lineStyle(1, 0x9bbdb5, .1);
        for (let i = 0; i < (this.space && this.space.definition.id !== 'coast' ? 0 : 45); i++) {
            const x = (i * 137 + this.elapsed * 48) % 1000 - 20, y = (i * 97 + this.elapsed * 155) % 570 - 15;
            this.weather.lineBetween(x, y, x - 5, y + 13);
        }
        if (this.hitTime)
            this.weather.fillStyle(0xb74333, this.hitTime).fillRect(0, 0, 960, 540);
        this.cross.clear();
        if (!app.overlay) {
            const rect = this.game.canvas.getBoundingClientRect(), pointer = this.inputFrame.pointer;
            const p = this.inputFrame.touch
                ? { x: this.player.x - cam.scrollX + Math.cos(this.player.rotation) * 85, y: this.player.y - cam.scrollY + Math.sin(this.player.rotation) * 85 }
                : { x: (pointer.x - rect.left) / rect.width * 960, y: (pointer.y - rect.top) / rect.height * 540 };
            this.cross.lineStyle(1, this.currentWeapon.ammo && this.mag === 0 ? 0xcc7860 : 0xd7e7b2, .9);
            this.cross.strokeCircle(p.x, p.y, this.inputFrame.precise ? 3 : 6);
            this.cross.lineBetween(p.x - 11, p.y, p.x - 6, p.y).lineBetween(p.x + 6, p.y, p.x + 11, p.y).lineBetween(p.x, p.y - 11, p.x, p.y - 6).lineBetween(p.x, p.y + 6, p.x, p.y + 11);
        }
        for (const e of this.enemies)
            if (e.hp > 0 && e.alert > 0 && distance(e.sprite, this.player) < 450) {
                this.fx.fillStyle(0x101b1b, .8).fillRect(e.sprite.x - 14, e.sprite.y - 23, 28, 3);
                this.fx.fillStyle(e.id === 'elite' ? 0xc77653 : 0xa3b67b, 1).fillRect(e.sprite.x - 14, e.sprite.y - 23, 28 * e.hp / D.ENEMIES[e.id].hp, 3);
            }
    }
    updateHud() {
        for (const sprite of this.containerSprites) {
            const container = this.containers.find(c => c.id === sprite.getData('containerId'));
            if (container) sprite.setTexture(container.inventory.items.length ? 'loot-crate' : 'loot-crate-empty');
        }

        refreshQuickPanel();
        const limits = this.layered ? derivedLimits(this.layered) : { hp: B.maxHealth, stamina: B.maxStamina };
        for (const child of this.children.list) if (child instanceof Phaser.GameObjects.Text && child.getData('exit')) {
            const label = `${child.getData('exit')}\n${playerInput.touch ? '停稳，按住撤离 3 秒' : '按住 E 3 秒 · 撤离'}`;
            if (child.text !== label) child.setText(label);
        }
        const labels = document.getElementById('world-labels');
        if (labels && playerInput.touch) {
            const rect = this.game.canvas.getBoundingClientRect(), parent = labels.getBoundingClientRect(), scale = rect.width / 960;
            labels.innerHTML = this.visibleExits.map(e => {
                const x = (e.x - this.cameras.main.scrollX) * scale + rect.left - parent.left;
                const y = (e.y - this.cameras.main.scrollY - 45) * scale + rect.top - parent.top;
                return x > 70 && x < parent.width - 70 && y > 28 && y < parent.height ? `<span style="left:${x}px;top:${y}px">${e.name} · 撤离</span>` : '';
            }).join('');
        }
        const t = Math.max(0, Math.ceil(this.config.duration - this.elapsed));
        css('timer', `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`);
        css('hp', `${Math.max(0, Math.ceil(this.hp))} / ${limits.hp}`);
        css('stamina', Math.round(this.stamina).toString());
        css('status', [this.bleeding ? '流血' : '', this.pollution > 10 ? '污染 ' + Math.round(this.pollution) + '%' : '', this.layered ? `精神 ${Math.round(this.layered.body.mental)} · 水分 ${Math.round(this.layered.body.water)} · 饱食 ${Math.round(this.layered.body.satiety)}` : '', this.layered?.body.effects.pain ? '疼痛' : '', this.layered?.body.effects.energized ? '精力充沛' : '', this.layered?.body.effects.focus ? '专注' : '', this.layered?.body.effects.injectionFatigue ? '注射后疲劳' : ''].filter(Boolean).join(' · ') || '状态正常');
        css('weight', `${this.carriedWeight().toFixed(1)} kg`);
        const directions = document.getElementById('hit-directions');
        if (directions) directions.innerHTML = this.hitDirections.map(hit => `<i style="left:${50 + Math.cos(hit.angle) * 47}%;top:${50 + Math.sin(hit.angle) * 45}%;transform:translate(-50%,-50%) rotate(${hit.angle * 180 / Math.PI + 90}deg);opacity:${Math.min(1,hit.left * 2)}">▲</i>`).join('');
        const exit = this.visibleExits.find(e => e.name === app.selectedExit);
        if (exit) { const bearing = exitBearing(this.player, exit); css('exit-navigation', `${exit.name} · ${bearing.direction} · 直线 ${bearing.distance.toFixed(1)} 格`); }
        else css('exit-navigation', app.selectedExit && this.layered ? `${app.selectedExit} · 返回地面查看方位` : '选择撤离点');
        const progress = questProgress(app.save, app.loadout), questList = document.getElementById('raid-quest-list');
        css('raid-quest-count', `· ${progress.length} 项未完成`);
        if (questList) {
            const html = progress.map(q => `<section><strong>${q.name}</strong>${q.needs.map(n => `<p>${D.ITEMS[n.id].name}：仓库 ${n.stored} · 携带 ${n.carried} / 需 ${n.needed}</p>`).join('')}</section>`).join('') || '<p>全部任务已交付。</p>';
            if (questList.innerHTML !== html) questList.innerHTML = html;
        }
        css('loot-health', `${Math.max(0, Math.ceil(this.hp))} / ${limits.hp}`);
        css('loot-timer', `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`);
        css('loot-condition', [this.bleeding ? '流血：持续失去生命' : '', this.pollution > 0 ? `污染 ${Math.round(this.pollution)}%${this.pollution > B.pollutionDamageThreshold ? '：持续失去生命' : ''}` : ''].filter(Boolean).join(' · ') || '状态正常 · 世界仍在运行');
        css('loot-hit', this.hitNotice > 0 ? '正在遭受攻击！' : '');
        document.querySelector('.loot-header')?.classList.toggle('under-attack', this.hitNotice > 0);
        css('loot-weight', this.carriedWeight().toFixed(1));
        css('equipped-ammo', `${this.mag} / ${D.WEAPONS[app.loadout?.weapon || 'knife'].magazine}`);
        const hp = document.getElementById('hpbar'), st = document.getElementById('staminabar');
        if (hp) hp.style.width = Math.max(0,this.hp)/limits.hp*100 + '%';
        if (st) st.style.width = this.stamina/limits.stamina*100 + '%';
        const w = this.currentWeapon;
        css('gunname', w.name);
        const ammo = document.getElementById('ammo');
        if (ammo) ammo.innerHTML = w.ammo ? `${this.mag.toString().padStart(2, '0')} <small>/ ${D.count(app.loadout!.bag, w.ammo)}</small>` : '近战 <small>/ 始终保留</small>';
        css('reload', this.reloadLeft > 0 ? `换弹中　${this.reloadLeft.toFixed(1)} 秒` : playerInput.touch ? (w.ammo ? '外圈持续开火' : '外圈持续挥砍') : 'R 换弹　1 主武器　2 匕首');
        const reloadButton = document.querySelector<HTMLElement>('[data-command="reload"]');
        if (reloadButton) { reloadButton.textContent = this.reloadLeft > 0 ? `换弹 ${this.reloadLeft.toFixed(1)}s` : '换弹'; reloadButton.setAttribute('aria-label', this.reloadLeft > 0 ? `换弹中，剩余${this.reloadLeft.toFixed(1)}秒` : '换弹'); }
        for (const command of ['knife', 'primary']) document.querySelector(`[data-command="${command}"]`)?.setAttribute('aria-pressed', String(command === 'knife' ? !w.ammo : !!w.ammo));
        const healButton = document.querySelector<HTMLElement>('[data-command="heal"]');
        if (healButton) { const qty = D.count(app.loadout!.bag, 'bandage') + D.count(app.loadout!.bag, 'medkit'); healButton.textContent = `治疗 ${qty}`; healButton.setAttribute('aria-label', `快捷治疗，背包可用${qty}件`); }
        const zone = this.mapData.zones.find(z => this.player.x >= z.x && this.player.x < z.x + z.w && this.player.y >= z.y && this.player.y < z.y + z.h);
        const region = this.space?.definition.regions?.filter(z => this.player.x >= z.x && this.player.x < z.x + z.w && this.player.y >= z.y && this.player.y < z.y + z.h).sort((a,b) => a.w * a.h - b.w * b.h)[0];
        css('zone', this.space?.definition.id !== 'coast' && this.space ? `${this.space.definition.name} · ${this.space.definition.floor}${region ? ' / ' + region.name : ''}` : region?.name || zone?.name || '沿海封锁区');
        css('tide', `${this.highTide ? '高潮位 · 浅滩封闭' : '低潮位 · 捷径开放'}　/　${this.tideChanged ? '高架路可通行' : '出击 5 分钟后换潮'}`);
        const warning = document.getElementById('warning');
        if (warning) warning.innerHTML = this.warned && !this.tideChanged ? '<div class="banner">潮汐预警 · 请离开浅滩</div>' : this.bleeding ? `<div class="banner">持续流血 · ${playerInput.touch ? '点「治疗」止血' : 'Q 止血'}</div>` : '';
    }
}
