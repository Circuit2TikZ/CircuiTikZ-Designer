# Fonts

`cmunrm.woff` is _CMU Serif Roman_ (Computer Modern Unicode), the font used for the text on the canvas. It is used twice: as the web font `Computer Modern Serif` in `src/styles/styles.scss`, and loaded by `text-to-svg` in `src/scripts/utils/textHelper.ts` to measure and outline the text.

- Source: https://github.com/dreampulse/computer-modern-web-font, file `font/Serif/cmunrm.woff` at commit `e9977be1283466992a2dede47a342655d8426fee`, unmodified (SHA-256 starts with `32115abbbfb23158`). Before it was bundled, the app loaded the same bytes from the jsDelivr CDN.
- License: SIL Open Font License 1.1, see `LICENSE.txt` (copied from https://github.com/vsalvino/computer-modern at commit `f55b094cc91a643fecde154bb7ddb6fd9fed1b54`).
- Only the regular face is used (no bold or italic text on the canvas), so only this file is bundled.

## Icon font

The toolbar and menu icons are the font _Material Symbols Outlined_ (weight 400), used as ligatures (`<span class="material-symbols-outlined">save</span>`). It comes from the npm package `@fontsource/material-symbols-outlined` (SIL OFL 1.1) and is declared at the end of `src/styles/styles.scss`, so new versions arrive with the dependency updates. If an icon name that is new in the font doesn't render, update that package.
