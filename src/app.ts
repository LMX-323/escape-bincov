import type Phaser from 'phaser';
import type { RaidScene } from './game';
import type { SaveDataV1 } from './domain';
import { SynthAudio } from './audio';
import { createSessionState, SaveSession } from './session';

/** Browser composition root. The session never imports this module or the UI. */
export const app = {
    ...createSessionState(),
    game: null as Phaser.Game | null,
    raid: null as RaidScene | null,
    tab: 'gear', overlay: '', selected: '', selectedSource: '', seed: '',
    pendingImport: null as SaveDataV1 | null,
};

export const audio = new SynthAudio();
export const saveSession = new SaveSession(app, () => localStorage);
