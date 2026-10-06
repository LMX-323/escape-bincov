/** A single 24px, 2px-weight family for UI symbols; names remain in the DOM. */
const paths = {
  guide: '<path d="M5 3h14v18H5zM8 3v18M11 7h5M11 11h5"/><path d="M14 15v5l2-1 2 1v-5"/>',
  motion: '<path d="M5 22V2M3 22h4M5 4h6l9 3v4l-9 3H5M11 4v10M16 6v6"/>',
  arrow: '<path d="M3 12h17M13 5l7 7-7 7"/>',
  compass: '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M12 5l7 7-7 7-7-7zM12 5v14M5 12h14"/>',
  external: '<path d="M14 3h7v7M21 3 11 13M10 5H4v15h15v-6"/>',
  pause: '<path d="M6 4h3v16H6zM15 4h3v16h-3z"/>',
} as const;
export function uiIcon(name: keyof typeof paths): string {
  return `<svg class="ui-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
