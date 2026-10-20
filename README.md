# NEON//STREETS

A text-heavy, grid-based cyberpunk crawler that runs in the browser. You walk rain-soaked city streets in
first person, talk to characters, collect items and fight enemies. Admins write the districts: the map, the cast,
branching dialogue and the story. Every run randomizes the start, the exit and the random encounters.

- **Frontend**: Angular 22 (standalone, zoneless, signals, OnPush) in `frontend/`
- **Backend**: plain PHP 8.1+ with PDO/MySQL in `backend/`, no Composer dependencies, so it runs on shared hosting
- **Dev backend**: Docker (PHP/Apache, MySQL, phpMyAdmin)

## Project layout

```
backend/            ← mirrors the web root on the server
  api/index.php     JSON API (routes via ?r=/path, so no URL rewriting needed)
  install/          web installer (DB details, admin account, demo data)
  server/           private PHP code + generated config.php (blocked by .htaccess)
frontend/           Angular app
  src/app/core      API client, auth, models
  src/app/game      engine, scenario randomizer, raycast street view, automap, dialogue box
  src/app/pages     shell, login, level select, play screen
  src/app/admin     level list, map canvas, character + dialogue editors
docker/             PHP/Apache image for local dev
scripts/            build-package.sh (shared-hosting package)
```

## Development

Requirements: Node 22+, Docker.

```bash
npm run backend:up          # PHP on :8080, phpMyAdmin on :8081
```

The first time, open http://localhost:8080/install/. In dev mode the form is prefilled for the Docker database
and creates an admin (`admin` / `admin123`), a test player (`player` / `player123`) and a demo level.

```bash
npm start                   # ng serve on http://localhost:4200, proxies /api and /install to :8080
```

- **Admin vs. player**: log in as `admin` and use the *Admin view / Viewing as player* toggle in the header to see
  what players see. You can also log in as `player`.
- **Start over**: `npm run backend:reset` drops the database volume and `config.php`. Then run the installer again.
- **phpMyAdmin**: http://localhost:8081

## Building for shared hosting

```bash
npm run package                          # site in the web root
BASE_HREF=/neon/ npm run package         # site in a subfolder
```

This creates `dist/package/` and `dist/neon-streets-*.zip`. Upload the contents to your host, open
`https://your-site/install/`, fill in the database details from your hosting panel, and delete `install/` afterwards.
The package contains the Angular build, `api/`, `install/`, `server/` and a `.htaccess` for deep links.
The host needs PHP 8.1+ with `pdo_mysql`, and MySQL or MariaDB.

## Writing districts (the editor)

The editor has three tabs:

- **Map**: paint buildings `#`, streets `.`, possible starts `S`, possible exits `E` and random spots `?` on a
  zoomable canvas (up to 128×128). Place characters and items from the library, and set the random pool.
- **Characters & items**: the level's library of actors.
  - *Character*: talks; blocks the street.
  - *Enemy*: HP, damage, drops, a flag set on defeat. **Hidden ambushers** are invisible on the street and the
    map; walking into one starts an old-school battle (encounter wipe, then FIGHT / TALK / ITEM / RUN).
    Visible enemies (story bosses) talk first; a *Start fight* effect or the Attack button starts the battle.
  - *Item*: picked up on step; can heal, add attack, or give credits. Story items (keys, passes) need no numbers.
  - *Terminal / sign*: an object to read or use.
  - *Story trigger*: invisible; its text plays once when the player steps on the cell.
- **Story & theme**: intro briefing, outro, an optional flag the exit requires (with a "locked" message), and the
  visual theme (Neon night, Acid rain, Corpo plaza, Rust slums).

**Dialogue** is a list of nodes. When a conversation starts, the first node from the top whose condition holds
opens, so conditional variants go above the default greeting. Each choice can:

- jump to another node, or end the conversation
- be shown only if a condition holds: has flag, lacks flag, has item, has at least N credits
- be marked **once**: it disappears after the player picks it (per character, per run). Handy for gifts and rewards
- run effects: set/clear flag, give/take item, ±credits, heal/hurt, start a fight, remove the actor, complete the level

Flags tie it together: e.g. defeating Razor sets `razor_down`, handing Juno the chip sets `delivered`, and the
exit requires `delivered`. The demo district *District 9: Neon Debt* shows all of this.

### Randomized runs

Each run is generated from the level and a **seed** (shown in game; replay one with `/play/<id>?seed=123`):

- one random `S` becomes the start, and one random `E` becomes the real exit
- placed actors always appear
- each `?` rolls against the level's *spawn chance*, then picks an actor from the weighted random pool
- **street encounters**: each step on the street has a chance (the level's *encounter rate*) that an enemy from
  the *encounter pool* jumps the player, like tall grass in old RPGs. A few safe steps follow every battle.

Levels from the first (dungeon) version are converted automatically when opened.

## Controls

`W`/`↑` forward · `S`/`↓` back · `A`/`D` strafe · `Q`/`←` and `E`/`→` turn · `F`/`Space` talk · `X` attack ·
`1`–`9` pick a dialogue choice (or use an inventory item outside dialogue).
In battle: `1` fight · `2` talk · `3` items (`0`/`Esc` back) · `4` run. On mobile, use the on-screen buttons.

Battles play out in short beats with chiptune bleeps (synthesised with WebAudio; 🔊 toggles sound): your hit,
the enemy's HP bar drains, it strikes back, the screen flashes red and your HP bar flashes. The ⛶ button switches
the game to fullscreen.

The engine moves on the grid; the view animates walking and turning, and holding a key keeps walking smoothly.

## Ideas for next steps

- Saving runs and progress per user (a `runs` table), plus high scores
- Doors, keys and metro lines that link districts into a campaign
- Richer scenario rules (encounter tables per level, difficulty scaling)
- Real art: sprite sheets for characters, hand-made facade textures, animated neon
- Shops/inventory screens, quest log, saving progress mid-run
- User management in the admin area
- Schema migrations keyed on `settings.schema_version`
