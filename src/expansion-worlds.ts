import type { WorldResolver } from './expansion-state';

/** Production layouts are registered here, never supplied by imported save data.
 * M0's two-map prototype is an explicit test fixture, not a selectable game map. */
export const resolveExpansionWorld: WorldResolver = () => undefined;
