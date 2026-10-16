import { RealHideoutRuntime } from './hideout-runtime';
import type { ShopCart } from './shop';
import type { SaveDataV1 } from './domain';
import { SynthAudio } from './audio';
import { createSessionState, SaveSession } from './session';
import type { SessionRecord } from './recovery-store';

/** Browser composition root. The session never imports this module or the UI. */
export const app = {
    ...createSessionState(),
    /** 2.5D raid host (coast-view/sample.ts): owns every raid while set; the old page is cleared. */
    coastSample: null as { checkpoint(): boolean } | null,
    /** Station yard host (default hideout view); while set, the old tab page is cleared. */
    station: null as { checkpoint(): boolean } | null,
    /** Tab page: the facility shown on the 基地设施 tab. */
    baseFacility: 'rest',
    tab: 'gear', overlay: '', helpReturn: '', selected: '', selectedSource: '', seed: '',
    runWorld: 'buildings' as 'coast' | 'buildings' | 'mall',
    mobileContainer: 'bag', inventoryGrid: false, placement: false, placementRotated: undefined as boolean | undefined, placementQuantity: undefined as number | undefined,
    pendingImport: null as SaveDataV1 | null,
    pendingRecoveryImport: null as SessionRecord | null,
    menuMotion: true,
    shop: null as ShopCart | null,
    shopLeave: null as { action: 'tab' | 'deploy' | 'menu' | 'base-enter'; id: string } | null,
};

export const audio = new SynthAudio();
export const saveSession = new SaveSession(app, () => localStorage);

/** Shared by the station host and shortcut tabs; no independent save store. */
export const hideoutRuntime = new RealHideoutRuntime(app, saveSession, undefined, () => !document.hidden && document.hasFocus() && !app.overlay);
