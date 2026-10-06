import { uiIcon } from './art/symbols';
import wordmark from '../assets/title/title-wordmark.png';

// The menu is real HTML over the layered Phaser scene; nothing interactive is baked into art.
export function titleScreen(options: { runs: number; extracts: number; motion: boolean; overlay: boolean; storageOK: boolean; resume: boolean; touch: boolean }) {
    const { runs, extracts, motion, overlay, storageOK, resume, touch } = options;
    const detail = resume ? '恢复后暂停，确认后继续' : runs > 0 ? `已出击 ${runs} 次 · 成功撤离 ${extracts} 次` : '';
    return `<section class="title-screen" aria-label="游戏主菜单" ${overlay ? 'inert' : ''}>
        <div class="title-shade" aria-hidden="true"></div>
        <header class="title-masthead"><span>滨科夫县</span><span aria-hidden="true">·</span><span>沿海封锁区</span></header>
        <div class="title-layout">
            <h1 class="title-mark"><img src="${wordmark}" alt="逃离滨科夫" width="163" height="93" draggable="false"></h1>
            <div class="title-english" lang="en">ESCAPE BINCOV</div>
            <nav class="title-menu" aria-label="主菜单">
                <button class="title-enter" data-action="enter"><span class="title-marker" aria-hidden="true"></span><span class="title-label">${resume ? '继续上次行动' : '进入水产站'}</span>${detail ? `<small>${detail}</small>` : ''}</button>
                <button class="title-option" data-action="help"><span class="title-marker" aria-hidden="true"></span><span class="title-label">行动指南</span></button>
                ${!storageOK ? '<p class="title-storage-note" role="status">浏览器无法保存进度，暂时不能出击。</p>' : ''}
            </nav>
        </div>
        <footer class="title-footer">
            <div class="title-settings">
                <button class="title-link title-motion" data-action="title-motion" aria-pressed="${motion}" aria-label="动态景物">动态景物 <b>${motion ? '开' : '关'}</b></button>
                <a class="title-link title-repo" href="https://github.com/xuys2025/escape-bincov" target="_blank" rel="noopener noreferrer">GitHub ${uiIcon('external')}</a>
            </div>
            <p class="title-save-note">进度保存在此浏览器<span class="title-input-note">${touch ? '手机横屏战斗 · 触控候选版' : '键盘与鼠标 · 手机支持触控'}</span><span class="title-build">v0.2.0</span></p>
        </footer>
    </section>`;
}
