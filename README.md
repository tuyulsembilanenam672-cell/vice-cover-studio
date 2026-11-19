[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/c/gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/tuyulsembilanenam672-cell/vice-cover-studio/rank.svg)](https://make.fun/c/gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/tuyulsembilanenam672-cell/vice-cover-studio/reward.svg)](https://make.fun/c/gta6-cover-art-01)

# Vice Cover Studio

Turn any photo into GTA-style multi-panel cover art, in your browser, fully offline. Pick a layout, pick a colour grade, write your caption, and download a PNG ready to post.

## What it does

- **Any photo** — add photos from your machine (never uploaded) or use the two built-in sample photos. Each panel takes its own photo.
- **Crop and position each panel** — click a panel, drag to move its photo, scroll to zoom, or use the sliders. Fill all panels with one photo in one click.
- **Six layouts** — Hero + Stack, Nine Panel, Diagonal Split, Tilted Snapshots, Film Strip, Full Bleed — with angled panel cuts and heavy black gutters.
- **Five colour grades** — Sunset, Neon Night, Palm Dusk, Heat Wave, Mono.
- **Bold caption lettering** — Anton display type with a gradient fill and hard outline, a Pacifico neon script subtitle, and a tilted badge ribbon. Title size, colour and position are editable.
- **Poster finish** — halftone title block, film grain and vignette.
- **Fast export** — one click downloads a PNG at 1080 × 1080, 1080 × 1350 or 1920 × 1080.
- **Undo / redo** — every layout, caption and crop change can be undone (Ctrl+Z / Ctrl+Shift+Z).

## Run it offline

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network request: every script, font and image is a file under `app/`.

## Files

- `app/index.html` — the editor page
- `app/style.css` — the editor chrome
- `app/src/cover.js` — the cover renderer (layouts, grades, lettering, grain)
- `app/src/main.js` — the editor (photos, panel crop, undo/redo, export)
- `app/src/shots.js` — screenshot presets driven by the page's query string
- `app/fonts/` — Anton and Pacifico, both under the SIL Open Font License
- `app/samples/` — two demo photos made with an image model, free to use
- `main.ts` — the make.fun entrypoint: copies `app/` and `screenshots/` to the output directory and writes `dossier.json`

## How the cover is drawn

`app/src/cover.js` renders everything on a 2D canvas: each layout is a list of panel slots (fractions of the cover, with optional angled polygon cuts and rotations), each photo is drawn cover-fit into its slot with the panel's zoom and pan, then the grade tint, halftone dots, caption lettering, badge ribbon, vignette and seeded film grain are layered on top. The same renderer draws the live preview and the exported PNG, so what you see is what you post.

## License

MIT — see [LICENSE](LICENSE). Fonts: Anton and Pacifico under the SIL Open Font License, Version 1.1 (texts in `app/fonts/`). An original design — no Rockstar Games logo, artwork or fonts.
