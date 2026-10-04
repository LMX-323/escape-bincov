import Phaser from 'phaser';
import type { MapData } from './world';

// All artwork is drawn here from original pixel primitives; no external assets.
const P = {
  ink: '#111b1d', deep: '#162327', sea: '#24383c', wave: '#395054',
  salt: '#82958e', pale: '#b3bfb0', concrete: '#46524e', concrete2: '#414d49',
  orange: '#c78247', rust: '#89513d', rustDark: '#583d34', green: '#788b59',
  algae: '#344b3f', red: '#bd5c4d', yellow: '#c8b67b', road: '#333e3d',
};
type Ctx = CanvasRenderingContext2D;
const noise = (x: number, y: number, salt = 0): number => {
  let n = Math.imul(x + salt * 93, 374761393) ^ Math.imul(y + 17, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};
const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number): void => {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
const line = (c: Ctx, color: string, x: number, y: number, x2: number, y2: number, width = 1): void => {
  c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5); c.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5); c.stroke();
};
function makeCanvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function human(c: Ctx, coat: string, trim: string, elite = false, weapon = 'pistol'): void {
  rect(c, '#10181ab3', 4, 8, 23, 18);
  rect(c, '#151e20', 7, 5, 14, 20);
  rect(c, '#202c2b', 9, 4, 6, 5); rect(c, '#202c2b', 9, 22, 6, 5);
  rect(c, '#36403a', 10, 6, 8, 5); rect(c, '#36403a', 10, 21, 8, 4);
  rect(c, coat, 8, 9, 13, 14);
  rect(c, trim, 8, 8, 4, 6); rect(c, trim, 8, 18, 4, 5);
  rect(c, '#212f2a', 5, 11, 5, 10); rect(c, '#506049', 5, 12, 3, 7);
  rect(c, '#152121', 12, 10, 8, 12); rect(c, trim, 12, 10, 7, 9);
  rect(c, coat, 13, 9, 7, 8); rect(c, '#b2aa86', 19, 13, 3, 6);
  rect(c, '#35463b', 14, 9, 7, 3); rect(c, '#182326', 19, 11, 3, 3);
  rect(c, '#9aab94', 15, 9, 4, 1);
  rect(c, trim, 15, 20, 8, 4); rect(c, '#ad9b76', 22, 19, 3, 3);
  if (weapon === 'knife') {
    rect(c, '#644b33', 22, 17, 3, 3); rect(c, '#283b32', 24, 15, 2, 6);
    rect(c, '#b5c7b4', 26, 17, 6, 2); rect(c, '#e5dfb6', 26, 17, 6, 1);
  } else {
    rect(c, '#0b1419', 21, 16, 10, 4); rect(c, '#8e9890', 23, 16, 8, 1);
    rect(c, '#424e49', 22, 19, 4, 3);
    if (weapon === 'shotgun') { rect(c, '#aa7648', 20, 17, 5, 4); rect(c, '#9baca0', 25, 19, 7, 1); }
    if (weapon === 'carbine') { rect(c, '#a7824f', 20, 18, 6, 3); rect(c, '#b6c2ad', 29, 16, 3, 1); rect(c, '#1b2a25', 26, 20, 3, 3); }
  }
  if (elite) {
    rect(c, '#b77744', 10, 7, 4, 2); rect(c, '#c19963', 10, 22, 4, 2);
    rect(c, '#b35747', 17, 10, 3, 2); rect(c, '#39434a', 21, 15, 11, 6);
    rect(c, '#a6aea0', 25, 15, 7, 1);
  }
}

