# Wander

A stress-free, infinite exploration game for the browser — drive, walk, camp,
and watch the day go by across procedurally generated hills, lakes, and
towns. Inspired by games like *Slow Roads*: no goals forced on you, no
combat, nothing to fail. Just an endless world to roam through.

Built with plain [Three.js](https://threejs.org/) — no build step, no
bundler, just static files and ES modules loaded straight from a CDN.

## Features

- **Infinite procedural terrain** — hills, biomes, and a fixed lake/waterfall
  landmark, generated as you drive (never the same seed twice unless you
  keep the default `CONFIG.seed`)
- **Three vehicles** — a car and bike for land, a rowboat for the lake —
  plus a walking/sprinting rider with mount and dismount
- **Camping & rest** — pitch camp anywhere, fast-forward time, and watch a
  full day/night cycle with a moving sun, moon, and stars
- **Ambient wildlife** — birds, grazing deer, and fish that jump in the lake
  — decorative, no combat, no threat
- **Procedural towns** — occasional settlements with roads, buildings, and
  wandering NPCs, plus wayside campsites you can stumble across
- **A minimap** (`M`) that always points toward the nearest town, campsite,
  or the lake, even when they're too far away to render in detail
- **Hidden scoring** — the game quietly tracks exploration milestones
  (discovering biomes, reaching a summit, camping, etc.) without ever
  showing you a number, unless you flip `SHOW_SCORE` in `js/score.js`
- **Save/load** per player name, stored locally in the browser
- **Mobile touch controls**, automatically enabled on touch devices

## Running it locally

This needs to be served over HTTP — opening `index.html` directly
(`file://`) won't work, since browsers block ES module imports from the
filesystem.

```bash
# from the project folder
python3 -m http.server 8080
```

Then open **http://localhost:8080** in a browser.

Any static file server works — `npx serve`, VS Code's Live Server
extension, etc. Just make sure you always reopen it at the **same**
address; the browser's local storage (your name and save data) is tied to
the exact host and port you use.

## Deploying to GitHub Pages

Since this is already a static site with no build step, GitHub Pages can
serve it directly from the repo — no CI, no build config.

1. Push this repo to GitHub (see the main project conversation, or GitHub's
   own "push an existing repository" instructions, if you haven't already).
2. On GitHub, open the repo's **Settings** tab → **Pages** (left sidebar).
3. Under "Build and deployment", set **Source** to **Deploy from a
   branch**, then set **Branch** to `main` and the folder to `/ (root)`.
   Click **Save**.
4. GitHub builds and publishes it within a minute or two, at:
   `https://<your-username>.github.io/<repo-name>/`
   (shown at the top of that same Pages settings screen once it's live).

Any time you `git push` new changes to `main` afterward, the live site
updates automatically — no extra steps.

Two things specific to this project worth knowing:

- The URL will use `https`, and a fresh visitor gets an empty save slot
  until they type a name — that's expected, per-name saves live in that
  browser's local storage, not on GitHub.
- If you ever rename the repo, the Pages URL changes with it (the
  `<repo-name>` segment above), so links you've shared would break.

## Controls

| Action | Key |
|---|---|
| Drive / walk | `WASD` or arrow keys |
| Brake / drift / sprint | `Space` |
| Switch vehicle | `Tab` |
| Get in / out of a vehicle | `E` |
| Make or pack up camp | `R` |
| Cycle time speed (while camped) | `T` |
| Toggle free/orbit camera | `C` |
| Toggle map | `M` |

On touch devices, an on-screen D-pad and buttons appear automatically.

## Project structure

Everything lives under `js/`, one module per system (`terrain.js`,
`vehicles.js`, `player.js`, `camp.js`, `sky.js`, `world.js`, `wildlife.js`,
`town.js`, `minimap.js`, `save.js`, `score.js`, ...). `js/config.js` holds
every tunable constant in one place. `js/main.js` wires it all together and
runs the render loop.

Every 3D model has a primitive fallback (see `loadModel`/`loadAnimatedModel`
in `js/loader.js`), so the game still runs even if an asset fails to load —
a couple of vehicles (the bike and boat) ship as primitives permanently,
since no fitting CC0 model was available for them.

## Credits

3D assets by [Kenney](https://kenney.nl/) (Nature Kit, Car Kit, Blocky
Characters, City Kit) — all CC0 1.0 Universal, no attribution required, but
credited here anyway.

## License

No license file yet — add one (MIT is a common choice for a project like
this) if you plan to share or accept contributions.
