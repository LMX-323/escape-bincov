import type { WorldResolver } from './expansion-state';
import { BUILDING_WORLD } from './building-world';
import { MALL_WORLD } from './mall-world';

/** Production layouts are registered here, never supplied by imported save data.
 * M0's two-map prototype is an explicit test fixture, not a selectable game map. */
export const resolveExpansionWorld: WorldResolver = version => version === BUILDING_WORLD.id ? BUILDING_WORLD : version === MALL_WORLD.id ? MALL_WORLD : undefined;
