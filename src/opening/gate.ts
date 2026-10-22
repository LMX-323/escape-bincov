/**
 * When the opening plays, kept apart from the player so the UI can import it statically (the player, its CSS and
 * painters load on demand). "Seen" lives only in page memory: no save field, no storage key.
 */
let seen = false;
let playing = false;

/**
 * Autoplay for players on a new save. Browser suites that enter the ordinary way skip it with Esc
 * (scripts/yard-entry.mjs skipOpening); test pages keep the old flow unless they ask with ?test=1&opening=auto.
 */
export const OPENING_AUTOPLAY_LIVE = true;

/** Autoplay on a new save's first "enter the station" in this page: no raid ever started and nothing to resume. */
export function openingAutoplay(runs: number, resume: boolean, search = globalThis.location?.search ?? ''): boolean {
  if (seen || playing || runs > 0 || resume) return false;
  const p = new URLSearchParams(search);
  if (p.get('test') === '1') return p.get('opening') === 'auto';
  return OPENING_AUTOPLAY_LIVE;
}

/** Play the opening; resolves when it ends or is skipped. A failure is logged and treated as skipped. */
export async function playOpening(mode: 'first' | 'replay'): Promise<void> {
  if (playing) return;
  playing = true; seen = true;
  try { const { play } = await import('./player'); await play(mode); }
  catch (error) { console.error('Opening cutscene failed; continuing without it.', error); }
  finally { playing = false; }
}

/** Review aid on test pages only: render the opening's whole sound offline as a WAV (base64). */
if (new URLSearchParams(globalThis.location?.search ?? '').get('test') === '1') {
  (globalThis as { __bincovOpeningAudio?: () => Promise<string> }).__bincovOpeningAudio = () => import('./sound').then(m => m.renderOpeningAudio());
}

/** Test seam for Node: forget that the opening was seen. */
export function resetOpeningGate(): void { seen = false; playing = false; }
