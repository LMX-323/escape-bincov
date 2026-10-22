/** The page's single toast line (`#toast`). Repeating the same success message counts up instead of replacing it. */
let toastTimer: ReturnType<typeof setTimeout>, lastSuccess = '', successCount = 0;
export function toast(message: string, kind: 'info' | 'success' = 'info') {
    const el = document.getElementById('toast')!;
    const root = document.documentElement;
    successCount = kind === 'success' && lastSuccess === message && el.style.opacity === '1' ? successCount + 1 : 1;
    lastSuccess = kind === 'success' ? message : '';
    el.textContent = message + (kind === 'success' && successCount > 1 ? ` × ${successCount}` : '');
    root.dataset.toastKind = kind;
    el.style.opacity = '1'; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.style.opacity = '0';
        // Restore the radio after the toast's opacity transition has finished.
        toastTimer = setTimeout(() => delete root.dataset.toastKind, 150);
    }, kind === 'success' ? 1500 : 3300);
}
