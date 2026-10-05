import type { BaseState } from './expansion-state';

/** Finite serial queue. Clock is milliseconds; batch durations are seconds.
 * Production runs everywhere. This function never heals the body or advances a raid. */
export function advanceProduction(base: BaseState, now: number): void {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('生产时钟无效。');
    let seconds = Math.max(0, now - base.cursor) / 1000;
    base.cursor = Math.max(base.cursor, now);
    while (base.queue.length) {
        const head = base.queue[0];
        const used = Math.min(seconds, head.remaining);
        head.remaining -= used; seconds -= used;
        if (head.remaining > 0) break;
        if (base.completed.length === 3) break;
        base.completed.push(base.queue.shift()!);
        if (seconds === 0) break;
    }
    // Unused blocked/offline time is deliberately discarded, never banked for later collection.
}
