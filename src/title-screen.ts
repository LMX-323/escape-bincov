// The title UI lives in viewport space; raid and inventory retain their 960×540 layout.
// These tiny original line icons are inline, so the portable HTML stays self-contained.
const icon = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${path}</svg>`;
const book = icon('<path d="M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3V5Z"/><path d="M12 7v14M6 9h3M6 12h3M15 9h3M15 12h3"/>');
const motionIcon = icon('<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6"/>');
const arrow = icon('<path d="M4 12h15M13 6l6 6-6 6"/>');
const compass = icon('<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="7"/><path d="m15 9-2 4-4 2 2-4 4-2Z"/>');

export function titleScreen(options: { runs: number; extracts: number; motion: boolean; overlay: boolean; storageOK: boolean }) {
    const { runs, extracts, motion, overlay, storageOK } = options;
    return `<section class="title-screen" aria-label="游戏主菜单" ${overlay ? 'inert' : ''}>
        <div class="title-shade" aria-hidden="true"></div>
        <header class="title-masthead">
            <div class="title-location">${compass}<span>滨科夫县<b>沿海封锁区</b></span></div>
            <div class="title-day"><span class="signal-dot" aria-hidden="true"></span>赤潮封锁 <strong>第 17 天</strong></div>
        </header>
        <div class="title-layout">
            <div class="title-copy">
                <div class="title-kicker"><span></span>海还没有退去</div>
                <h1><span class="title-escape">逃离</span><span class="title-bincov">滨科夫<span class="title-period" aria-hidden="true">.</span></span></h1>
                <div class="title-english" lang="en">ESCAPE BINCOV</div>
                <p class="title-story">穿过盐雾与封锁线，<br>带上你找到的一切，<em>活着回来。</em></p>
                <div class="title-actions">
                    <button class="title-enter" data-action="enter"><span><strong>进入水产站</strong><small>${runs > 0 ? `已出击 ${runs} 次 · 成功撤离 ${extracts} 次` : '整备装备，准备出发'}</small></span>${arrow}</button>
                    <p class="title-save-note">单人撤离生存<span>进度保存在本机</span></p>
                    ${!storageOK ? '<p class="title-storage-note" role="status">本地存档暂不可写，暂时无法出击。</p>' : ''}
                </div>
            </div>
            <aside class="title-fieldnote" aria-label="水产站电台">
                <div class="title-fieldnote-rule"><span>01 / 最后的避难点</span><span>27° N</span></div>
                <div class="title-radio-heading"><span class="radio-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>水产站 · 留守频道</div>
                <p>“看见岸边那盏灯了吗？<br>我们在这里，等你回来。”</p>
            </aside>
        </div>
        <footer class="title-footer">
            <nav aria-label="主菜单选项">
                <button class="title-link" data-action="help">${book}<span>行动指南</span></button>
                <button class="title-link title-motion" data-action="title-motion" aria-pressed="${motion}" aria-label="动态景物">${motionIcon}<span>动态景物 <b>${motion ? '开' : '关'}</b></span></button>
                <a class="title-link title-repo" href="https://github.com/xuys2025/escape-bincov" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
            </nav>
            <div class="title-edition"><span class="title-input-note">当前战斗需要键盘与鼠标</span><span class="title-build">VOL. 01 <b>/</b> v0.1.1</span></div>
        </footer>
    </section>`;
}
