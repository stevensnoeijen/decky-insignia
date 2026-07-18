# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Insignia is a [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin for the Steam Deck's Quick Access Menu. It fetches live player/lobby stats from the Insignia network (`https://insigniastats.live/api/online-users`) and displays them in a QAM panel. It was bootstrapped from the decky-plugin-template, so a lot of the surrounding tooling (VSCode tasks, `backend/` C stub) is template scaffolding rather than Insignia-specific code.

## Commands

- `pnpm i` — install frontend dependencies.
- `pnpm run build` — build the frontend (`rollup -c`) into `dist/index.js`. Run this after every change to `src/index.tsx`.
- `pnpm run watch` — rollup in watch mode.
- There is no lint script and no real test suite (`pnpm test` is a stub that exits with an error).
- Python backend deps are vendored, not pip-installed at runtime: `pip install --target=py_modules -r requirements.txt` regenerates `py_modules/` (gitignored, tracked by `requirements.txt`).

### VSCode tasks (`.vscode/tasks.json`)

These wrap the Decky CLI and are the intended day-to-day workflow if using VSCode/VSCodium:
- `setup` — installs deps, runs `pnpm i`, updates `@decky/ui`.
- `build` — full plugin build via `.vscode/build.sh`, which runs the `decky` CLI (`cli/decky plugin build`) inside a throwaway `ubuntu:24.04` Docker container (the host glibc is too old for the CLI binary directly). Output goes to `out/`.
- `deploy` — rsyncs the built zip in `out/` to a Steam Deck over SSH and extracts it into `homebrew/plugins`.
- `builddeploy` — `build` then `deploy`.
- `restartdecky` — restarts `plugin_loader` on the target Deck over SSH.

Deploy tasks read connection info (`deckip`, `deckport`, `deckuser`, `deckdir`, etc.) from `.vscode/settings.json`, which is gitignored and user-specific; `config.sh` bootstraps it from `.vscode/defsettings.json` on first run.

## Architecture

A Decky plugin has two independently-built halves that communicate over a Python↔JS bridge (`@decky/api`'s `callable()`):

- **Frontend** (`src/index.tsx`) — a single-file React component tree, built by rollup (`@decky/rollup`) into `dist/index.js`, which is what decky-loader actually loads. `definePlugin()` wires up the QAM entry (icon, title, `content`). The `Content` component calls `getActiveGames()` — a `callable<[], ActiveGamesResponse>("get_active_games")` — on mount and renders either a per-game player list or a total, with loading/error/empty states.
- **`StatRow`** truncates long game names with CSS ellipsis but always keeps the last `NAME_TAIL_LENGTH` (8) characters fully visible, since many Insignia titles differ only by a trailing suffix (year, sequel numeral, edition) and naive end-truncation can render two different games as identical text.
- **Backend** (`main.py`) — the `Plugin` class is decky-loader's entry point; its async methods (like `get_active_games`) are what `callable()` on the frontend invokes by name. `_main`, `_unload`, `_uninstall`, and `_migration` are decky lifecycle hooks called automatically by the loader (not Insignia-specific logic — mostly log/settings/runtime-dir migration boilerplate from the template).
- **`get_active_games`** fetches the Insignia stats endpoint fresh on every call (no caching) so the frontend's refresh button and panel reopen always show current data.
- **`_parse_stats_response` / `_normalize_games`** exist because the Insignia API's response shape isn't documented/guaranteed — they defensively handle several possible shapes (bare list, dict wrapping a list under various keys, a single flat total, or a dict keyed by game title) and normalize all of them into `{"error": bool, "games": [...], "total": int}`. When touching this endpoint's parsing, preserve that defensiveness rather than assuming one fixed shape.
- **`py_modules/`** vendors the backend's third-party Python deps (`requests`, `urllib3`, `certifi`, `charset_normalizer`, `idna`) because decky plugins run in a restricted Python environment without pip access at runtime; it's gitignored and regenerated from `requirements.txt`.
- **`backend/`** (C `main.c`, `Makefile`, `Dockerfile`) is unused template boilerplate for plugins that need a compiled native backend binary. Insignia has no native backend — all logic is in `main.py` — so this directory can generally be ignored.
- **`plugin.json`** is the decky manifest (name, flags, `api_version`); **`defaults/`** would hold any bundled static assets (themes/configs) shipped alongside `dist/` and `main.py`, currently unused beyond a placeholder.
