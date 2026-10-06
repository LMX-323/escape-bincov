import { brush, type PixelContext } from './pixel';
import type { SpaceDefinition } from '../spatial';

/** Furniture follows the same space definition as collision and interactions. */
export function paintSpace(c: PixelContext, space: SpaceDefinition): void {
  const r = brush(c).r;
  space.cells.forEach((row, ty) => row.forEach((cell, tx) => {
    if (cell !== 'low') return;
    r('#4b503c', tx * 32 + 2, ty * 32 + 10, 28, 21);
    r('#9a8863', tx * 32 + 3, ty * 32 + 10, 26, 4);
  }));
  for (const d of space.decorations ?? []) {
    const x = d.x - 14, y = d.y - 14, name = d.name;
    if (d.kind === 'V') {
      r('#c3bb9170', x + 5, y + 7, 18, 11);
      for (let n = 0; n < 3; n++) r('#415941', x + 7, y + 9 + n * 3, 11 + n, 1);
      continue;
    }
    r('#172d23', x, y, 28, 28);
    r(d.kind === 'M' ? '#867755' : '#718071', x + 1, y + (d.kind === 'M' ? 10 : 2), 26, d.kind === 'M' ? 16 : 24);
    if (/药房/.test(name)) {
      r('#ccd4b1', x + 3, y + 4, 21, 20); r('#749271', x + 11, y + 7, 5, 14); r('#749271', x + 7, y + 11, 13, 5);
    } else if (/炸鸡/.test(name)) {
      r('#a27147', x + 4, y + 12, 19, 11); r('#c3a179', x + 4, y + 12, 19, 3);
      for (let n = 0; n < 3; n++) { r('#484e43', x + 5 + n * 7, y + 3, 4, 7); r('#ddaf71', x + 6 + n * 7, y + 17, 3, 4); }
    } else if (/服装/.test(name)) {
      r('#9eac91', x + 3, y + 5, 22, 2); r('#4f5148', x + 5, y + 5, 2, 20); r('#4f5148', x + 23, y + 5, 2, 20);
      for (let n = 0; n < 3; n++) { r(['#9482a0','#ac9474','#879d90'][n], x + 7 + n * 5, y + 9, 4, 12); r('#c4c3a1', x + 8 + n * 5, y + 7, 2, 3); }
    } else if (/生鲜|冷藏/.test(name)) {
      r('#b6cabe', x + 3, y + 10, 22, 14); r('#446f73', x + 5, y + 13, 18, 9);
      for (let n = 0; n < 3; n++) r('#bed6cf', x + 7 + n * 5, y + 16, 4, 2);
    } else if (/数码/.test(name)) {
      r('#627e85', x + 3, y + 10, 22, 14); r('#b3c9b9', x + 4, y + 11, 20, 2);
      for (let n = 0; n < 3; n++) { r('#203a40', x + 6 + n * 6, y + 15, 4, 6); r('#76b0ad', x + 7 + n * 6, y + 16, 2, 3); }
    } else if (/五金|电房|配电/.test(name)) {
      r('#344c48', x + 3, y + 3, 22, 22); r('#c4a160', x + 5, y + 6, 4, 4); r('#b56b54', x + 17, y + 6, 4, 4);
      for (let n = 0; n < 3; n++) r('#889d86', x + 5, y + 15 + n * 3, 16, 1);
    } else if (/财务/.test(name)) {
      r('#586c64', x + 3, y + 3, 22, 22); r('#c4b791', x + 12, y + 11, 6, 6); r('#2e453b', x + 14, y + 6, 2, 16); r('#2e453b', x + 8, y + 14, 14, 2);
    } else if (/办公室|仓库/.test(name)) {
      for (let n = 0; n < 3; n++) { r(/办公室/.test(name) ? '#8e9f88' : '#ac8c5d', x + 3, y + 4 + n * 7, 21, 5); r('#344b3b', x + 12, y + 6 + n * 7, 5, 1); }
    } else if (/家居|露台/.test(name)) {
      r('#a29c7c', x + 3, y + 12, 21, 10); r('#747f61', x + 2, y + 9, 24, 4); r('#cbc4a3', x + 4, y + 14, 7, 6); r('#cab997', x + 14, y + 14, 7, 6);
    } else if (/厕所/.test(name)) {
      r('#bdd0bd', x + 4, y + 11, 20, 13); r('#446c65', x + 7, y + 14, 14, 6); r('#b5b58b', x + 13, y + 8, 3, 8);
    } else if (/竹木/.test(name)) {
      for (let n = 0; n < 4; n++) { r('#aaa875', x + 3 + n * 6, y + 4, 3, 21); r('#5c7248', x + 3 + n * 6, y + 11, 3, 2); }
    } else if (/大堂|广场|服务|门厅/.test(name)) {
      r('#d2cba5', x + 4, y + 12, 20, 11); r('#4c7556', x + 6, y + 16, 13, 3); r('#4c7556', x + 17, y + 13, 3, 9);
    } else {
      for (let n = 0; n < 3; n++) { r(['#c5ae79','#74998b','#a07461'][n], x + 3 + n * 7, y + 7, 5, 16); r('#d7cfa9', x + 3 + n * 7, y + 8, 5, 2); }
    }
  }
}
