import type Phaser from 'phaser';
import type { RaidScene } from './game';
import type { SaveDataV1 } from './domain';
import { SynthAudio } from './audio';
import { createSessionState, SaveSession } from './session';
import type { SessionRecord } from './recovery-store';
import type { BaseScene } from './base-scene';

/** Browser composition root. The session never imports this module or the UI. */
export const app = {
    ...createSessionState(),
    game: null as Phaser.Game | null,
    raid: null as RaidScene | null,
    base: null as BaseScene | null,
    baseWalking: false, baseFacility: 'rest', mapView: '',
    tab: 'gear', overlay: '', selected: '', selectedSource: '', seed: '',
    runWorld: 'coast' as 'coast' | 'buildings' | 'mall',
    lootContext: null as { containerId: string; runId: string } | null,
    mobileContainer: 'bag', runContainer: 'bag', inventoryGrid: false, placement: false, placementRotated: undefined as boolean | undefined,
    reading: null as { title: string; text: string } | null,
    pendingImport: null as SaveDataV1 | null,
    pendingRecoveryImport: null as SessionRecord | null,
    menuMotion: true,
};

export const audio = new SynthAudio();
export const saveSession = new SaveSession(app, () => localStorage);
