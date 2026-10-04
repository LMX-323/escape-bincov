import Phaser from 'phaser';
import { createTextures, drawWorld, drawBackdrop } from './art';
import { drawTitleBackdrop } from './title-art';
import { WORLD, WORLD_W, WORLD_H, TILE, isWalkable, lineOfSight, findPath, findDryRefuge, type RunConfig, type Point } from './world';
import * as D from './domain';
import { SURVIVAL as B } from './balance';
import { app, audio } from './app';
import { render, setOverlay, finish, toast, drawMap } from './ui';
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
    create() { drawBackdrop(this); this.add.rectangle(480, 270, 960, 540, 0x081211, .55); render(); }
}
export class ResultScene extends Phaser.Scene {
    constructor() { super('Result'); }
    create() { drawBackdrop(this); render(); }
}
type Enemy = {
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
    sprite: Phaser.GameObjects.Image;
    id: string;
    qty: number;
    relief?: boolean;
};
type Bullet = {
    sprite: Phaser.GameObjects.Image;
    vx: number;
    vy: number;
    left: number;
    damage: number;
    enemy: boolean;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const css = (id: string, text: string) => { const el = document.getElementById(id); if (el)
    el.textContent = text; };
export class RaidScene extends Phaser.Scene {
    config!: RunConfig;
    player!: Phaser.GameObjects.Image;
    enemies: Enemy[] = [];
    loot: Ground[] = [];
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
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private random = () => .5;
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
    private noteSeen = new Set<string>();
    private heldFire = false;
    private exhausted = false;
    constructor() { super('Raid'); }
    create() {
        this.config = this.registry.get('runConfig');
        app.raid = this;
        this.enemies = [];
        this.loot = [];
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
        this.hitTime = 0;
        this.noteSeen = new Set();
        this.shotNoise = null;
        this.noiseTime = 0;
        this.heldFire = false;
        this.random = D.seededRandom(this.config.seed + 771);
        this.highTide = this.config.initialHigh;
        drawWorld(this, WORLD).setDepth(0);
        this.flood = this.add.graphics().setDepth(2);
        this.drawFlood();
        WORLD.notes.forEach(n => { this.add.rectangle(n.x, n.y, 12, 15, 0xd5bc80).setStrokeStyle(2, 0x615937).setDepth(3); this.add.text(n.x, n.y - 24, '▤', { fontSize: '13px', color: '#d8c58a' }).setOrigin(.5).setDepth(3); });
        this.config.exits.forEach(e => { const g = this.add.graphics().setDepth(3); g.lineStyle(2, 0xb4ce7d, .75).strokeCircle(e.x, e.y, 48); g.lineStyle(1, 0xb4ce7d, .4).strokeCircle(e.x, e.y, 54); g.fillStyle(0xb4ce7d, .08).fillCircle(e.x, e.y, 48); this.add.text(e.x, e.y - 70, `${e.name}\n按住 E 3 秒 · 撤离`, { fontFamily: 'Microsoft YaHei', fontSize: '12px', color: '#dae5aa', align: 'center', backgroundColor: '#19281ee6', padding: { x: 8, y: 4 } }).setOrigin(.5).setDepth(3); });
        for (const l of this.config.loot)
            this.spawnLoot(l.x, l.y, l.id, l.qty);
        for (const e of this.config.enemies) {
            const def = D.ENEMIES[e.id];
            this.enemies.push({ sprite: this.add.image(e.x, e.y, e.id).setDepth(6), id: e.id, hp: def.hp, home: { x: e.x, y: e.y }, target: { x: e.x, y: e.y }, state: 'patrol', timer: this.random() * 3, cooldown: 1 + this.random(), path: [], repath: 0, alert: 0 });
        }
        this.player = this.add.image(this.config.spawn.x, this.config.spawn.y, 'player').setDepth(8);
        this.fx = this.add.graphics().setDepth(9);
        this.weather = this.add.graphics().setDepth(20).setScrollFactor(0);
        this.cross = this.add.graphics().setDepth(30).setScrollFactor(0);
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
        this.cameras.main.startFollow(this.player, true, .14, .14);
        this.cameras.main.setRoundPixels(true);
        this.keys = this.input.keyboard!.addKeys('W,A,S,D,SHIFT,R,E,Q,ONE,TWO') as Record<string, Phaser.Input.Keyboard.Key>;
        this.input.mouse!.disableContextMenu();
        this.mag = app.loadout!.ammo;
        this.magRelief = app.loadout!.ammoRelief;
        this.exhausted = false;
        if (app.loadout!.weapon)
            this.loadMagazine();
        this.player.setTexture(this.textures.exists('player-' + this.currentWeapon.id) ? 'player-' + this.currentWeapon.id : 'player');
        audio.start();
        render();
    }
    lock() { this.locked = true; }
    get paused() { return this.locked || ['pause', 'help', 'abandon'].includes(app.overlay); }
    get currentWeapon() { return D.WEAPONS[!this.knife && app.loadout?.weapon ? app.loadout.weapon : 'knife']; }
    drawFlood() { this.flood.clear(); for (let y = 0; y < WORLD.tiles.length; y++)
        for (let x = 0; x < WORLD.tiles[y].length; x++)
            if (WORLD.tiles[y][x] === 4) {
                this.flood.fillStyle(this.highTide ? 0x345958 : 0x665446, this.highTide ? .87 : .2).fillRect(x * TILE, y * TILE, TILE, TILE);
                if (this.highTide) {
                    this.flood.lineStyle(1, 0xa96a54, .45).lineBetween(x * TILE + 4, y * TILE + 12, x * TILE + 25, y * TILE + 12);
                }
            } }
    spawnLoot(x: number, y: number, id: string, qty: number, relief = false) { this.loot.push({ sprite: this.add.image(x, y, 'loot').setDepth(4).setTint(D.ITEMS[id]?.color || 0xc7b889), id, qty, relief }); }
    drop(item: D.Item) { this.spawnLoot(this.player.x, this.player.y, item.id, item.qty, !!item.relief); }
    syncMagazine() { if (app.loadout) {
        app.loadout.ammo = this.mag;
        app.loadout.ammoRelief = this.magRelief;
    } }
    loadMagazine() { const loaded = D.reloadMagazine(app.loadout!.weapon || 'knife', this.mag, this.magRelief, app.loadout!.bag); this.mag = loaded.ammo; this.magRelief = loaded.ammoRelief; this.syncMagazine(); }
    equipItem(uid: string) { this.syncMagazine(); if (!D.equipRun(app.loadout!, uid)) {
        toast('无法装备，背包装不下换下的武器和弹药。请先腾出空间。');
        return;
    } this.mag = app.loadout!.ammo; this.magRelief = app.loadout!.ammoRelief; this.knife = false; this.reloadLeft = 0; this.startReload(); this.player.setTexture('player-' + this.currentWeapon.id); toast('已装备' + this.currentWeapon.name); }
    carriedWeight() { const l = app.loadout!, w = D.WEAPONS[l.weapon || 'knife']; return D.weight(l.bag) + D.weight(l.safe) + (l.weapon ? D.ITEMS[l.weapon].weight : 0) + D.ITEMS.knife.weight + (w.ammo ? D.ITEMS[w.ammo].weight * this.mag : 0); }
    say(message: string, seconds = 7) { css('radio', message); const el = document.getElementById('radio'); if (el)
        el.style.display = 'block'; this.radioTime = seconds; audio.radio(); }
    useItem(id: string, inv: D.Inventory = app.loadout!.bag) {
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
        D.removeItem(inv, id, 1);
        audio.pickup();
        toast(`已使用${D.ITEMS[id].name}`);
        return true;
    }
    heal() { const bag = app.loadout!.bag; const id = this.bleeding && D.count(bag, 'bandage') ? 'bandage' : D.count(bag, 'medkit') ? 'medkit' : D.count(bag, 'bandage') ? 'bandage' : null; if (id)
        this.useItem(id);
    else
        toast('背包中没有绷带或急救包。'); }
    move(sprite: Phaser.GameObjects.Image, dx: number, dy: number, canEscapeFlood = false) { const escaping = canEscapeFlood && !isWalkable(sprite.x, sprite.y, true, 10) && isWalkable(sprite.x, sprite.y, false, 10); const high = this.highTide && !escaping; if (isWalkable(sprite.x + dx, sprite.y, high, 10))
        sprite.x += dx; if (isWalkable(sprite.x, sprite.y + dy, high, 10))
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
            const hit = this.enemies.find(e => e.hp > 0 && distance(e.sprite, this.player) < w.range && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.sprite.y - this.player.y, e.sprite.x - this.player.x) - this.player.rotation)) < 1.15 && lineOfSight(this.player, e.sprite));
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
        const aim = this.input.activePointer.rightButtonDown() ? .35 : 1;
        for (let i = 0; i < w.pellets; i++) {
            const angle = this.player.rotation + (this.random() - .5) * w.spread * aim;
            this.bullets.push({ sprite: this.add.image(this.player.x + Math.cos(angle) * 17, this.player.y + Math.sin(angle) * 17, 'bullet').setRotation(angle).setDepth(10), vx: Math.cos(angle) * 760, vy: Math.sin(angle) * 760, left: w.range, damage: w.damage, enemy: false });
        }
        this.fx.fillStyle(0xffe5a0, 1).fillCircle(this.player.x + Math.cos(this.player.rotation) * 23, this.player.y + Math.sin(this.player.rotation) * 23, 4);
        this.cameras.main.shake(40, .0008);
    }
    damageEnemy(e: Enemy, damage: number) { e.hp = D.applyDamage(e.hp, damage); e.sprite.setTintFill(0xe9ccb5); this.time.delayedCall(70, () => { if (e.sprite.active)
        e.sprite.clearTint(); }); e.state = 'chase'; e.alert = 6; e.target = { x: this.player.x, y: this.player.y }; audio.hit(); if (e.hp <= 0) {
        this.kills++;
        e.sprite.setTint(0x403d34).setRotation(e.sprite.rotation + Math.PI / 2).setAlpha(.6).setDepth(3);
        const drops = D.rollLoot(this.config.seed + this.kills * 47, e.id === 'elite' ? 3 : 1);
        for (const l of drops)
            this.spawnLoot(e.sprite.x + (this.random() - .5) * 18, e.sprite.y + (this.random() - .5) * 18, l.id, l.qty);
    } }
    hurt(amount: number) { if (this.extracted)
        return; this.hp = D.applyDamage(this.hp, amount); this.hitTime = .25; this.extractTime = 0; if (this.random() < B.bleedChance)
        this.bleeding = 1; audio.hit(); this.cameras.main.shake(100, .002); if (this.hp <= 0)
        finish('death'); }
    update(_time: number, delta: number) {
        if (app.state !== 'run' || !this.player || this.extracted || this.paused)
            return;
        const dt = Math.min(delta / 1000, .08);
        this.elapsed += dt;
        this.fireCooldown = Math.max(0, this.fireCooldown - dt);
        this.noiseTime = Math.max(0, this.noiseTime - dt);
        this.hitTime = Math.max(0, this.hitTime - dt);
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
        if (!this.tideChanged && this.elapsed >= this.config.tideAt) {
            this.tideChanged = true;
            this.highTide = !this.highTide;
            this.drawFlood();
            for (const e of this.enemies) {
                e.path = [];
                e.repath = 0;
                if (this.highTide && !isWalkable(e.sprite.x, e.sprite.y, true, 10)) {
                    const refuge = findDryRefuge(e.sprite);
                    if (refuge) {
                        e.target = refuge;
                        e.state = 'return';
                        e.path = findPath(e.sprite, refuge, false);
                    }
                }
            }
            this.say(this.highTide ? '涨潮了，浅滩无法通行。高架路和海堤仍可通行。' : '退潮了，浅滩可以通行。涉水仍会积累污染。', 10);
        }
        const input = !app.overlay;
        let dx = 0, dy = 0;
        if (input) {
            dx = Number(this.keys.D.isDown) - Number(this.keys.A.isDown);
            dy = Number(this.keys.S.isDown) - Number(this.keys.W.isDown);
            if (Phaser.Input.Keyboard.JustDown(this.keys.R))
                this.startReload();
            if (Phaser.Input.Keyboard.JustDown(this.keys.Q))
                this.heal();
            if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) {
                this.knife = false;
                this.reloadLeft = 0;
            }
            if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) {
                this.knife = true;
                this.reloadLeft = 0;
            }
        }
        this.player.setTexture('player-' + this.currentWeapon.id);
        if (this.stamina <= B.exhaustedAt)
            this.exhausted = true;
        if (this.stamina >= B.sprintRecoveryAt)
            this.exhausted = false;
        const moving = !!(dx || dy), over = Math.max(0, this.carriedWeight() - B.carryLimit), sprint = input && this.keys.SHIFT.isDown && moving && !this.exhausted;
        const speed = (sprint ? B.sprintSpeed : B.walkSpeed) * (this.input.activePointer.rightButtonDown() && !sprint ? B.aimSpeedFactor : 1) / Math.max(1, 1 + over * B.overloadSlowdownPerKg);
        if (moving) {
            const len = Math.hypot(dx, dy);
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
        this.stamina = Phaser.Math.Clamp(this.stamina + (sprint ? -(B.sprintDrain + over) : B.staminaRecovery) * dt, 0, B.maxStamina);
        const pointer = this.input.activePointer, world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        if (input)
            this.player.rotation = Math.atan2(world.y - this.player.y, world.x - this.player.x);
        const down = input && pointer.leftButtonDown();
        if (down && !this.heldFire)
            this.shoot();
        this.heldFire = down;
        if (this.reloadLeft > 0) {
            this.reloadLeft = Math.max(0, this.reloadLeft - dt);
            if (this.reloadLeft === 0) {
                this.loadMagazine();
                audio.click();
            }
        }
        const flooded = WORLD.tiles[Math.floor(this.player.y / TILE)]?.[Math.floor(this.player.x / TILE)] === 4;
        this.pollution = Phaser.Math.Clamp(this.pollution + (flooded ? (this.highTide ? B.pollutionHighTide : B.pollutionLowTide) : -B.pollutionRecovery) * dt, 0, 100);
        this.hp -= dt * (this.bleeding * B.bleedDamage + (this.pollution > B.pollutionDamageThreshold ? (this.pollution - B.pollutionDamageBase) * B.pollutionDamageFactor : 0));
        if (this.hp <= 0) {
            finish('death');
            return;
        }
        for (const e of this.enemies)
            if (e.hp > 0) {
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
        const def = D.ENEMIES[e.id], dist = distance(e.sprite, this.player), sees = dist < def.vision && lineOfSight(e.sprite, this.player);
        e.timer -= dt;
        e.cooldown -= dt;
        e.repath -= dt;
        e.alert = Math.max(0, e.alert - dt);
        const escaping = this.highTide && !isWalkable(e.sprite.x, e.sprite.y, true, 10);
        if (escaping) {
            const refuge = findDryRefuge(e.sprite);
            if (refuge) {
                if (!e.path.length || e.repath <= 0) {
                    e.path = findPath(e.sprite, refuge, false);
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
            if (isWalkable(p.x, p.y, this.highTide))
                e.target = p;
            e.timer = 3 + this.random() * 4;
        }
        if (e.state === 'attack' && sees) {
            e.sprite.rotation = Math.atan2(this.player.y - e.sprite.y, this.player.x - e.sprite.x);
            if (e.cooldown <= 0) {
                e.cooldown = def.cooldown;
                const angle = e.sprite.rotation + (this.random() - .5) * .16;
                if (e.id === 'salt' || e.id === 'elite') {
                    this.bullets.push({ sprite: this.add.image(e.sprite.x + Math.cos(angle) * 18, e.sprite.y + Math.sin(angle) * 18, 'bullet').setTint(0xe48c64).setRotation(angle).setDepth(10), vx: Math.cos(angle) * 365, vy: Math.sin(angle) * 365, left: def.range + 70, damage: def.damage, enemy: true });
                    audio.shot('enemy');
                }
                else
                    this.hurt(def.damage);
            }
            return;
        }
        if (distance(e.sprite, e.target) > 12) {
            if (e.repath <= 0) {
                e.path = findPath(e.sprite, e.target, this.highTide);
                e.repath = .9 + this.random() * .6;
            }
            let target = e.target;
            if (!lineOfSight(e.sprite, target, this.highTide, 10) || !isWalkable(target.x, target.y, this.highTide)) {
                while (e.path.length && distance(e.sprite, e.path[0]) < 14)
                    e.path.shift();
                if (e.path.length)
                    target = e.path[0];
                else
                    return;
            }
            const angle = Math.atan2(target.y - e.sprite.y, target.x - e.sprite.x);
            e.sprite.rotation = angle;
            this.move(e.sprite, Math.cos(angle) * def.speed * dt, Math.sin(angle) * def.speed * dt, true);
        }
    }
    updateBullets(dt: number) { for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i], speed = Math.hypot(b.vx, b.vy), steps = Math.ceil(speed * dt / 7);
        let remove = false;
        for (let j = 0; j < steps; j++) {
            b.sprite.x += b.vx * dt / steps;
            b.sprite.y += b.vy * dt / steps;
            b.left -= speed * dt / steps;
            const t = WORLD.tiles[Math.floor(b.sprite.y / TILE)]?.[Math.floor(b.sprite.x / TILE)];
            if (t === 3 || t === undefined || b.left <= 0) {
                remove = true;
                break;
            }
            if (b.enemy) {
                if (distance(b.sprite, this.player) < 12) {
                    this.hurt(b.damage);
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
        const el = document.getElementById('interaction');
        if (!el)
            return;
        let text = '';
        const exit = this.config.exits.find(e => distance(e, this.player) < 48);
        const loot = this.loot.filter(l => distance(l.sprite, this.player) < 43 && lineOfSight(l.sprite, this.player)).sort((a, b) => distance(a.sprite, this.player) - distance(b.sprite, this.player))[0];
        const note = WORLD.notes.find(n => distance(n, this.player) < 43);
        if (exit) {
            text = `${exit.name}　·　站稳并按住 E 3 秒撤离`;
            if (input && this.keys.E.isDown && !moving && !this.hitTime) {
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
            if (loot) {
                text = `E 拾取　${D.ITEMS[loot.id].name} × ${loot.qty}`;
                if (input && Phaser.Input.Keyboard.JustDown(this.keys.E)) {
                    const left = D.addItem(app.loadout!.bag, loot.id, loot.qty, !!loot.relief);
                    if (left === loot.qty)
                        toast('背包空间不足，按 Tab 整理。');
                    else {
                        audio.pickup();
                        toast(`已拾取 ${D.ITEMS[loot.id].name} × ${loot.qty - left}`);
                        loot.qty = left;
                        if (!left) {
                            loot.sprite.destroy();
                            this.loot.splice(this.loot.indexOf(loot), 1);
                        }
                    }
                }
            }
            else if (note) {
                text = `E 阅读　${note.title}`;
                if (input && Phaser.Input.Keyboard.JustDown(this.keys.E)) {
                    this.say(`${note.title}：${note.text}`, 14);
                    this.noteSeen.add(note.title);
                }
            }
        }
        el.textContent = text;
        el.style.display = text && !app.overlay ? 'block' : 'none';
    }
    drawEffects(dt: number) {
        this.weather.clear();
        const cam = this.cameras.main;
        this.weather.fillStyle(0x0c242a, .12).fillRect(0, 0, 960, 540);
        this.weather.lineStyle(1, 0x9bbdb5, .1);
        for (let i = 0; i < 45; i++) {
            const x = (i * 137 + this.elapsed * 48) % 1000 - 20, y = (i * 97 + this.elapsed * 155) % 570 - 15;
            this.weather.lineBetween(x, y, x - 5, y + 13);
        }
        if (this.hitTime)
            this.weather.fillStyle(0xb74333, this.hitTime).fillRect(0, 0, 960, 540);
        this.cross.clear();
        if (!app.overlay) {
            const p = this.input.activePointer;
            this.cross.lineStyle(1, this.currentWeapon.ammo && this.mag === 0 ? 0xcc7860 : 0xd7e7b2, .9);
            this.cross.strokeCircle(p.x, p.y, p.rightButtonDown() ? 3 : 6);
            this.cross.lineBetween(p.x - 11, p.y, p.x - 6, p.y).lineBetween(p.x + 6, p.y, p.x + 11, p.y).lineBetween(p.x, p.y - 11, p.x, p.y - 6).lineBetween(p.x, p.y + 6, p.x, p.y + 11);
        }
        for (const e of this.enemies)
            if (e.hp > 0 && e.alert > 0 && distance(e.sprite, this.player) < 450) {
                this.fx.fillStyle(0x101b1b, .8).fillRect(e.sprite.x - 14, e.sprite.y - 23, 28, 3);
                this.fx.fillStyle(e.id === 'elite' ? 0xc77653 : 0xa3b67b, 1).fillRect(e.sprite.x - 14, e.sprite.y - 23, 28 * e.hp / D.ENEMIES[e.id].hp, 3);
            }
    }
    updateHud() {
        const t = Math.max(0, Math.ceil(this.config.duration - this.elapsed));
        css('timer', `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`);
        css('hp', `${Math.max(0, Math.ceil(this.hp))} / ${B.maxHealth}`);
        css('stamina', Math.round(this.stamina).toString());
        css('status', [this.bleeding ? '流血' : '', this.pollution > 10 ? '污染 ' + Math.round(this.pollution) + '%' : ''].filter(Boolean).join(' · ') || '状态正常');
        css('weight', `${this.carriedWeight().toFixed(1)} kg`);
        const hp = document.getElementById('hpbar'), st = document.getElementById('staminabar');
        if (hp) hp.style.width = Math.max(0,this.hp)/B.maxHealth*100 + '%';
        if (st) st.style.width = this.stamina/B.maxStamina*100 + '%';
        const w = this.currentWeapon;
        css('gunname', w.name);
        const ammo = document.getElementById('ammo');
        if (ammo) ammo.innerHTML = w.ammo ? `${this.mag.toString().padStart(2, '0')} <small>/ ${D.count(app.loadout!.bag, w.ammo)}</small>` : '近战 <small>/ 始终保留</small>';
        css('reload', this.reloadLeft > 0 ? `换弹中　${this.reloadLeft.toFixed(1)} 秒` : 'R 换弹　1 主武器　2 匕首');
        const zone = WORLD.zones.find(z => this.player.x >= z.x && this.player.x < z.x + z.w && this.player.y >= z.y && this.player.y < z.y + z.h);
        css('zone', zone?.name || '沿海封锁区');
        css('tide', `${this.highTide ? '高潮位 · 浅滩封闭' : '低潮位 · 捷径开放'}　/　${this.tideChanged ? '高架路可通行' : '出击 5 分钟后换潮'}`);
        const warning = document.getElementById('warning');
        if (warning) warning.innerHTML = this.warned && !this.tideChanged ? '<div class="banner">潮汐预警 · 请离开浅滩</div>' : this.bleeding ? '<div class="banner">持续流血 · Q 止血</div>' : '';
    }
}
