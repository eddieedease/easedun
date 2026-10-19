# Dungeon Crawler

An old-school, grid-based dungeon crawler that runs in the browser.
Admins build levels in an editor; every playthrough randomizes the start, the exit and the encounters.

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
  src/app/game      engine, scenario randomizer, 3D view, automap
  src/app/pages     shell, login, level select, play screen
  src/app/admin     level list + level editor
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
BASE_HREF=/dungeon/ npm run package      # site in a subfolder
```

This creates `dist/package/` and `dist/dungeon-crawler-*.zip`. Upload the contents to your host, open
`https://your-site/install/`, fill in the database details from your hosting panel, and delete `install/` afterwards.
The package contains the Angular build, `api/`, `install/`, `server/` and a `.htaccess` for deep links.
The host needs PHP 8.1+ with `pdo_mysql`, and MySQL or MariaDB.

## Levels and scenarios

Level cells: `#` wall · `.` floor · `S` possible start · `E` possible exit · `?` random spot · `M` monster · `T` treasure.

Each run is generated from the level and a **seed** (shown in game; replay one with `/play/<id>?seed=123`):

- one random `S` becomes the start, and one random `E` becomes the real stairs down
- each `?` rolls against the level's *spawn chance*, then picks monster / treasure / trap by weight
- `M` and `T` always spawn, but the monster type and the loot are rolled

## Controls

`W`/`↑` forward · `S`/`↓` back · `A`/`D` strafe · `Q`/`←` and `E`/`→` turn · `H` drink potion. On mobile, use the on-screen pad.

## Ideas for next steps

- Saving runs and progress per user (a `runs` table), plus high scores
- Doors, keys, levers, stairs that link levels into a campaign
- Richer scenario rules (encounter tables per level, difficulty scaling)
- Real art: textured walls and monster sprites in place of the emoji placeholders
- User management in the admin area
- Schema migrations keyed on `settings.schema_version`
