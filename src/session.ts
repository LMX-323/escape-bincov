import * as D from './domain';
import { initialCheckpoint, type RaidCheckpoint } from './checkpoint';
import { generateRun } from './world';
import { RecoveryStore, type SessionRecord } from './recovery-store';

export type GameState = 'menu' | 'hideout' | 'run' | 'result';

/** Persistent progress and the in-memory raid share one source of truth. */
export interface SessionState {
    save: D.SaveDataV1;
    state: GameState;
    loadout: D.RunLoadout | null;
    result: D.RunSummary | null;
    storageOK: boolean;
    recovery: boolean;
    conflict: boolean;
    pendingSettlement: D.SaveDataV1 | null;
    checkpoint: RaidCheckpoint | null;
    storageError: string;
    lastSavedAt: number;
}

export function createSessionState(): SessionState {
    return {
        save: D.newSave(), state: 'menu', loadout: null, result: null,
        storageOK: true, recovery: false, conflict: false, pendingSettlement: null,
        checkpoint: null, storageError: '', lastSavedAt: 0,
    };
}

/** Only these live scene values participate in inventory/medical rollback. */
export interface PlayerVitals {
    hp: number;
    stamina: number;
    pollution: number;
    bleeding: number;
}

export type MutationResult = 'committed' | 'rejected' | 'blocked' | 'save-failed';
export type SessionMutation = () => boolean | void;

/**
 * Coordinates domain rules and durable writes without DOM, Phaser or audio.
 * Storage is resolved lazily: even accessing browser localStorage can throw.
 * Callers own rendering, scene transitions and effects after a successful commit.
 */
export class SaveSession {
    private store: RecoveryStore | null = null;
    private raid: { capture(): RaidCheckpoint; restore(value: RaidCheckpoint): void } | null = null;
    private owned = true;
    constructor(
        private readonly session: SessionState,
        private readonly storage: () => D.StorageLike,
    ) {}

    attachRaid(raid: typeof this.raid) { this.raid = raid; }
    persist(save = this.session.save, snapshot?: RaidCheckpoint | null, terminal?: SessionRecord['terminal']): boolean {
        if (this.session.conflict || !this.owned) return false;
        try {
            if (!this.store) throw new Error('存档尚未加载，请刷新重试。');
            const checkpoint = save.activeRun ? (snapshot ?? this.raid?.capture() ?? this.session.checkpoint) : null;
            if (checkpoint && snapshot === undefined && this.session.loadout) checkpoint.loadout = structuredClone(this.session.loadout);
            if (checkpoint) D.checkpointSafe(save, checkpoint.loadout.safe, checkpoint.runId);
            const committed = this.store.commit(save, checkpoint, terminal);
            this.session.checkpoint = committed.raid;
            this.session.lastSavedAt = committed.savedAt;
            this.session.storageOK = true;
            this.session.storageError = '';
            return true;
        } catch (error) {
            this.session.storageOK = false;
            this.session.storageError = error instanceof Error ? error.message : '存档写入失败。';
            return false;
        }
    }

    initialize(owned = true): boolean {
        const s = this.session;
        this.owned = owned; this.raid = null;
        try {
            this.store = new RecoveryStore(this.storage());
            const loaded = this.store.load();
            s.save = loaded.save; s.checkpoint = loaded.raid; s.recovery = loaded.legacyRecovery;
            s.lastSavedAt = this.store.record?.savedAt ?? 0;
            if (!owned) {
                s.storageOK = false; s.storageError = '此存档正在另一窗口使用，或浏览器不支持安全写入。请关闭其他游戏页，再刷新；也可导出备份。';
                return false;
            }
            return this.persist(s.save, loaded.raid);
        } catch (error) {
            s.storageOK = false;
            s.storageError = error instanceof Error ? error.message : '存档读取失败，原始数据未被覆盖。';
            return false;
        }
    }
    original(): string | null { return this.store?.original() ?? null; }
    currentRecord(): SessionRecord | null { return this.store?.record ? structuredClone(this.store.record) : null; }
    resumeRun(): boolean {
        const s = this.session;
        if (!s.checkpoint || !s.storageOK || s.conflict || s.pendingSettlement || s.state !== 'menu') return false;
        s.loadout = structuredClone(s.checkpoint.loadout);
        return true;
    }

