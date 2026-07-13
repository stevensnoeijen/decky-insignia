from __future__ import annotations

import os
import time

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky
import asyncio
import requests

INSIGNIA_STATS_URL = "https://insigniastats.live/api/online-users"
CACHE_TTL_SECONDS = 60


def _normalize_games(entries: list) -> list[dict]:
    games = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name") or entry.get("game") or entry.get("title") or entry.get("map") or "Unknown"
        players = (
            entry.get("players")
            if entry.get("players") is not None
            else entry.get("playerCount", entry.get("player_count", entry.get("count", entry.get("online", 0))))
        )
        try:
            players = int(players)
        except (TypeError, ValueError):
            players = 0
        if players > 0:
            games.append({"name": str(name), "players": players})
    games.sort(key=lambda g: g["players"], reverse=True)
    return games


def _parse_stats_response(raw) -> dict:
    # Shape A: a bare list of per-game entries
    if isinstance(raw, list):
        games = _normalize_games(raw)
        return {"error": False, "games": games, "total": sum(g["players"] for g in games)}

    if isinstance(raw, dict):
        # Shape B: a dict wrapping a list of per-game entries
        for key in ("games", "servers", "lobbies", "data", "results"):
            value = raw.get(key)
            if isinstance(value, list):
                games = _normalize_games(value)
                return {"error": False, "games": games, "total": sum(g["players"] for g in games)}

        # Shape C: a single flat online-user total, no per-game breakdown
        for key in ("total", "online", "count", "players", "online_users", "onlineUsers"):
            value = raw.get(key)
            if isinstance(value, (int, float)):
                return {"error": False, "games": [], "total": int(value)}

        # Shape D: a dict keyed by game title, each value a per-game entry dict
        if raw and all(isinstance(v, dict) for v in raw.values()):
            games = _normalize_games(raw.values())
            return {"error": False, "games": games, "total": sum(g["players"] for g in games)}

    decky.logger.warning(f"Insignia: unrecognized response shape: {raw!r}")
    return {"error": True, "message": "Unrecognized response from Insignia stats service."}


class Plugin:
    _cache = {"timestamp": 0.0, "data": None}

    async def get_active_games(self) -> dict:
        now = time.time()
        cached = self._cache["data"]
        if cached is not None and (now - self._cache["timestamp"]) < CACHE_TTL_SECONDS:
            return cached

        try:
            response = requests.get(INSIGNIA_STATS_URL, timeout=10)
            response.raise_for_status()
            raw = response.json()
        except requests.exceptions.RequestException as e:
            decky.logger.error(f"Insignia: request to stats service failed: {e}")
            return {"error": True, "message": "Could not reach Insignia stats service."}
        except ValueError as e:
            decky.logger.error(f"Insignia: could not parse JSON response: {e}")
            return {"error": True, "message": "Received an invalid response from the stats service."}

        result = _parse_stats_response(raw)
        if not result["error"]:
            self._cache["data"] = result
            self._cache["timestamp"] = now
        return result

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        self.loop = asyncio.get_event_loop()
        decky.logger.info("Insignia started!")

    # Function called first during the unload process, utilize this to handle your plugin being stopped, but not
    # completely removed
    async def _unload(self):
        decky.logger.info("Goodnight World!")
        pass

    # Function called after `_unload` during uninstall, utilize this to clean up processes and other remnants of your
    # plugin that may remain on the system
    async def _uninstall(self):
        decky.logger.info("Goodbye World!")
        pass

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        decky.logger.info("Migrating")
        # Here's a migration example for logs:
        # - `~/.config/decky-template/template.log` will be migrated to `decky.decky_LOG_DIR/template.log`
        decky.migrate_logs(os.path.join(decky.DECKY_USER_HOME,
                                               ".config", "decky-template", "template.log"))
        # Here's a migration example for settings:
        # - `~/homebrew/settings/template.json` is migrated to `decky.decky_SETTINGS_DIR/template.json`
        # - `~/.config/decky-template/` all files and directories under this root are migrated to `decky.decky_SETTINGS_DIR/`
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "template.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "decky-template"))
        # Here's a migration example for runtime data:
        # - `~/homebrew/template/` all files and directories under this root are migrated to `decky.decky_RUNTIME_DIR/`
        # - `~/.local/share/decky-template/` all files and directories under this root are migrated to `decky.decky_RUNTIME_DIR/`
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "template"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "decky-template"))