const iconIds = ['knife', 'pistol', 'shotgun', 'carbine', 'ammo9', 'shell', 'ammoR', 'bandage', 'medkit', 'antidote', 'water', 'food', 'scrap', 'wire', 'fuse', 'battery', 'watch', 'pearl', 'sample', 'ledger'];
function itemIcon(c: Ctx, id: string): void {
  const r = (color: string, x: number, y: number, w: number, h: number) => rect(c, color, x, y, w, h);
  if (id === 'knife') {
    r('#131d20', 4, 17, 24, 5); r('#866248', 4, 17, 8, 4); r('#40514e', 11, 14, 2, 10);
    r('#aebbad', 13, 17, 11, 4); r('#d7dfc4', 13, 17, 15, 1); r('#72857e', 24, 18, 3, 2);
  } else if (['pistol', 'shotgun', 'carbine'].includes(id)) {
    const rifle = id !== 'pistol';
    r('#10191c', 3, 13, 26, 7); r('#9aa89d', rifle ? 11 : 10, 13, rifle ? 18 : 16, 2);
    r('#485a59', 10, 15, 18, 3); r('#975f3e', 5, 18, 7, 8);
    r('#182423', 11, 19, 5, 5); r('#ad8051', 6, 19, 3, 5);
    if (rifle) { r('#ad784b', 1, 16, 8, 5); r('#976242', 15, 17, 8, 3); r('#788880', 27, 14, 4, 3); }
    if (id === 'carbine') { r('#55655c', 15, 19, 4, 7); r('#263538', 16, 11, 7, 2); }
  } else if (['ammo9', 'shell', 'ammoR'].includes(id)) {
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 7;
      r('#18221f', x - 1, 7, 6, 20); r(id === 'shell' ? '#a75443' : '#b19b5d', x, 10, 4, 15);
      r('#e0ca80', x, 23, 5, 3); r('#e3c27c', x + 1, 7, 2, 4);
      r(id === 'shell' ? '#d68557' : '#dbc08b', x, 11, 1, 11);
    }
  } else if (id === 'medkit' || id === 'bandage') {
    r('#18241f', 4, 6, 24, 23); r(id === 'medkit' ? '#738477' : '#bfc1a2', 5, 8, 22, 19);
    r('#d7d5ba', 6, 8, 20, 3); r('#7d8b7c', 6, 24, 20, 3);
    r('#b05242', 13, 12, 6, 11); r('#b05242', 10, 15, 12, 5);
    if (id === 'medkit') { r('#a7b2a0', 11, 5, 10, 3); r('#384840', 13, 6, 6, 2); }
    else { r('#808f80', 6, 13, 3, 9); r('#ede6c9', 23, 12, 3, 12); }
  } else if (['antidote', 'water', 'sample'].includes(id)) {
    r('#1b292b', 9, 5, 14, 24); r('#657f7b', 10, 10, 12, 17);
    r(id === 'sample' ? '#ab5c53' : id === 'antidote' ? '#8ea46a' : '#719d9c', 11, 17, 10, 9);
    r('#aebdad', 12, 5, 8, 5); r('#d4dbbf', 12, 12, 2, 10); r('#3d5552', 19, 11, 2, 13);
    r('#ccc8a4', 13, 19, 6, 3); if (id === 'sample') r('#724336', 15, 19, 2, 4);
  } else if (id === 'food') {
    r('#18241f', 6, 7, 21, 22); r('#a68a5a', 7, 9, 19, 18); r('#c4bf9f', 7, 8, 19, 3);
    r('#b56245', 8, 15, 17, 8); r('#ddd2a7', 12, 17, 9, 3); r('#799184', 8, 25, 17, 2);
  } else if (id === 'scrap') {
    r('#273531', 4, 15, 20, 11); r('#85624d', 6, 12, 13, 11); r('#b4976b', 9, 11, 3, 13);
    r('#596b64', 15, 7, 11, 17); r('#a3a88a', 17, 8, 3, 14); r('#253832', 21, 11, 3, 4);
  } else if (id === 'wire') {
    r('#263731', 5, 5, 22, 22); r('#b88246', 7, 7, 18, 18); r('#deb271', 8, 7, 16, 2);
    r('#30403b', 12, 12, 8, 8); r('#6f513a', 7, 13, 4, 2); r('#6f513a', 21, 15, 4, 2);
    r('#b88246', 24, 21, 5, 3); r('#d1ccab', 28, 20, 2, 5);
  } else if (id === 'fuse') {
    r('#3d514b', 5, 12, 22, 9); r('#bed1b4', 10, 13, 12, 7);
    r('#8fa48c', 5, 11, 5, 11); r('#8fa48c', 23, 11, 5, 11); r('#556951', 14, 15, 6, 3);
  } else if (id === 'battery') {
    r('#192523', 7, 8, 20, 21); r('#9e9966', 8, 10, 18, 16); r('#3d5950', 8, 16, 18, 10);
    r('#b7c4a9', 10, 6, 4, 4); r('#ad7655', 20, 6, 4, 4); r('#d2bb68', 13, 18, 7, 2); r('#d2bb68', 16, 15, 2, 8);
  } else if (id === 'watch') {
    r('#70543c', 13, 2, 7, 27); r('#c1a66a', 9, 9, 16, 16); r('#2b3f3b', 11, 11, 12, 12);
    r('#cbd4b3', 16, 13, 2, 6); r('#cbd4b3', 16, 17, 5, 2); r('#e0c888', 10, 9, 13, 2);
  } else if (id === 'pearl') {
    r('#213631', 4, 22, 24, 5); r('#748976', 5, 20, 22, 4); r('#3d6355', 7, 18, 19, 5);
    r('#b9c6ae', 12, 10, 11, 12); r('#dce0c1', 14, 8, 7, 15); r('#f4ebcf', 14, 10, 4, 4);
  } else if (id === 'ledger') {
    r('#192720', 6, 5, 22, 25); r('#846e4b', 7, 5, 20, 24); r('#c7bb92', 9, 6, 16, 22);
    r('#8d4b3d', 8, 6, 3, 22); r('#546b5c', 14, 10, 8, 3); r('#7b8a70', 14, 16, 8, 1); r('#7b8a70', 14, 20, 6, 1);
  }
}