    markConflict(): void {
        this.session.conflict = true;
        this.session.storageOK = false;
    }

    beginRun(seed: number): boolean {
        const s = this.session;
        if (s.state !== 'hideout' || s.conflict || s.pendingSettlement || s.save.activeRun) return false;
        const candidate = structuredClone(s.save);
        const loadout = D.beginRun(candidate, seed);
        const checkpoint = initialCheckpoint(generateRun(seed), loadout);
        if (!this.persist(candidate, checkpoint, null)) return false;
        s.save = candidate;
        s.loadout = structuredClone(checkpoint.loadout);
        return true;
    }

    grantRelief(): boolean {
        const candidate = structuredClone(this.session.save);
        if (this.session.pendingSettlement || !D.grantRelief(candidate) || !this.persist(candidate)) return false;
        this.session.save = candidate;
        return true;
    }

    setVolume(volume: number): boolean {
        if (this.session.pendingSettlement) return false;
        const candidate = structuredClone(this.session.save);
        candidate.settings.volume = volume;
        if (!this.persist(candidate)) return false;
        this.session.save = candidate;
        return true;
    }

    /** Stage once; keep this exact candidate for retries and backup on failure. */
    prepareSettlement(outcome: D.Outcome, kills: number): boolean {
        const s = this.session;
        if (s.state !== 'run' || !s.loadout || s.conflict || s.pendingSettlement) return false;
        const candidate = structuredClone(s.save);
        if (!D.settleRun(candidate, s.loadout, outcome, kills)) return false;
        s.pendingSettlement = candidate;
        return true;
    }

    retrySettlement(): boolean {
        const s = this.session;
        const candidate = s.pendingSettlement;
        if (!candidate || !this.persist(candidate, null, { runId: s.save.activeRun!.runId!, outcome: candidate.lastResult!.outcome })) return false;
        s.save = candidate;
        s.result = candidate.lastResult!;
        s.pendingSettlement = null;
        s.loadout = null;
        this.raid = null;
        return true;
    }

    /** Accept only a candidate already validated by decodeBackup. */
    importSave(candidate: D.SaveDataV1): boolean {
        const s = this.session;
        if (s.state !== 'hideout' || s.pendingSettlement || candidate.activeRun || !this.persist(candidate, null, null)) return false;
        s.save = structuredClone(candidate);
        s.recovery = false;
        return true;
    }
    importRecord(record: SessionRecord): boolean {
        const s = this.session;
        if (s.state !== 'hideout' || s.pendingSettlement || s.save.activeRun || !this.persist(record.profile, record.raid, record.terminal)) return false;
        s.save = structuredClone(record.profile); s.recovery = false; s.loadout = null;
        return true;
    }

    /**
     * Actions are synchronous. With an attached scene, matching world changes
     * belong in this transaction and roll back with its checkpoint. External
     * effects and scene transitions must wait until the commit succeeds.
     * A rejected action, failed write or exception restores all participants.
     */
    mutate(action: SessionMutation, player: PlayerVitals | null = null): MutationResult {
        const s = this.session;
        if (s.conflict || s.pendingSettlement || !this.owned) return 'blocked';
        const before = structuredClone(s.save);
        const carried = s.loadout ? structuredClone(s.loadout) : null;
        const scene = this.raid?.capture();
        const vitals = player ? {
            hp: player.hp, stamina: player.stamina,
            pollution: player.pollution, bleeding: player.bleeding,
        } : null;
        const rollback = () => {
            s.save = before;
            s.loadout = carried;
            if (scene) this.raid?.restore(scene);
            if (player && vitals) Object.assign(player, vitals);
        };
        try {
            if (action() === false) {
                rollback();
                return 'rejected';
            }
            if (s.state === 'run' && s.loadout) D.checkpointSafe(s.save, s.loadout.safe, s.loadout.runId);
            else D.grantRelief(s.save);
            if (!this.persist()) {
                rollback();
                return 'save-failed';
            }
            return 'committed';
        } catch (error) {
            rollback();
            throw error;
        }
    }
}
