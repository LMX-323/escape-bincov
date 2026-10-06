/** esbuild inlines imported PNGs as data URLs (scripts/build.mjs); nothing is fetched at runtime. */
declare module '*.png' {
    const url: string;
    export default url;
}
