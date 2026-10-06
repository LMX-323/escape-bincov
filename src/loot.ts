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
    rotated?: boolean;
    quantity?: number;
}

/** Validate one exact top-left slot without changing either inventory. */
export function placementError(from: D.Inventory, to: D.Inventory, uid: string, x: number, y: number, rotated?: boolean, quantity?: number): string | null {
    const selected = from.items.find(item => item.uid === uid);
    if (!selected) return '物品已不在原位置，请重新选择。';
    const def = Object.hasOwn(D.ITEMS, selected.id) ? D.ITEMS[selected.id] : undefined;
    if (!def || !Number.isInteger(selected.qty) || selected.qty < 1 || selected.qty > def.stack) return '物品数据无效，无法移动。';
    const qty = quantity ?? selected.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > selected.qty) return '请选择有效的拆分数量。';
    const size = D.itemSize({ ...selected, rotated: rotated ?? selected.rotated });
    if (!Number.isInteger(x) || !Number.isInteger(y)) return '请选择有效的物品格。';
    if (x < 0 || y < 0 || x + size.w > to.w || y + size.h > to.h) return '物品超出目标格子边界。';
    if (from.items.filter(item => item.uid === uid).length !== 1 ||
        (from !== to && to.items.some(item => item.uid === uid))) return '物品标识冲突，无法移动。';
    if (D.fits(to, selected.id, x, y, from === to && qty === selected.qty ? uid : undefined, rotated ?? !!selected.rotated)) return null;
    const target = to.items.find(item => item.uid !== uid && item.x === x && item.y === y);
    if (!target || target.id !== selected.id) return '该位置已有其他物品。';
    if (!!target.relief !== !!selected.relief) return '救济物资不能与普通物资合并。';
    if (!Number.isInteger(target.qty) || target.qty < 1) return '物品数据无效，无法移动。';
    if (target.qty >= def.stack) return `堆叠上限为 ${def.stack}，目标已满。`;
    return null;
}

/** Exact manual placement. A compatible stack takes what fits; the remainder stays at its source. */
export function moveQuantity(from: D.Inventory, to: D.Inventory, uid: string, x: number, y: number, rotated?: boolean, quantity?: number): boolean {
    if (placementError(from, to, uid, x, y, rotated, quantity)) return false;
    const item = from.items.find(i => i.uid === uid)!, requested = quantity ?? item.qty;
    const target = to.items.find(i => i.uid !== uid && i.x === x && i.y === y);
    if (target) {
        const moved = Math.min(requested, D.ITEMS[item.id].stack - target.qty);
        target.qty += moved; item.qty -= moved;
        if (!item.qty) from.items.splice(from.items.indexOf(item), 1);
        return true;
    }
    const placed = { ...item, x, y, qty: requested };
    if (rotated ?? item.rotated) placed.rotated = true; else delete placed.rotated;
    if (requested < item.qty) {
        // Allocate a fresh identity through the domain allocator; the source keeps its identity and orientation.
        const split = D.createInventory(6, 5); D.addItem(split, item.id, requested, !!item.relief);
        placed.uid = split.items[0].uid; item.qty -= requested;
    } else from.items.splice(from.items.indexOf(item), 1);
    to.items.push(placed);
    return true;
}