export function createTextures(scene: Phaser.Scene): void {
  makeCanvas(scene, 'player', 32, 32, c => human(c, '#5d7050', '#92a67c'));
  for (const weapon of ['knife', 'pistol', 'shotgun', 'carbine']) makeCanvas(scene, `player-${weapon}`, 32, 32, c => human(c, '#5d7050', '#92a67c', false, weapon));
  makeCanvas(scene, 'scav', 32, 32, c => human(c, '#8d674a', '#b09167', false, 'knife'));
  makeCanvas(scene, 'salt', 32, 32, c => human(c, '#5a7477', '#89a1a0'));
  makeCanvas(scene, 'elite', 32, 32, c => human(c, '#765747', '#af7c54', true));
  makeCanvas(scene, 'creature', 32, 32, c => {
    rect(c, '#1528249a', 3, 8, 25, 20);
    rect(c, '#4c6048', 5, 9, 18, 14); rect(c, '#8b9c68', 8, 8, 11, 14);
    rect(c, '#b1b783', 11, 7, 4, 13); rect(c, '#344e41', 7, 12, 5, 4);
    rect(c, '#819760', 20, 12, 8, 8); rect(c, '#d98065', 25, 12, 3, 2);
    rect(c, '#d9b38a', 27, 17, 4, 2); rect(c, '#607f55', 3, 5, 5, 8);
    rect(c, '#607f55', 4, 21, 6, 7); rect(c, '#bac48b', 1, 4, 6, 2);
    rect(c, '#bac48b', 2, 27, 7, 2); rect(c, '#58724e', 19, 6, 6, 6);
  });
  makeCanvas(scene, 'loot', 20, 20, c => {
    rect(c, '#141e1c', 2, 5, 16, 14); rect(c, '#826443', 3, 5, 14, 12);
    rect(c, '#bea071', 3, 5, 14, 3); rect(c, '#b09260', 5, 4, 2, 13);
    rect(c, '#b09260', 13, 4, 2, 13); rect(c, '#e5d19a', 9, 8, 3, 3);
  });
  makeCanvas(scene, 'bullet', 10, 4, c => { rect(c, '#d39b5c', 0, 1, 10, 2); rect(c, '#fff2bd', 5, 1, 5, 2); });
  iconIds.forEach(id => makeCanvas(scene, `item-${id}`, 32, 32, c => itemIcon(c, id)));
}

