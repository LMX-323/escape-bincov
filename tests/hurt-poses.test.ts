import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMPORTER, MANIFEST, cutPoses, idlePath, importerText, manifestText, samePixels, type PoseAsset } from '../scripts/export-hurt-poses';
import { decodePng, type RGBA } from '../scripts/title-art/png';

const committed = () => JSON.parse(readFileSync(MANIFEST, 'utf8')) as { sources: Record<string, string>; assets: PoseAsset[] };

test('受击姿态：40 张运行帧、清单和导入文件与 #96 的 pixel-v2 图集一致（四类敌人 × 五朝向 × 受击/恢复）', () => {
  const { sources, entries } = cutPoses(), manifest = committed();
  assert.equal(entries.length, 40);
  assert.deepEqual(manifest.sources, sources);
  entries.forEach(({ asset, frame }, i) => {
    assert.ok(samePixels(decodePng(readFileSync(asset.file)), frame), `${asset.file} pixels`);
    assert.deepEqual({ ...manifest.assets[i], sha256: '' }, asset);
  });
  assert.equal(readFileSync(MANIFEST, 'utf8'), manifestText(sources, manifest.assets));
  assert.equal(readFileSync(IMPORTER, 'utf8'), importerText(manifest.assets));
});

test('受击姿态：脚底四行不动，人形肩点所在的第 19、20 行不动，不新增颜色；头顶受击下移 2、恢复下移 1', () => {
  const opaque = (f: RGBA, x: number, y: number) => f.data[(y * f.w + x) * 4 + 3] > 0;
  const rows = (f: RGBA) => Array.from({ length: f.h }, (_, y) => Array.from({ length: f.w }, (_, x) => opaque(f, x, y)).some(Boolean));
  const row = (f: RGBA, y: number) => Buffer.from(f.data.subarray(y * f.w * 4, (y + 1) * f.w * 4)).toString('hex');
  const colours = (f: RGBA) => new Set(Array.from({ length: f.w * f.h }, (_, p) => p * 4).filter(i => f.data[i + 3] > 0).map(i => row({ ...f, w: 1, data: f.data.subarray(i, i + 4) }, 0)));
  for (const { asset, frame } of cutPoses().entries) {
    const idle = decodePng(readFileSync(idlePath(asset.kind, asset.dir.toLowerCase()))), name = `${asset.kind} ${asset.dir} ${asset.pose}`;
    const top = (f: RGBA) => rows(f).indexOf(true), bottom = rows(idle).lastIndexOf(true);
    assert.equal(top(frame) - top(idle), asset.pose === 'hurt' ? 2 : 1, `${name}: head drop`);
    for (let y = bottom - 3; y <= bottom; y++) assert.equal(row(frame, y), row(idle, y), `${name}: feet row ${y}`);
    if (idle.h === 48) for (const y of [19, 20]) assert.equal(row(frame, y), row(idle, y), `${name}: shoulder row ${y} (the arms start there)`);
    const own = colours(idle);
    assert.deepEqual([...colours(frame)].filter(c => !own.has(c)), [], `${name}: new colours`);
  }
});
