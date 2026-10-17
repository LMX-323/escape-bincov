/**
 * What #game shows behind the HTML UI. The menu mounts the layered title scene (src/title/, its own renderer); the tab
 * page and the result page show the station harbour painting (src/title-art.ts) on a plain canvas, dimmed on the tab
 * page. Raids, the yard and the opening draw with their own hosts, so #game stays empty for them.
 */
import { mountTitle, type TitleController } from './title/scene';
import { stationBackdrop } from './title-art';

export type Screen = 'menu' | 'hideout' | 'result' | 'none';
let title: TitleController | null = null;
let shown: Screen = 'none';

export function showScreen(next: Screen, motion: boolean) {
    const game = document.getElementById('game');
    if (!game || next === shown && (next !== 'menu' || title)) return;
    shown = next;
    if (next !== 'menu') { title?.destroy(); title = null; }
    game.querySelectorAll('canvas.backdrop').forEach(canvas => canvas.remove());
    if (next === 'menu') { if (!title) title = mountTitle(game, motion); return; }
    if (next === 'none') return;
    const canvas = stationBackdrop(next === 'hideout');
    canvas.classList.add('backdrop');
    canvas.setAttribute('aria-hidden', 'true');
    game.appendChild(canvas);
}
/** The mounted title scene (menu only): motion and overlay switches, and the review scripts' snapshots. */
export const titleScene = () => title;
