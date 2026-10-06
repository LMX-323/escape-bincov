import Phaser from 'phaser';
import type { MapData } from './world';
import { ITEM_ART_IDS, paintItem } from './art/items';
import { paintActor, paintCorpse, paintLoot, paintPortrait } from './art/actors';
import { paintWorld } from './art/world';
import { inventoryArtSize, paintInventoryItem } from './art/inventory';

// Runtime artwork is original, deterministic and cached once per scene.
type Ctx = CanvasRenderingContext2D;
const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number): void => {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
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

export function createTextures(scene: Phaser.Scene): void {
  for (const kind of ['arms','med'] as const) makeCanvas(scene, `portrait-${kind}`, 48, 48, c => paintPortrait(c, kind));
  makeCanvas(scene, 'player', 32, 32, c => paintActor(c, 'player'));
  for (const weapon of ['knife', 'pistol', 'shotgun', 'carbine']) makeCanvas(scene, `player-${weapon}`, 32, 32, c => paintActor(c, 'player', weapon));
  for (const kind of ['scav', 'salt', 'elite', 'creature'] as const) {
    makeCanvas(scene, kind, 32, 32, c => paintActor(c, kind));
    makeCanvas(scene, `corpse-${kind}`, 32, 32, c => paintCorpse(c, kind));
  }
  makeCanvas(scene, 'loot', 22, 22, c => paintLoot(c, 'loose'));
  makeCanvas(scene, 'loot-crate', 32, 32, c => paintLoot(c, 'crate'));
  makeCanvas(scene, 'loot-crate-empty', 32, 32, c => paintLoot(c, 'empty'));
  makeCanvas(scene, 'note', 20, 24, c => paintLoot(c, 'note'));
  makeCanvas(scene, 'bullet', 10, 4, c => { rect(c, '#d39b5c', 0, 1, 10, 2); rect(c, '#fff2bd', 5, 1, 5, 2); });
  for (const id of ITEM_ART_IDS) {
    const [w, h] = inventoryArtSize(id);
    makeCanvas(scene, `item-inventory-${id}`, w, h, c => paintInventoryItem(c, id));
    makeCanvas(scene, `item-${id}`, 32, 32, c => paintItem(c, id, 32));
    makeCanvas(scene, `item-small-${id}`, 24, 24, c => paintItem(c, id, 24));
    makeCanvas(scene, `loot-${id}`, 24, 24, c => paintItem(c, id, 24));
  }
}

let mapTextureSequence = 0;
/** Static world composition uses the unchanged hand-authored collision map. */
export function drawWorld(scene: Phaser.Scene, world: MapData): Phaser.GameObjects.Container {
  const key = `bincov-world-${scene.sys.settings.key}-${++mapTextureSequence}`;
  makeCanvas(scene, key, world.tiles[0].length * 32, world.tiles.length * 32, c => paintWorld(c, world));
  const container = scene.add.container(0, 0, [scene.add.image(0, 0, key).setOrigin(0)]);
  container.once(Phaser.GameObjects.Events.DESTROY, () => { if (scene.textures.exists(key)) scene.textures.remove(key); });
  return container;
}
