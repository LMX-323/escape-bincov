import * as D from './domain';

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
}

export function createSessionState(): SessionState {
    return {
        save: D.newSave(), state: 'menu', loadout: null, result: null,
        storageOK: true, recovery: false, conflict: false, pendingSettlement: null,
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
    constructor(
        private readonly session: SessionState,
        private readonly storage: () => D.StorageLike,
    ) {}

    persist(save = this.session.save): boolean {
        if (this.session.conflict) return false;
        try {
            D.writeSave(this.storage(), save);
            this.session.storageOK = true;
            return true;
        } catch {
            this.session.storageOK = false;
            return false;
        }
    }

    initialize(): boolean {
        const s = this.session;
        try {
            s.save = D.readSave(this.storage());
            s.recovery = !!s.save.activeRun;
            D.recoverInterrupted(s.save);
        } catch {
            s.save = D.newSave();
            s.recovery = false;
        }
        return this.persist();
    }

    markConflict(): void {
        this.session.conflict = true;
        this.session.storageOK = false;
    }

    beginRun(seed: number): boolean {
        const s = this.session;
        if (s.state !== 'hideout' || s.conflict || s.pendingSettlement) return false;
        const candidate = structuredClone(s.save);
        const loadout = D.beginRun(candidate, seed);
        if (!this.persist(candidate)) return false;
        s.save = candidate;
        s.loadout = loadout;
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
        if (!candidate || !this.persist(candidate)) return false;
        s.save = candidate;
        s.result = candidate.lastResult!;
        s.pendingSettlement = null;
        s.loadout = null;
        return true;
    }

    /** Accept only a candidate already validated by decodeBackup. */
    importSave(candidate: D.SaveDataV1): boolean {
        const s = this.session;
        if (s.state !== 'hideout' || s.pendingSettlement || candidate.activeRun || !this.persist(candidate)) return false;
        s.save = structuredClone(candidate);
        s.recovery = false;
        return true;
    }

    /**
     * Actions are synchronous domain/medical mutations. No world drops, scene
     * changes or other irreversible effects belong inside this callback.
     * A rejected action, failed write or exception restores all participants.
     */
    mutate(action: SessionMutation, player: PlayerVitals | null = null): MutationResult {
        const s = this.session;
        if (s.conflict || s.pendingSettlement) return 'blocked';
        const before = structuredClone(s.save);
        const carried = s.loadout ? structuredClone(s.loadout) : null;
        const vitals = player ? {
            hp: player.hp, stamina: player.stamina,
            pollution: player.pollution, bleeding: player.bleeding,
        } : null;
        const rollback = () => {
            s.save = before;
            s.loadout = carried;
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