function crate(c: Ctx, x: number, y: number, color = '#816143'): void {
  rect(c, '#1c2925', x + 3, y + 3, 21, 20); rect(c, color, x, y, 20, 18);
  rect(c, '#bd9561', x, y, 20, 2); rect(c, '#4a4233', x + 2, y + 4, 16, 2);
  rect(c, '#4a4233', x + 2, y + 12, 16, 2); rect(c, '#a48456', x + 3, y, 3, 18);
  rect(c, '#a48456', x + 14, y, 3, 18);
}

function groundTile(c: Ctx, value: number, x: number, y: number, tx: number, ty: number): void {
  const base = value === 1 ? P.road : value === 2 ? P.sea : value === 3 ? '#525b52' : value === 4 ? '#44564b' : value === 5 ? '#5c5c4c' : value === 6 ? '#675d46' : (noise(tx, ty) > 0.5 ? P.concrete : P.concrete2);
  rect(c, base, x, y, 32, 32);
  if (value === 2) {
    for (let i = 0; i < 3; i++) rect(c, noise(tx, ty, i) > 0.5 ? '#3a5151' : '#293f41', x + noise(tx, ty, i + 3) * 24, y + i * 10 + 2, 6 + noise(tx, ty, i + 8) * 12, 1);
    if (noise(tx, ty, 20) > 0.92) rect(c, '#775451', x + 3, y + 11, 20, 2);
    return;
  }
  if (value === 3) {
    rect(c, '#252f2c', x, y + 28, 32, 4); rect(c, '#879084', x, y, 32, 2);
    rect(c, '#666e60', x + 1, y + 2, 2, 25); rect(c, '#444e45', x + 28, y + 2, 4, 26);
    for (let i = 0; i < 3; i++) rect(c, '#404940', x + 4, y + 8 + i * 7, 24, 1);
  } else if (value === 5) {
    rect(c, '#484d42', x + 31, y, 1, 32); rect(c, '#484d42', x, y + 31, 32, 1);
    rect(c, '#6e6d57', x, y, 31, 1);
  } else if (value === 6) {
    for (let i = 0; i < 4; i++) {
      rect(c, '#3d4438', x, y + i * 8, 32, 1);
      rect(c, '#897753', x, y + i * 8 + 1, 32, 1);
      rect(c, '#383d32', x + 4, y + i * 8 + 3, 1, 2); rect(c, '#383d32', x + 28, y + i * 8 + 3, 1, 2);
    }
  } else if (value === 0 || value === 4) {
    rect(c, '#39483f', x + 31, y, 1, 32); rect(c, '#39483f', x, y + 31, 32, 1);
    if (noise(tx, ty, 31) > 0.86) { rect(c, '#2e4139', x + 2, y + 4, 15, 2); rect(c, '#38483e', x + 9, y + 5, 2, 9); }
    if (value === 4) { rect(c, '#355348', x + 3, y + 8, 24, 9); rect(c, '#577363', x + 8, y + 8, 11, 1); }
  }
  for (let i = 0; i < 5; i++) {
    const nx = x + noise(tx, ty, 50 + i) * 30, ny = y + noise(tx, ty, 60 + i) * 30;
    rect(c, i % 2 ? '#bbc5a918' : '#0c201320', nx, ny, i % 3 + 1, 1);
  }
}

