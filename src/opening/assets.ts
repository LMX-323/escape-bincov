/**
 * Sol's opening plates (look-dev r2: A08, A14, C04). Inline data URLs; the build checks every import against
 * assets/opening/manifest.json. Images are decoded when a playback starts and dropped with it.
 */
import harborSky from '../../assets/opening/v2/op-bg03-harbor-sky-night-v2.png';
import harborMid from '../../assets/opening/v2/op-bg03-harbor-mid-night-v2.png';
import harborBreakwater from '../../assets/opening/v2/op-bg03-harbor-breakwater-night-v2.png';
import harborNear from '../../assets/opening/v2/op-bg03-harbor-near-night-v2.png';
import shipDark from '../../assets/opening/v2/op-sp01-ship-dark-v2.png';
import shipFlash from '../../assets/opening/v2/op-sp01-ship-flash-v2.png';
import hatchDark from '../../assets/opening/v2/op-bg05-hatch-dark-v2.png';
import hatchLit from '../../assets/opening/v2/op-bg05-hatch-lit-v2.png';
import crewNear0 from '../../assets/opening/v2/op-ch03-near-f0-v2.png';
import crewNear1 from '../../assets/opening/v2/op-ch03-near-f1-v2.png';
import roofSky from '../../assets/opening/v2/op-bg13-roof-sky-v2.png';
import roofMid from '../../assets/opening/v2/op-bg13-roof-mid-v2.png';
import roofNear from '../../assets/opening/v2/op-bg13-roof-near-v2.png';
import glow0 from '../../assets/opening/v2/op-bg13-glow-f0-v2.png';
import glow1 from '../../assets/opening/v2/op-bg13-glow-f1-v2.png';
import youSit from '../../assets/opening/v2/op-ch04-sit-f0-v2.png';

const SOURCES = { harborSky, harborMid, harborBreakwater, harborNear, shipDark, shipFlash, hatchDark, hatchLit, crewNear0, crewNear1, roofSky, roofMid, roofNear, glow0, glow1, youSit };
export type OpeningArt = Record<keyof typeof SOURCES, HTMLImageElement>;

/** Decode every plate; null when any fails, and the animatic keeps its placeholder painters. */
export async function loadOpeningArt(): Promise<OpeningArt | null> {
  try {
    const entries = await Promise.all(Object.entries(SOURCES).map(async ([name, src]) => {
      const image = new Image(); image.src = src; await image.decode(); return [name, image] as const;
    }));
    return Object.fromEntries(entries) as OpeningArt;
  } catch (error) {
    console.error('Opening art failed to decode; showing the placeholder frames.', error);
    return null;
  }
}
