import * as D from './domain';

export type LootEndpoint = 'container' | 'bag' | 'safe';

/** World containers are scoped to one raid and retained in its recovery checkpoint. */
export interface LootContainer {
    id: string;
    runId: string;
    kind: 'crate' | 'corpse';
    name: string;
    x: number;
    y: number;
    inventory: D.Inventory;
}

export interface LootTransfer {
    runId: string;
    containerId: string;
    from: LootEndpoint;
    to: LootEndpoint;
    uid: string;
    x: number;
    y: number;
}

/** Validate one exact top-left slot. Never split, swap, rotate or auto-place. */
export function placementError(from: D.Inventory, to: D.Inventory, uid: string, x: number, y: number): string | null {
    const selected = from.items.find(item => item.uid === uid);
    if (!selected) return '物品已不在原位置，请重新选择。';
    const def = Object.hasOwn(D.ITEMS, selected.id) ? D.ITEMS[selected.id] : undefined;
    if (!def || !Number.isInteger(selected.qty) || selected.qty < 1 || selected.qty > def.stack) return '物品数据无效，无法移动。';
    const size = D.itemSize(selected);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return '请选择有效的物品格。';
    if (x < 0 || y < 0 || x + size.w > to.w || y + size.h > to.h) return '物品超出目标格子边界。';
    if (from.items.filter(item => item.uid === uid).length !== 1 ||
        (from !== to && to.items.some(item => item.uid === uid))) return '物品标识冲突，无法移动。';
    if (D.fits(to, selected.id, x, y, from === to ? uid : undefined, !!selected.rotated)) return null;
    const target = to.items.find(item => item.uid !== uid && item.x === x && item.y === y);
    if (!target || target.id !== selected.id) return '该位置已有其他物品。';
    if (!!target.relief !== !!selected.relief) return '救济物资不能与普通物资合并。';
    if (!Number.isInteger(target.qty) || target.qty < 1) return '物品数据无效，无法移动。';
    if (target.qty + selected.qty > def.stack) return `堆叠上限为 ${def.stack}，无法合并整组物品。`;
    return null;
}