let mapTextureSequence = 0;
/** A single static canvas map keeps rendering cheap even with many entities. */
export function drawWorld(scene: Phaser.Scene, world: MapData): Phaser.GameObjects.Container {
  const cols = world.tiles[0]?.length ?? 0, rows = world.tiles.length;
  const tile = (x: number, y: number): number => world.tiles[y]?.[x] ?? 2;
  const key = `bincov-world-${scene.sys.settings.key}-${++mapTextureSequence}`;
  makeCanvas(scene, key, cols * 32, rows * 32, c => {
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
      const value = tile(tx, ty), x = tx * 32, y = ty * 32;
      groundTile(c, value, x, y, tx, ty);
      if (value !== 2 && tile(tx, ty + 1) === 2) { rect(c, '#14282b', x, y + 26, 32, 6); rect(c, '#899080', x, y + 25, 32, 2); }
      if (value !== 2 && tile(tx + 1, ty) === 2) { rect(c, '#14282b', x + 27, y, 5, 32); rect(c, '#899080', x + 25, y, 2, 32); }
      if (value === 1) {
        const wideHorizontal = tile(tx, ty - 1) === 1 && tile(tx, ty + 1) !== 1;
        const wideVertical = tile(tx - 1, ty) === 1 && tile(tx + 1, ty) !== 1;
        if (wideHorizontal && tx % 3 === 0) rect(c, '#bcb78655', x + 2, y + 4, 21, 2);
        if (wideVertical && ty % 3 === 0) rect(c, '#bcb78655', x + 4, y + 2, 2, 21);
        if (noise(tx, ty, 41) > 0.88) { line(c, '#212e29', x + 3, y + 4, x + 15, y + 19); line(c, '#212e29', x + 15, y + 19, x + 30, y + 13); }
      }
      if (value === 0 && noise(tx, ty, 70) > 0.93) {
        for (let i = 0; i < 4; i++) { const gx = x + 5 + i * 5; rect(c, '#627251', gx, y + 23 - i % 3, 1, 6); rect(c, '#819063', gx - 1, y + 24, 3, 1); }
      }
      if (value === 3 && noise(tx, ty, 72) > 0.92) {
        rect(c, '#293934', x + 8, y + 7, 17, 14); rect(c, '#788479', x + 7, y + 6, 16, 13);
        for (let i = 0; i < 4; i++) rect(c, '#43514b', x + 9, y + 9 + i * 2, 12, 1);
      }
    }
    for (const b of world.buildings) {
      // Facade details hug existing walls, leaving walkable interiors visible.
      const bx = b.x, by = b.y, bw = b.w, bh = b.h;
      if (bw < 60 || bh < 60) continue;
      rect(c, '#19251f66', bx + 6, by + bh + 2, bw, 7);
      const name = String(b.kind ?? b.name);
      const awning = /market|市场/.test(name);
      const industrial = /pump|station|observatory|laboratory|utility|泵|观测/.test(name);
      // Clip trim to solid wall tiles, including when a fixture crosses a door edge.
      c.save();
      c.beginPath();
      for (let x = bx; x < bx + bw; x += 32) if (tile(Math.floor(x / 32), Math.floor(by / 32)) === 3) c.rect(x, by, 32, 32);
      c.clip();
      if (awning) {
        for (let x = bx + 8; x < bx + bw - 8; x += 16) {
          if (tile(Math.floor((x + 8) / 32), Math.floor(by / 32)) !== 3) continue;
          rect(c, Math.floor((x - bx) / 16) % 2 ? '#73634a' : '#8d533e', x, by + 8, Math.min(16, bx + bw - 8 - x), 18);
          rect(c, '#382f22', x, by + 25, Math.min(16, bx + bw - 8 - x), 3);
        }
      }
      if (industrial) {
        rect(c, '#263b36', bx + 12, by + 9, 33, 13); rect(c, '#7f8f80', bx + 14, by + 10, 29, 2);
        for (let n = 0; n < 6; n++) rect(c, '#4e6156', bx + 16 + n * 4, by + 14, 2, 5);
      }
      for (let x = bx + 50; x < bx + bw - 28; x += 64) {
        if (tile(Math.floor((x + 12) / 32), Math.floor(by / 32)) !== 3) continue;
        rect(c, '#1b2c2d', x, by + 7, 23, 13); rect(c, '#7f9180', x, by + 7, 23, 2);
        rect(c, '#718076', x + 10, by + 7, 2, 13); rect(c, '#3d5954', x + 2, by + 10, 7, 7);
        rect(c, '#a07d4b', x + 13, by + 10, 7, 7);
      }
      c.restore();
      // Fixtures sit on blocked perimeter tiles rather than invisible obstacles.
      for (let x = bx + 34; x < bx + bw - 32; x += 32) {
        if (tile(Math.floor(x / 32), Math.floor((by + bh - 16) / 32)) !== 3) continue;
        const fy = by + bh - 25;
        rect(c, '#253a30', x, fy, 27, 20); rect(c, industrial ? '#819185' : '#9a855d', x, fy, 27, 2);
        if (industrial) {
          rect(c, '#465d51', x + 2, fy + 4, 22, 13);
          rect(c, '#d0b475', x + 5, fy + 6, 4, 3); rect(c, '#9b594a', x + 16, fy + 6, 4, 3);
          for (let n = 0; n < 3; n++) rect(c, '#2b433a', x + 5, fy + 11 + n * 2, 15, 1);
        } else if (awning) {
          rect(c, '#6c8580', x + 3, fy + 4, 20, 11); rect(c, '#bbccc0', x + 4, fy + 4, 18, 2);
          rect(c, '#334f4e', x + 5, fy + 8, 16, 5); rect(c, '#a3af96', x + 8, fy + 9, 7, 2);
        } else {
          rect(c, '#a98a5f', x + 3, fy + 4, 8, 10); rect(c, '#677c58', x + 14, fy + 6, 9, 8);
          rect(c, '#c7b68b', x + 4, fy + 6, 6, 2);
        }
      }
      // Faded floor paint and tide marks make rooms distinct without hiding actors.
      rect(c, '#273b2a40', bx + 32, by + 32, bw - 64, 4);
      rect(c, '#273b2a30', bx + 32, by + 32, 4, bh - 64);
      if (industrial && bw > 180 && bh > 150) {
        for (let dx = 48; dx < bw - 44; dx += 24) {
          rect(c, '#b9a76655', bx + dx, by + 48, 12, 2);
          rect(c, '#b9a76655', bx + dx, by + bh - 49, 12, 2);
        }
        rect(c, '#b9a76644', bx + 48, by + 48, 2, bh - 96);
        rect(c, '#b9a76644', bx + bw - 49, by + 48, 2, bh - 96);
      }
      // Drainage grates and torn floor papers, all walkable.
      rect(c, '#283c33', bx + bw - 59, by + bh - 56, 18, 12);
      for (let n = 0; n < 5; n++) rect(c, '#63786a', bx + bw - 58 + n * 3, by + bh - 55, 1, 10);
      rect(c, '#b0b29266', bx + 52, by + bh - 57, 6, 9);
      rect(c, '#777f6955', bx + 54, by + bh - 53, 5, 1);
    }
    // Small jetty bollards and fishing tackle remain decorative and unobtrusive.
    for (let ty = 1; ty < rows - 1; ty++) for (let tx = 1; tx < cols - 1; tx++) {
      if (tile(tx, ty) === 6 && tile(tx + 1, ty) === 2 && ty % 3 === 0) {
        rect(c, '#162523', tx * 32 + 20, ty * 32 + 8, 8, 11); rect(c, '#a29973', tx * 32 + 18, ty * 32 + 7, 10, 5);
        line(c, '#a08e60', tx * 32 + 21, ty * 32 + 12, tx * 32 + 39, ty * 32 + 32, 2);
      }
    }
    // Empty fishing boats sit beyond the walkable jetty, reinforcing the shoreline.
    for (const [sx, sy, rust] of [[67 * 32, 20 * 32, 0], [68 * 32, 35 * 32, 1], [67 * 32, 43 * 32, 0]]) {
      rect(c, '#122c2f', sx + 5, sy + 4, 36, 103);
      rect(c, '#122c2f', sx - 1, sy + 21, 48, 65);
      rect(c, rust ? '#9e7650' : '#829082', sx + 4, sy + 14, 36, 76);
      rect(c, rust ? '#9e7650' : '#829082', sx + 10, sy + 6, 24, 91);
      rect(c, '#b5baa0', sx + 14, sy + 2, 16, 96);
      rect(c, '#354d42', sx + 8, sy + 24, 28, 57);
      rect(c, '#6c795a', sx + 12, sy + 27, 20, 48);
      rect(c, '#284336', sx + 14, sy + 32, 16, 37);
      rect(c, '#aeb797', sx + 9, sy + 45, 26, 5);
      rect(c, '#775d41', sx + 14, sy + 58, 16, 4);
      rect(c, '#8b6449', sx + 17, sy + 83, 11, 10);
      line(c, '#a69774', sx + 21, sy + 7, sx + 25, sy - 12);
    }
  });
  const container = scene.add.container(0, 0);
  container.add(scene.add.image(0, 0, key).setOrigin(0));
  container.once(Phaser.GameObjects.Events.DESTROY, () => { if (scene.textures.exists(key)) scene.textures.remove(key); });
  return container;
}

