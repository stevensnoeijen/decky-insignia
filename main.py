from __future__ import annotations

import json
import os
import sys

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky
import asyncio
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "py_modules"))
import vdf

INSIGNIA_STATS_URL = "https://insigniastats.live/api/online-users"

# The Steam "Properties" dialog's Target field for a non-Steam shortcut is
# stored as "Exe" in shortcuts.vdf. EmuDeck-style original-Xbox shortcuts
# point their target at a rom under a "roms/xbox/" folder -- the trailing
# slash matters, since "roms/xbox360/..." (a different, Insignia-incompatible
# console) would otherwise also match "roms/xbox".
XBOX_ROM_TARGET_SUBSTRING = "/Emulation/roms/xbox/"


def _find_shortcuts_vdf_path() -> str | None:
    userdata_dir = os.path.join(decky.DECKY_USER_HOME, ".steam", "steam", "userdata")
    if not os.path.isdir(userdata_dir):
        return None

    candidates = []
    for entry in os.listdir(userdata_dir):
        if not entry.isdigit():
            continue
        path = os.path.join(userdata_dir, entry, "config", "shortcuts.vdf")
        if os.path.isfile(path):
            candidates.append(path)

    if not candidates:
        return None

    # A Deck can have more than one Steam account's userdata on disk; the
    # currently logged-in account is the one Steam most recently wrote to.
    candidates.sort(key=os.path.getmtime, reverse=True)
    return candidates[0]


def _get_xbox_rom_appids() -> list[int]:
    path = _find_shortcuts_vdf_path()
    if not path:
        return []

    try:
        with open(path, "rb") as f:
            data = vdf.binary_load(f)
    except Exception as e:
        decky.logger.error(f"Insignia: failed to parse {path}: {e}")
        return []

    appids = []
    for entry in data.get("shortcuts", {}).values():
        vdf_appid = entry.get("appid")
        exe = entry.get("Exe") or entry.get("exe") or ""
        if vdf_appid is None or XBOX_ROM_TARGET_SUBSTRING not in exe:
            continue
        # shortcuts.vdf stores appid as signed 32-bit; Steam's UI (and the
        # data-id/image URLs our frontend reads off home page tiles) use the
        # unsigned interpretation of the same bits.
        appids.append(vdf_appid & 0xFFFFFFFF)
    return appids


SETTINGS_PATH = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
DEFAULT_SETTINGS = {"playcountBadgeEnabled": True, "tileBadgeEnabled": False}


def _load_settings() -> dict:
    try:
        with open(SETTINGS_PATH, "r") as f:
            settings = json.load(f)
    except (FileNotFoundError, ValueError):
        return dict(DEFAULT_SETTINGS)
    return {**DEFAULT_SETTINGS, **settings}


def _save_settings(settings: dict) -> None:
    os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
    with open(SETTINGS_PATH, "w") as f:
        json.dump(settings, f)


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
    async def get_active_games(self) -> dict:
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

        return _parse_stats_response(raw)

    async def get_xbox_rom_appids(self) -> list[int]:
        return _get_xbox_rom_appids()

    async def get_playcount_badge_enabled(self) -> bool:
        return bool(_load_settings().get("playcountBadgeEnabled", True))

    async def set_playcount_badge_enabled(self, enabled: bool) -> None:
        settings = _load_settings()
        settings["playcountBadgeEnabled"] = bool(enabled)
        _save_settings(settings)

    async def get_tile_badge_enabled(self) -> bool:
        return bool(_load_settings().get("tileBadgeEnabled", True))

    async def set_tile_badge_enabled(self, enabled: bool) -> None:
        settings = _load_settings()
        settings["tileBadgeEnabled"] = bool(enabled)
        _save_settings(settings)

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
