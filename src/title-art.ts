import Phaser from 'phaser';

// Original, deterministic pixel scenery. Four cached textures, no external assets,
// shaders, particles or per-frame Canvas drawing. Gameplay keeps its existing art.
type Context = CanvasRenderingContext2D;
const random = (n: number, salt = 0) => {
    let v = Math.imul(n + salt * 137, 374761393);
    v = Math.imul(v ^ v >>> 13, 1274126177);
    return ((v ^ v >>> 16) >>> 0) / 4294967296;
};
function rect(c: Context, color: string, x: number, y: number, w: number, h: number) {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function line(c: Context, color: string, x: number, y: number, tx: number, ty: number, width = 1) {
    c.strokeStyle = color; c.lineWidth = width;
    c.beginPath(); c.moveTo(Math.round(x) + .5, Math.round(y) + .5);
    c.lineTo(Math.round(tx) + .5, Math.round(ty) + .5); c.stroke();
}
function polygon(c: Context, color: string, points: number[][]) {
    c.fillStyle = color; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath(); c.fill();
}
function disc(c: Context, color: string, x: number, y: number, radius: number) {
    for (let dy = -radius; dy <= radius; dy += 2) {
        const dx = Math.floor(Math.sqrt(radius * radius - dy * dy) / 2) * 2;
        rect(c, color, x - dx, y + dy, dx * 2, 2);
    }
}
function texture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Context) => void) {
    if (scene.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    draw(c);
    scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
function crate(c: Context, x: number, y: number, w = 22, h = 19) {
    rect(c, '#151f20', x + 3, y + 3, w, h);
    rect(c, '#7c6748', x, y, w, h);
    rect(c, '#c4a66f', x, y, w, 2);
    rect(c, '#514d39', x + 2, y + 6, w - 4, 2);
    rect(c, '#514d39', x + 2, y + h - 5, w - 4, 2);
    rect(c, '#ad8a59', x + 3, y, 3, h);
    rect(c, '#ad8a59', x + w - 6, y, 3, h);
}
function crane(c: Context, x: number, y: number, size: number, color: string) {
    line(c, color, x, 306, x, y, 5 * size);
    line(c, color, x - 24 * size, 307, x, y + 50 * size, 3 * size);
    line(c, color, x, y, x + 102 * size, y + 26 * size, 4 * size);
    line(c, color, x, y, x + 35 * size, y - 50 * size, 3 * size);
    line(c, color, x + 35 * size, y - 50 * size, x + 102 * size, y + 26 * size, 2 * size);
    line(c, color, x + 35 * size, y - 50 * size, x - 36 * size, y + 26 * size, 2 * size);
    line(c, '#6d97904d', x + 94 * size, y + 26 * size, x + 94 * size, y + 108 * size);
    rect(c, '#cb8762', x + 34 * size, y - 52 * size, 3, 2);
}
function paintHarbor(c: Context) {
    // Stepped dusk colors keep the horizon luminous without a post-processing pass.
    for (let y = 0; y < 268; y += 4) {
        const t = y / 268;
        rect(c, `rgb(${Math.round(14 + 42 * t)},${Math.round(32 + 58 * t)},${Math.round(38 + 48 * t)})`, 0, y, 960, 4);
    }
    disc(c, '#bfc99708', 741, 110, 103);
    disc(c, '#bfc9970b', 741, 110, 77);
    disc(c, '#bfc99714', 741, 110, 57);
    disc(c, '#9bac85', 741, 110, 35);
    disc(c, '#ded6a0', 741, 109, 29);
    disc(c, '#e8ddb1', 738, 106, 24);
    // Storm banks, with fine lit edges and rain curtains on the far coast.
    for (let i = 0; i < 98; i++) {
        const x = random(i, 1) * 1040 - 80, y = random(i, 2) * 224;
        const width = 25 + random(i, 3) * 160, h = 2 + Math.floor(random(i, 4) * 6) * 2;
        rect(c, y < 90 ? '#0e252bc4' : '#244548a8', x, y, width, h);
        if (i % 3 === 0) rect(c, '#99b7a71c', x + 10, y + h, width * .7, 1);
    }
    rect(c, '#173a4099', 668, 116, 97, 7);
    rect(c, '#25494b', 724, 127, 145, 6);
    for (let i = 0; i < 36; i++) {
        rect(c, '#bbcbb606', 540 + i * 9, 162 + random(i, 5) * 30, 2, 64);
    }
    polygon(c, '#28494a', [[0, 241], [140, 219], [200, 230], [300, 198], [330, 209], [365, 197], [415, 236], [492, 217], [557, 248], [640, 215], [691, 244], [770, 227], [810, 242], [889, 202], [960, 231], [960, 277], [0, 277]]);
    rect(c, '#879e7c22', 0, 256, 960, 11);
    // The dark working port, behind the near station.
    for (let i = 0; i < 37; i++) {
        const x = i * 28 - 10, h = 9 + Math.floor(random(i, 9) * 31);
        rect(c, '#203d3e', x, 270 - h, 20 + random(i, 10) * 30, h);
        rect(c, '#55756a', x, 270 - h, 24, 1);
        if (i % 3 === 0) {
            rect(c, '#819e7f', x + 7, 263 - h, 2, 2);
            rect(c, '#c4ad72', x + 10, 265, 3, 2);
        }
    }
    crane(c, 606, 188, .85, '#294849');
    crane(c, 858, 194, .64, '#304f4b');
    // Sea and broken horizontal reflections: warm safety, cold open water.
    for (let y = 273; y < 540; y += 4) {
        const t = (y - 273) / 267;
        rect(c, `rgb(${Math.round(37 - 22 * t)},${Math.round(79 - 41 * t)},${Math.round(79 - 37 * t)})`, 0, y, 960, 4);
    }
    for (let i = 0; i < 380; i++) {
        const x = random(i, 11) * 960, y = 275 + random(i, 12) * 265;
        const w = 3 + random(i, 13) * (13 + (y - 273) / 4);
        rect(c, ['#86b1a02d', '#071f2659', '#78a6a32a', '#91bbaa1f'][i % 4], x, y, w, i % 11 ? 1 : 2);
    }
    for (let i = 0; i < 58; i++) {
        const y = 274 + i * 3, spread = 9 + i * .75;
        const x = 742 + (random(i, 14) - .5) * spread * 2;
        rect(c, ['#c4bc7c45', '#aabb9159', '#d4c58d4d'][i % 3], x - spread / 2, y, 3 + random(i, 15) * spread, 1);
    }
    // Red tide threads are part of the world, not a screen effect.
    for (let i = 0; i < 22; i++) {
        const x = 417 + random(i, 16) * 227, y = 301 + i * 7;
        rect(c, '#bc7b634a', x, y, 8 + random(i, 17) * 36, 1);
        rect(c, '#b8755422', x + 8, y + 3, 26, 1);
    }
    // Far beacon and its long, stepped pool of light.
    rect(c, '#1b3435', 901, 209, 10, 64);
    rect(c, '#758a6e', 899, 207, 14, 3);
    rect(c, '#b4ae77', 902, 198, 8, 9);
    rect(c, '#eee0a5', 904, 199, 4, 6);
    rect(c, '#162e32', 899, 195, 14, 3);
    polygon(c, '#14292c', [[898, 195], [906, 188], [914, 195]]);
    for (let i = 0; i < 24; i++) rect(c, '#cbb77932', 899 + random(i, 18) * 14 - i / 2, 279 + i * 4, 5 + random(i, 19) * 14, 1);
    // Near wharf: illuminated top plane, pilings, tyres and salt on the edges.
    polygon(c, '#293e39', [[546, 395], [960, 372], [960, 423], [506, 444], [506, 420]]);
    polygon(c, '#75826a', [[506, 420], [960, 397], [960, 402], [506, 425]]);
    polygon(c, '#132a2b', [[506, 425], [960, 402], [960, 432], [506, 455]]);
    line(c, '#a4a275', 510, 421, 960, 399);
    for (let x = 529; x < 960; x += 57) {
        const y = 429 - (x - 529) * .05;
        rect(c, '#102629', x, y, 11, 112);
        rect(c, '#466056', x, y, 3, 108);
        rect(c, '#72907a33', x - 8, 498 + random(x) * 20, 22, 2);
        line(c, '#203d3b', x + 11, y + 61, x + 56, y + 1, 4);
    }
    for (let i = 0; i < 90; i++) {
        const x = 533 + random(i, 21) * 420, y = 406 - (x - 533) * .05 + random(i, 22) * 13;
        rect(c, i % 3 ? '#a9b69422' : '#bfd0a333', x, y, 3 + random(i, 23) * 12, 1);
    }
    // Fish station, corrugated side wall and a rust-colored sloped roof.
    polygon(c, '#233c36', [[629, 320], [833, 307], [857, 326], [857, 397], [629, 409]]);
    polygon(c, '#344f41', [[638, 332], [806, 323], [806, 401], [638, 410]]);
    polygon(c, '#203731', [[806, 323], [854, 330], [854, 397], [806, 401]]);
    for (let i = 0; i < 25; i++) {
        const x = 641 + i * 6;
        line(c, i % 3 === 0 ? '#678268' : '#162f2b', x, 336 - i * .33, x, 405 - i * .3, 2);
    }
    for (let x = 813; x < 852; x += 7) line(c, '#385046', x, 338, x, 394);
    polygon(c, '#755745', [[622, 322], [651, 296], [820, 286], [865, 318], [805, 329]]);
    polygon(c, '#947354', [[622, 322], [651, 296], [820, 286], [802, 314]]);
    for (let i = 0; i < 20; i++) {
        const x = 654 + i * 8;
        line(c, '#b69a693e', x, 297 - i * .5, x - 24, 318 - i * .45);
    }
    line(c, '#cfaf7766', 652, 295, 820, 285, 2);
    line(c, '#283a2e', 620, 324, 806, 315, 4);
    line(c, '#d6b582', 623, 322, 805, 313);
    line(c, '#182e2b', 805, 315, 866, 320, 4);
    // Small roof equipment, vents, and a battered aerial.
    rect(c, '#263e37', 759, 272, 17, 23);
    rect(c, '#748071', 757, 270, 21, 3);
    rect(c, '#31483d', 762, 276, 3, 16);
    line(c, '#91a48b', 811, 287, 811, 241);
    line(c, '#778e7e', 796, 248, 825, 248);
    line(c, '#778e7e', 801, 242, 821, 242);
    line(c, '#283f3c', 811, 248, 795, 289);
    // Sign is drawn at native pixel resolution, like the rest of the game world.
    polygon(c, '#192d28', [[652, 324], [784, 317], [784, 343], [652, 350]]);
    line(c, '#899773', 653, 324, 783, 317, 2);
    c.save(); c.translate(661, 342); c.transform(1, -.053, 0, 1, 0, 0);
    c.font = 'bold 16px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    c.fillStyle = '#c2c99a'; c.fillText('滨科夫水产站', 0, 0); c.restore();
    // Amber window, blinds and spill on the wet wharf.
    rect(c, '#b0955430', 647, 348, 62, 57);
    rect(c, '#172e29', 653, 351, 51, 40);
    rect(c, '#967d45', 656, 353, 45, 34);
    rect(c, '#e1bc70', 658, 354, 41, 28);
    rect(c, '#f4d991', 659, 354, 38, 3);
    rect(c, '#5e6945', 670, 352, 3, 37);
    rect(c, '#5e6945', 685, 352, 3, 37);
    rect(c, '#647048', 656, 368, 45, 3);
    rect(c, '#9c9b65', 651, 390, 54, 3);
    polygon(c, '#c7ad6927', [[654, 391], [703, 391], [724, 414], [632, 419]]);
    for (let i = 0; i < 15; i++) rect(c, '#ddbf784c', 636 + random(i, 25) * 77, 408 + random(i, 26) * 15, 4 + random(i, 27) * 15, 1);
    rect(c, '#152d29', 722, 350, 56, 52);
    rect(c, '#6c7858', 724, 350, 52, 2);
    for (let i = 0; i < 8; i++) rect(c, i > 5 ? '#1e3930' : '#3d5845', 725, 355 + i * 5, 50, 2);
    rect(c, '#a5a66c', 767, 380, 3, 2);
    // Exterior lamp. Its pool is static; only a small reflection layer moves.
    line(c, '#263e34', 797, 335, 797, 345, 2);
    rect(c, '#80947a', 790, 335, 14, 3);
    rect(c, '#dfe4a5', 793, 338, 8, 3);
    polygon(c, '#d6db9230', [[793, 341], [801, 341], [819, 397], [778, 400]]);
    crate(c, 817, 382); crate(c, 840, 387); crate(c, 824, 365, 19, 17);
    crate(c, 594, 404, 25, 19);
    rect(c, '#263f37', 579, 389, 17, 28);
    rect(c, '#69856a', 579, 390, 17, 3);
    rect(c, '#809272', 579, 410, 17, 2);
    // Ropes, railings, a moored fishing boat and a lone returning scavenger.
    line(c, '#24463f', 535, 408, 615, 404, 2);
    for (let x = 537; x < 618; x += 25) line(c, '#456957', x, 390, x, 419, 2);
    line(c, '#81906c', 536, 390, 618, 386);
    polygon(c, '#0c2024', [[786, 461], [807, 481], [883, 478], [906, 451]]);
    polygon(c, '#2c4a40', [[786, 460], [838, 449], [906, 451], [876, 464], [811, 469]]);
    line(c, '#9da778', 789, 460, 811, 469, 2);
    line(c, '#688a72', 811, 469, 876, 464, 2);
    line(c, '#a1a372', 851, 446, 851, 459, 3);
    line(c, '#8c9870', 851, 447, 888, 417);
    for (let i = 0; i < 6; i++) line(c, '#3b5b4c', 818 + i * 8, 461 - i, 830 + i * 8, 466 - i);
    rect(c, '#172b28', 561, 389, 11, 14);
    rect(c, '#829171', 561, 382, 8, 7);
    rect(c, '#bdb78a', 566, 384, 4, 4);
    rect(c, '#506748', 558, 390, 12, 14);
    rect(c, '#9aaa79', 559, 391, 3, 9);
    rect(c, '#233e32', 556, 393, 4, 10);
    rect(c, '#0e2524', 560, 404, 4, 11); rect(c, '#0e2524', 567, 404, 3, 10);
    line(c, '#172d28', 571, 396, 576, 409, 2);
    // Foreground poles frame the harbor, without covering the title.
    rect(c, '#0a1c20', 931, 143, 8, 329);
    rect(c, '#355149', 931, 143, 2, 329);
    rect(c, '#607763', 923, 171, 26, 3);
    line(c, '#11292b', 584, 174, 734, 200);
    line(c, '#11292b', 734, 200, 935, 176);
    line(c, '#11292b', 934, 181, 960, 189);
    rect(c, '#10292b', 520, 432, 8, 15);
    rect(c, '#93a077', 518, 431, 13, 3);
    line(c, '#9c976b', 526, 434, 548, 447);
    line(c, '#9c976b', 548, 447, 576, 448);
    line(c, '#9c976b', 576, 448, 601, 436);
    // Sparse salt-grain texture is baked once, never animated noise.
    for (let i = 0; i < 1600; i++) rect(c, i % 2 ? '#d4dfb806' : '#06191e0b', random(i, 31) * 960, random(i, 32) * 540, 1, 1);
}

export function drawTitleBackdrop(scene: Phaser.Scene, motion: boolean) {
    texture(scene, 'title-harbor', 960, 540, paintHarbor);
    texture(scene, 'title-rain', 1024, 600, c => {
        for (let i = 0; i < 85; i++) {
            const x = random(i, 35) * 1024, y = random(i, 36) * 600;
            line(c, i % 3 ? '#adccbf16' : '#cbdacb24', x, y, x - 3, y + 8);
        }
    });
    texture(scene, 'title-glints', 960, 540, c => {
        for (let i = 0; i < 45; i++) {
            const y = 280 + random(i, 37) * 215;
            rect(c, i % 2 ? '#bad4b745' : '#e7c28345', 590 + random(i, 38) * 350, y, 2 + random(i, 39) * 17, 1);
        }
    });
    texture(scene, 'title-beacon', 24, 24, c => {
        disc(c, '#d6d99209', 12, 12, 12); disc(c, '#e4dc9c18', 12, 12, 7);
        rect(c, '#f4e6aa', 11, 10, 3, 4);
    });
    scene.add.image(0, 0, 'title-harbor').setOrigin(0);
    const glints = scene.add.image(0, 0, 'title-glints').setOrigin(0);
    const beacon = scene.add.image(893, 189, 'title-beacon').setOrigin(0);
    const rain = scene.add.image(-16, -24, 'title-rain').setOrigin(0);
    const tweens = [
        scene.tweens.add({ targets: rain, x: -25, y: 0, duration: 1700, repeat: -1 }),
        scene.tweens.add({ targets: glints, alpha: .2, duration: 3400, yoyo: true, repeat: -1, ease: 'Sine.InOut' }),
        scene.tweens.add({ targets: beacon, alpha: .2, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.InOut' }),
    ];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => {
        const enabled = motion && !reduced.matches;
        tweens.forEach(tween => enabled ? tween.resume() : tween.pause());
        if (!enabled) { rain.setPosition(-16, -24); glints.setAlpha(.45); beacon.setAlpha(.7); }
    };
    const toggle = (enabled: boolean) => { motion = enabled; applyMotion(); };
    applyMotion();
    reduced.addEventListener('change', applyMotion);
    scene.events.on('title-motion', toggle);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        reduced.removeEventListener('change', applyMotion);
        scene.events.off('title-motion', toggle);
    });
}