/** Menu panorama, intentionally quiet on the left for readable title typography. */
export function drawBackdrop(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const key = 'bincov-coastal-panorama';
  makeCanvas(scene, key, 960, 540, c => {
    for (let y = 0; y < 540; y += 6) {
      const t = y / 540;
      const red = Math.round(16 + t * 13), green = Math.round(27 + t * 18), blue = Math.round(30 + t * 15);
      rect(c, `rgb(${red},${green},${blue})`, 0, y, 960, 6);
    }
    // Wind-driven stratified clouds, distant roofline, and an eroded seawall.
    for (let i = 0; i < 48; i++) {
      const x = noise(i, 1) * 960, y = 65 + noise(i, 2) * 180;
      rect(c, '#a0b5ab08', x, y, 90 + noise(i, 3) * 200, 2 + noise(i, 4) * 5);
    }
    rect(c, '#8da28b12', 0, 260, 960, 35);
    for (let i = 0; i < 24; i++) {
      const x = i * 47 - 20, h = 10 + noise(i, 5) * 57;
      rect(c, '#304440', x, 302 - h, 30 + noise(i, 8) * 40, h);
      if (i % 4 === 0) rect(c, '#334845', x + 7, 282 - h, 4, 21);
      if (i % 3 === 0) rect(c, '#98886033', x + 9, 285 - h, 3, 3);
    }
    rect(c, '#203b3e', 0, 302, 960, 238);
    for (let i = 0; i < 220; i++) {
      const x = noise(i, 12) * 960, y = 302 + noise(i, 13) * 235;
      rect(c, i % 13 === 0 ? '#a5715644' : '#7f9a8c22', x, y, 5 + noise(i, 15) * 60, 1 + Math.floor(noise(i, 16) * 2));
    }
    // Old harbor cranes are skeletal against the typhoon sky.
    line(c, '#263e3c', 690, 288, 690, 156, 5); line(c, '#263e3c', 690, 161, 826, 204, 5);
    line(c, '#38504a', 690, 158, 745, 110, 3); line(c, '#38504a', 745, 110, 820, 201, 3);
    line(c, '#38504a', 725, 117, 659, 173, 2); line(c, '#38504a', 814, 201, 814, 283, 1);
    rect(c, '#b7724d', 742, 108, 4, 3);
    line(c, '#283d38', 905, 300, 905, 190, 4); line(c, '#283d38', 905, 190, 851, 145, 4);
    line(c, '#283d38', 851, 145, 926, 182, 3); line(c, '#283d38', 861, 155, 861, 267, 1);
    // Foreground wharf and shuttered, corrugated fish station.
    rect(c, '#111f20', 482, 435, 478, 105); rect(c, '#556052', 482, 432, 478, 5);
    for (let i = 0; i < 12; i++) { rect(c, '#243733', 508 + i * 42, 440, 2, 100); rect(c, '#65726444', 488 + i * 43, 449, 35, 2); }
    rect(c, '#142724', 540, 346, 249, 85); rect(c, '#344b41', 539, 340, 250, 77);
    rect(c, '#496051', 539, 340, 250, 4);
    for (let i = 0; i < 28; i++) rect(c, '#172e27', 542 + i * 9, 347, 2, 65);
    rect(c, '#1a2923', 530, 319, 270, 24); rect(c, '#775c41', 530, 316, 270, 4);
    for (let i = 0; i < 30; i++) rect(c, '#a07e5022', 535 + i * 9, 321, 3, 15);
    rect(c, '#6e7352', 571, 331, 133, 29); rect(c, '#ada88a', 574, 333, 127, 2);
    c.font = 'bold 15px "Microsoft YaHei", sans-serif'; c.fillStyle = '#d4cba5'; c.fillText('滨科夫 · 水产站', 579, 352);
    rect(c, '#132a25', 650, 367, 71, 49); rect(c, '#586b56', 652, 370, 65, 3);
    for (let n = 0; n < 6; n++) rect(c, '#2b4337', 652, 378 + n * 6, 65, 2);
    rect(c, '#354b39', 550, 368, 57, 36); rect(c, '#9b8052', 553, 370, 50, 29);
    rect(c, '#5e6647', 568, 370, 3, 29); rect(c, '#5e6647', 587, 370, 3, 29);
    rect(c, '#414f38', 553, 383, 50, 3); rect(c, '#dcc59344', 549, 404, 61, 4);
    // Signal tower and overhead lines provide a strong right-side silhouette.
    rect(c, '#172822', 815, 261, 15, 175); rect(c, '#6e7656', 813, 260, 18, 3);
    rect(c, '#223930', 801, 252, 38, 12); rect(c, '#68765c', 803, 249, 35, 4);
    rect(c, '#ab6045', 814, 239, 12, 12); rect(c, '#efb379', 817, 240, 6, 7);
    rect(c, '#e8ab4c0b', 790, 217, 61, 48); rect(c, '#e8ab4c09', 775, 209, 91, 62);
    line(c, '#4c6050', 820, 262, 820, 430, 2);
    for (let y = 278; y < 425; y += 15) line(c, '#4c6050', 812, y, 829, y, 2);
    line(c, '#14291f', 506, 240, 506, 437, 5); line(c, '#54644a', 487, 266, 528, 266, 3);
    line(c, '#111e18', 501, 266, 821, 281); line(c, '#111e18', 501, 269, 962, 309);
    // Cargo, fishing gear, rope loops and tide-stained edge.
    crate(c, 744, 414); crate(c, 767, 419); crate(c, 751, 396); crate(c, 551, 421, '#526b49');
    rect(c, '#323d2b', 590, 436, 43, 18); rect(c, '#a48f5f', 592, 436, 38, 3);
    for (let i = 0; i < 6; i++) line(c, '#b2a27155', 590 + i * 7, 440, 600 + i * 7, 451);
    for (let i = 0; i < 7; i++) { rect(c, '#203c31', 710 + i * 9, 478 + i % 3 * 3, 15, 2); rect(c, '#71835b', 716 + i * 8, 479 + i % 3 * 3, 2, 9); }
    rect(c, '#1a2720', 839, 413, 10, 43); rect(c, '#7b7750', 837, 411, 14, 5);
    line(c, '#978358', 844, 416, 900, 442, 2); line(c, '#978358', 900, 442, 956, 450, 2);
    // Rain is crisp and sparse; the left stays dark enough for the menu.
    for (let i = 0; i < 75; i++) {
      const x = noise(i, 41) * 960, y = noise(i, 42) * 530;
      line(c, '#b4c8af10', x, y, x - 4, y + 10);
    }
    for (let x = 0; x < 550; x += 8) rect(c, `rgba(9,18,20,${0.58 * (1 - x / 550)})`, x, 0, 8, 540);
    rect(c, '#09131566', 0, 514, 960, 26);
  });
  return scene.add.container(0, 0, [scene.add.image(0, 0, key).setOrigin(0)]);
}
