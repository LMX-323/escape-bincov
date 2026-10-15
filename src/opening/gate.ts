/**
 * When the opening plays, kept apart from the player so the UI can import it statically (the player, its CSS and
 * painters load on demand). "Seen" lives only in page memory: no save field, no storage key.
 */
let seen = false;
let playing = false;

/**
 * Autoplay for players goes live in P2, together with the browser suites that enter a new save the ordinary way.
 * Until then players see the opening from the title's replay entry, and test pages opt in with ?test=1&opening=auto.
 */
export const OPENING_AUTOPLAY_LIVE = false;

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

/** Test seam for Node: forget that the opening was seen. */
export function resetOpeningGate(): void { seen = false; playing = false; }
