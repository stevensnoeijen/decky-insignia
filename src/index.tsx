import {
  PanelSection,
  PanelSectionRow,
  Focusable,
  DialogButton,
  ToggleField,
  staticClasses,
  afterPatch,
  findSP,
  useParams,
} from "@decky/ui";
import {
  callable,
  definePlugin,
  routerHook,
} from "@decky/api"
import { useEffect, useState, useCallback } from "react";
import { FaSyncAlt, FaArrowLeft, FaChevronRight } from "react-icons/fa";
import { InsigniaIcon } from "./InsigniaIcon";
import { INSIGNIA_GAMES } from "./insigniaGames";

type ActiveGame = {
  name: string;
  players: number;
};

type ActiveGamesResponse = {
  error: boolean;
  message?: string;
  games?: ActiveGame[];
  total?: number;
};

// Mirrors @decky/ui's EConnectivityTestResult, which isn't exported from the
// package root (only reachable via SteamClient's internal type tree).
enum EConnectivityTestResult {
  Unknown,
  Connected,
  CaptivePortal,
  TimedOut,
  Failed,
  WifiDisabled,
  NoLAN,
}

// Calls the python function "get_active_games", which fetches the current
// Insignia network stats and returns them in a normalized shape. The backend
// caches successful responses for 60s; pass forceRefresh=true (wired to the
// panel's refresh button) to bypass that cache.
const getActiveGames = callable<[forceRefresh?: boolean], ActiveGamesResponse>("get_active_games");

const getPlaycountBadgeEnabled = callable<[], boolean>("get_playcount_badge_enabled");
const setPlaycountBadgeEnabledBackend = callable<[boolean], void>("set_playcount_badge_enabled");

const getTileBadgeEnabled = callable<[], boolean>("get_tile_badge_enabled");
const setTileBadgeEnabledBackend = callable<[boolean], void>("set_tile_badge_enabled");

// Read by patchLibraryApp, which runs outside React's render cycle (it's a
// route patch, not a component) and so can't read settings via useState.
// Seeded from the backend on plugin load and kept in sync by SettingsPage's
// toggle; defaults to enabled so the badge shows up before that initial load
// resolves.
let playcountBadgeEnabled = true;

// Read by scanAndBadgeTiles, which runs on a setInterval/MutationObserver
// outside React's render cycle and so can't read settings via useState.
// Seeded from the backend on plugin load and kept in sync by SettingsPage's
// toggle. Defaults to disabled (unlike playcountBadgeEnabled) since the
// poster overlay is more visually intrusive; matches DEFAULT_SETTINGS in
// main.py, which is what actually governs first-run behavior once the
// backend value loads.
let tileBadgeEnabled = false;

// Number of trailing characters kept fully visible so that names differing only
// by a suffix (year, sequel numeral, edition) don't collapse into identical text
// once truncated, e.g. "...Snooker 2003" vs "...Snooker 2004".
const NAME_TAIL_LENGTH = 8;

function StatRow({ label, value }: { label: string; value: number | string }) {
  const splitAt = Math.max(0, label.length - NAME_TAIL_LENGTH);
  const head = label.slice(0, splitAt);
  const tail = label.slice(splitAt);

  return (
    <PanelSectionRow>
      <Focusable style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: "8px" }}>
        <div title={label} style={{ display: "flex", minWidth: 0, overflow: "hidden" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {head}
          </span>
          <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{tail}</span>
        </div>
        <span style={{ fontWeight: "bold", flexShrink: 0 }}>{value}</span>
      </Focusable>
    </PanelSectionRow>
  );
}

const ICON_BUTTON_STYLE = {
  height: "28px",
  width: "28px",
  padding: "0",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

function Header({
  title,
  onBack,
  refreshing,
  onRefresh,
}: {
  title: string;
  onBack?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <PanelSectionRow>
      <style>{"@keyframes insignia-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style>
      <Focusable style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {onBack && (
            <DialogButton onClick={onBack} style={ICON_BUTTON_STYLE}>
              <FaArrowLeft />
            </DialogButton>
          )}
          <span className={staticClasses.PanelSectionTitle} style={{ padding: 0 }}>{title}</span>
        </div>
        {onRefresh && (
          <DialogButton onClick={onRefresh} disabled={refreshing} style={ICON_BUTTON_STYLE}>
            <FaSyncAlt style={refreshing ? { animation: "insignia-spin 1s linear infinite" } : undefined} />
          </DialogButton>
        )}
      </Focusable>
    </PanelSectionRow>
  );
}

function MenuPage({
  onNavigateActiveGames,
  onNavigateSettings,
}: {
  onNavigateActiveGames: () => void;
  onNavigateSettings: () => void;
}) {
  return (
    <PanelSection>
      <PanelSectionRow>
        <DialogButton
          onClick={onNavigateActiveGames}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>Active Games</span>
          <FaChevronRight />
        </DialogButton>
      </PanelSectionRow>
      <PanelSectionRow>
        <DialogButton
          onClick={onNavigateSettings}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>Settings</span>
          <FaChevronRight />
        </DialogButton>
      </PanelSectionRow>
    </PanelSection>
  );
}

function ActiveGamesPage({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<ActiveGamesResponse | null>(null);
  const [connectivity, setConnectivity] = useState(EConnectivityTestResult.Unknown);

  useEffect(() => {
    const registration = SteamClient.System.Network.RegisterForConnectivityTestChanges(
      (test) => setConnectivity(test.eConnectivityTestResult)
    );
    SteamClient.System.Network.ForceTestConnectivity();
    return () => registration.unregister();
  }, []);

  const fetchStats = useCallback((isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    return getActiveGames(isRefresh)
      .then((result) => {
        setStats(result);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    fetchStats(false);
  }, [fetchStats]);

  const handleRefresh = useCallback(() => {
    fetchStats(true);
  }, [fetchStats]);

  if (loading) {
    return (
      <PanelSection>
        <Header title="Active Games" onBack={onBack} refreshing={refreshing} onRefresh={handleRefresh} />
        <PanelSectionRow>
          <div>Loading Insignia stats...</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (!stats || stats.error) {
    const offline =
      connectivity !== EConnectivityTestResult.Unknown &&
      connectivity !== EConnectivityTestResult.Connected;
    const message = offline
      ? "No internet connection. Check your wifi."
      : "Could not load stats. Insignia service may be unreachable.";

    return (
      <PanelSection>
        <Header title="Active Games" onBack={onBack} refreshing={refreshing} onRefresh={handleRefresh} />
        <PanelSectionRow>
          <div>{message}</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  const games = stats.games ?? [];
  const total = stats.total ?? 0;

  if (games.length === 0 && total === 0) {
    return (
      <PanelSection>
        <Header title="Active Games" onBack={onBack} refreshing={refreshing} onRefresh={handleRefresh} />
        <PanelSectionRow>
          <div>No active lobbies right now.</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection>
      <Header title="Active Games" onBack={onBack} refreshing={refreshing} onRefresh={handleRefresh} />
      {games.length > 0 ? (
        games.map((game) => (
          <StatRow key={game.name} label={game.name} value={game.players} />
        ))
      ) : (
        <StatRow label="Total Active Players" value={total} />
      )}
    </PanelSection>
  );
}

function SettingsPage({ onBack }: { onBack: () => void }) {
  const [enabled, setEnabled] = useState(playcountBadgeEnabled);
  const [tileEnabled, setTileEnabled] = useState(tileBadgeEnabled);

  const handleChange = useCallback((checked: boolean) => {
    setEnabled(checked);
    playcountBadgeEnabled = checked;
    setPlaycountBadgeEnabledBackend(checked);
  }, []);

  const handleTileChange = useCallback((checked: boolean) => {
    setTileEnabled(checked);
    tileBadgeEnabled = checked;
    setTileBadgeEnabledBackend(checked);
    // Tile badges are stamped onto raw DOM outside React, so without this
    // the change wouldn't be visible until the next periodic scan/mutation.
    scanAndBadgeTiles();
  }, []);

  return (
    <PanelSection>
      <Header title="Settings" onBack={onBack} />
      <PanelSectionRow>
        <ToggleField
          label="Playcount Badge"
          description="Show the active player count badge on a game's library page."
          checked={enabled}
          onChange={handleChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Poster Icon"
          description="Show the Insignia icon on eligible game posters on the home and library pages."
          checked={tileEnabled}
          onChange={handleTileChange}
        />
      </PanelSectionRow>
    </PanelSection>
  );
}

// Position/size/color matched to the "X Online" player-count badge another
// installed plugin renders in the same top-right spot on this page, so
// Insignia's badge reads as part of the same family of pills rather than a
// one-off. 0 is a placeholder until this is wired up to a per-game active
// player count.
const LIBRARY_BADGE_WRAPPER_STYLE = {
  position: "absolute",
  top: "50px",
  right: "20px",
  zIndex: 1000,
} as const;

const LIBRARY_BADGE_PILL_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  // The reference badge's width comes from its "0 Online" text; ours only
  // shows a bare count, so it needs an explicit min-width to actually match
  // that badge's footprint instead of shrink-wrapping to its shorter content.
  minWidth: "84px",
  padding: "4px 8px",
  backgroundColor: "rgb(75, 158, 234)",
  borderRadius: "12px",
  fontSize: "12px",
  color: "rgb(255, 255, 255)",
  boxShadow: "rgba(0, 0, 0, 0.2) 0px 2px 4px",
  border: "none",
  pointerEvents: "none",
} as const;

const LIBRARY_BADGE_ICON_STYLE = {
  display: "flex",
  alignItems: "center",
  marginRight: "6px",
  fontSize: "14px",
  color: "#4CAF50",
  filter: "drop-shadow(rgba(76, 175, 80, 0.5) 0px 0px 2px)",
} as const;

// Being an Xbox ROM shortcut is necessary but not sufficient: Insignia only
// serves stats for a subset of Xbox Live-enabled titles (INSIGNIA_GAMES), so
// the badge also requires the app's actual display name to fuzzy-match one of
// those. xboxRomAppIdSet is normally populated by visiting the home page
// first (see loadXboxRomAppIds), but a user can land here directly via
// search/collections/back-navigation, so this also kicks off its own load and
// re-renders once that resolves.
function LibraryPlaycountBadge() {
  const { appid } = useParams<{ appid: string }>();
  const [xboxEligible, setXboxEligible] = useState(() => !!appid && !!xboxRomAppIdSet?.has(appid));

  useEffect(() => {
    if (xboxRomAppIdSet) {
      setXboxEligible(!!appid && xboxRomAppIdSet.has(appid));
      return;
    }
    let cancelled = false;
    loadXboxRomAppIds().then(() => {
      if (!cancelled) setXboxEligible(!!appid && !!xboxRomAppIdSet?.has(appid));
    });
    return () => {
      cancelled = true;
    };
  }, [appid]);

  // The app's overview (and thus its display name) is expected to already be
  // loaded here, since this component only renders while that app's own
  // library page is on screen -- unlike home page tiles, which are frequently
  // unvisited and so come back null (see getXboxRomAppIds' comment above).
  const insigniaSupported =
    !!appid && isGameSupportedOnInsignia(window.appStore.GetAppOverviewByAppID(Number(appid))?.display_name);

  if (!playcountBadgeEnabled || !xboxEligible || !insigniaSupported) return null;

  return (
    <div style={LIBRARY_BADGE_WRAPPER_STYLE}>
      <div style={LIBRARY_BADGE_PILL_STYLE}>
        <span style={LIBRARY_BADGE_ICON_STYLE}>
          <InsigniaIcon />
        </span>
        <span>0 Online</span>
      </div>
    </div>
  );
}

// Route patch proving out badge placement on a game's library page. The
// rendered page isn't guaranteed to be position:relative itself, so we wrap
// it in our own relative container rather than assuming we can position
// against its existing layout.
function patchLibraryApp(route: any) {
  afterPatch(route.children, "type", (_: unknown[], ret: any) => (
    <div style={{ position: "relative", height: "100%" }}>
      {ret}
      <LibraryPlaycountBadge />
    </div>
  ));
  return route;
}

const TILE_BADGE_CLASS = "insignia-tile-badge";

const TILE_BADGE_STYLE = {
  position: "absolute",
  // Matches decky-nonsteam-badges' own 4px inset for its bottom-right badge
  // on the same tiles, so both badges read as the same family of corner
  // pills instead of one hugging the edge tighter than the other.
  top: "4px",
  right: "4px",
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  backgroundColor: "#1a9fff",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  pointerEvents: "none",
} as const;

// Same artwork as InsigniaIcon, inlined as a markup string rather than
// rendered via React: tile badges are stamped directly onto raw DOM nodes
// found by scanAndBadgeTiles, outside the plugin's React tree. The mask id
// is parameterized so each tile's badge gets a unique one -- reusing one id
// across many badges in the same document would make later <mask> elements
// unreachable by reference.
function tileBadgeIconMarkup(maskId: string): string {
  return `<svg viewBox="20 80 572 632" width="10" height="10" fill="currentColor">
    <mask id="${maskId}" maskUnits="userSpaceOnUse">
      <rect x="0" y="0" width="612" height="792" fill="white" />
      <path fill="black" transform="translate(306 396) scale(0.91) translate(-306 -396)" d="M540.324 551.723 323.69 676.651a32.618 32.618 0 0 1-32.444.083L71.833 551.693a36.09 36.09 0 0 1-18.223-31.359V274.249a36.087 36.087 0 0 1 18.127-31.304l218.209-127.627a32.619 32.619 0 0 1 32.493.013l217.842 125.23a36.095 36.095 0 0 1 18.106 31.291V520.46a36.085 36.085 0 0 1-18.063 31.263z" />
    </mask>
    <path mask="url(#${maskId})" d="M307.395 693.432a45.12 45.12 0 0 1-22.301-5.909L65.683 562.482c-15.106-8.607-24.492-24.758-24.492-42.148V274.249c0-17.329 9.336-33.452 24.363-42.075l218.123-127.576a45.17 45.17 0 0 1 22.51-6.028 45.085 45.085 0 0 1 22.444 5.991L546.473 229.79c15.01 8.63 24.333 24.743 24.333 42.061v248.606c0 17.286-9.303 33.392-24.278 42.025L329.892 687.41a45.074 45.074 0 0 1-22.497 6.022z" />
    <path d="M272 195h68v410h-68z" />
  </svg>`;
}

function extractAppIdFromImageSrc(src: string | null): string | null {
  if (!src) return null;

  let match = src.match(/\/assets\/(\d+)\//);
  if (match) return match[1];

  match = src.match(/\/customimages\/(\d+)p?\.(jpg|jpeg|png|webp)/i);
  if (match) return match[1];

  match = src.match(/rungameid\/(\d+)/i);
  if (match) return match[1];

  match = src.match(/\/(\d{6,})([p._-]?[a-z]*\.(jpg|png|webp))?/i);
  if (match) return match[1];

  return null;
}

// Home page tiles are a virtualized carousel with no per-tile route to patch
// (unlike patchLibraryApp), so there's no component prop we're handed
// directly. Tile DOM nodes also get recycled between different games as the
// carousel scrolls, so the appid has to be re-derived from live DOM state on
// every scan rather than cached once per node. This mirrors the fallback
// chain other decky library-badge plugins (e.g. decky-nonsteam-badges) use
// in production: a data attribute, then image URL patterns, then an anchor
// href, then React fiber props as a last resort, since chasing this Steam
// version's internal carousel component props directly is far more brittle.
function getTileAppId(tile: Element): string | null {
  const dataId = tile.getAttribute("data-id");
  if (dataId && !dataId.startsWith("placeholder")) return dataId;

  const imageAppId = extractAppIdFromImageSrc(tile.querySelector("img")?.getAttribute("src") ?? null);
  if (imageAppId) return imageAppId;

  const anchor = tile.tagName.toLowerCase() === "a" ? tile : tile.querySelector("a");
  const href = anchor?.getAttribute("href");
  if (href) {
    const match =
      href.match(/\/app\/(\d+)/i) || href.match(/\/details\/(\d+)/i) || href.match(/run\/(\d+)/i);
    if (match) return match[1];
  }

  try {
    for (const el of [tile, ...Array.from(tile.children)]) {
      const fiberKey = Object.keys(el).find(
        (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
      );
      if (!fiberKey) continue;

      let fiber = (el as any)[fiberKey];
      for (let depth = 0; fiber && depth < 5; depth++, fiber = fiber.return) {
        const props = fiber.memoizedProps || fiber.return?.memoizedProps;
        const id =
          props?.appid ??
          props?.appId ??
          props?.unAppID ??
          props?.nAppID ??
          props?.m_unAppID ??
          props?.overview?.appid ??
          props?.appOverview?.appid ??
          props?.app?.appid ??
          props?.game?.appid ??
          props?.item?.appid;
        if (id) return String(id);
      }
    }
  } catch {
    // React internals aren't a stable API; fall through to "unknown" below.
  }

  return null;
}

// appDetailsStore.GetAppDetails()/appStore.GetAppOverviewByAppID() -- the
// obvious frontend APIs for a shortcut's Target path -- return null for any
// app Steam hasn't individually loaded, which in practice is nearly every
// home page tile (confirmed live: every unvisited shortcut came back null).
// So instead the backend reads shortcuts.vdf directly and hands back the set
// of appids whose Target points at an original-Xbox rom.
const getXboxRomAppIds = callable<[], number[]>("get_xbox_rom_appids");

let xboxRomAppIdSet: Set<string> | null = null;

async function loadXboxRomAppIds() {
  try {
    const ids = await getXboxRomAppIds();
    xboxRomAppIdSet = new Set(ids.map(String));
  } catch (e) {
    console.error("Insignia: failed to load Xbox rom appid list", e);
  }
}

// Drops parenthesized region/edition qualifiers (e.g. "(NTSC)", "(USA,
// Japan)") and punctuation so names that only differ in that kind of
// formatting still compare equal.
function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

// Threshold picked to tolerate small wording/formatting drift (e.g. a
// trailing "Demo"/"Trial Version" or a missing subtitle) without matching
// unrelated titles that merely start with the same word.
const FUZZY_NAME_MATCH_THRESHOLD = 0.85;

function isFuzzyNameMatch(a: string, b: string): boolean {
  const normA = normalizeGameName(a);
  const normB = normalizeGameName(b);
  if (!normA || !normB) return false;
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) return true;

  const distance = levenshteinDistance(normA, normB);
  const similarity = 1 - distance / Math.max(normA.length, normB.length);
  return similarity >= FUZZY_NAME_MATCH_THRESHOLD;
}

function isGameSupportedOnInsignia(name: string | null | undefined): boolean {
  if (!name) return false;
  return INSIGNIA_GAMES.some((game) => isFuzzyNameMatch(name, game.name));
}

// Both view roles wrap the poster <img> in a Steam-authored container with
// an inline `position: relative` style that tightly bounds the artwork
// itself -- decky-nonsteam-badges anchors its own tile badge to the same
// container (confirmed live via its shipped source). The tile/gridcell
// element is considerably bigger than that (it also covers the title-text
// row below the art in list view, and hover-scale headroom), so anchoring
// to it instead -- as this used to -- puts percentage-based insets like
// "top: 2px; right: 2px" outside the visible poster rather than in its
// corner. Walk up from the image to find that tight container first, and
// only fall back to the coarser tile-level heuristics if no image (or no
// such ancestor) is found.
function findPosterContainer(tile: HTMLElement, img: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = img.parentElement;
  while (node && node !== tile) {
    if (node.style.position === "relative") return node;
    node = node.parentElement;
  }
  return null;
}

function getBadgeTargetElement(tile: HTMLElement): HTMLElement {
  const img = tile.querySelector("img") as HTMLElement | null;
  if (img) {
    const posterContainer = findPosterContainer(tile, img);
    if (posterContainer) return posterContainer;
  }
  if (tile.getAttribute("role") === "gridcell") {
    return (tile.firstElementChild as HTMLElement) ?? tile;
  }
  return tile;
}

let tileBadgeIdCounter = 0;
let tileObserver: MutationObserver | null = null;
let tileScanInterval: ReturnType<typeof setInterval> | null = null;

function scanAndBadgeTiles() {
  const win = findSP() as any;
  if (!win) return;

  // This Steam version renders home/library tiles as role="listitem" in
  // shelf/carousel views and role="gridcell" in grid views, with no shared
  // wrapper class to scope the query to (the ReactVirtualized classes this
  // selector used to require no longer exist in either view).
  const tiles: NodeListOf<HTMLElement> = win.document.querySelectorAll(
    'div[role="listitem"], div[role="gridcell"]'
  );
  tiles.forEach((tile) => {
    const target = getBadgeTargetElement(tile);
    // Scoped to the whole tile, not just the current target: which element
    // findPosterContainer picks for a given tile can change across scans (the
    // tight poster container only gets its inline `position: relative` once
    // Steam finishes laying out the artwork, so an early scan can fall back
    // to the coarser tile-level target before a later scan finds the right
    // one). Scoping the lookup to `target` alone missed a badge left behind
    // on that earlier, wrong target, producing a duplicate badge per tile.
    const existingBadge = tile.querySelector(`.${TILE_BADGE_CLASS}`);
    const appId = getTileAppId(tile);
    const eligible = tileBadgeEnabled && !!appId && !!xboxRomAppIdSet?.has(appId);

    // Tiles are recycled by the virtualized carousel, so a badge left over
    // from a previous (Xbox-compatible) game shown in this same DOM node
    // must be cleared once the node is reused for a non-matching game.
    if (!eligible) {
      existingBadge?.remove();
      return;
    }
    if (existingBadge) {
      if (existingBadge.parentElement !== target) {
        existingBadge.remove();
      } else {
        return;
      }
    }

    if (win.getComputedStyle(target).position === "static") {
      target.style.position = "relative";
    }
    const badge = win.document.createElement("div");
    badge.className = TILE_BADGE_CLASS;
    Object.assign(badge.style, TILE_BADGE_STYLE);
    badge.innerHTML = tileBadgeIconMarkup(`insignia-tile-badge-ring-${tileBadgeIdCounter++}`);
    target.appendChild(badge);
  });
}

function startTileBadging() {
  const win = findSP();
  if (!win) {
    setTimeout(startTileBadging, 1000);
    return;
  }

  // patchLibraryHome fires this on every navigation to /library/home, not
  // just the first. Without disconnecting/clearing whatever's already
  // running first, each re-entry orphans another MutationObserver + interval
  // that keeps firing forever -- they stack silently and each one adds more
  // scanAndBadgeTiles work on every DOM mutation, which is enough duplicated
  // load to peg the UI thread.
  tileObserver?.disconnect();
  if (tileScanInterval) {
    clearInterval(tileScanInterval);
  }

  loadXboxRomAppIds().then(scanAndBadgeTiles);
  scanAndBadgeTiles();
  tileObserver = new MutationObserver(() => scanAndBadgeTiles());
  tileObserver.observe(win.document.body, { childList: true, subtree: true });
  tileScanInterval = setInterval(scanAndBadgeTiles, 2000);
}

function stopTileBadging() {
  tileObserver?.disconnect();
  tileObserver = null;
  if (tileScanInterval) {
    clearInterval(tileScanInterval);
    tileScanInterval = null;
  }
  const win = findSP();
  win?.document.querySelectorAll(`.${TILE_BADGE_CLASS}`).forEach((el: Element) => el.remove());
}

// Signal-only patch: the route firing just tells us the home page mounted,
// the actual badge placement happens in the DOM scan above.
function patchLibraryHome(route: any) {
  setTimeout(startTileBadging, 50);
  return route;
}

function Content() {
  const [view, setView] = useState<"menu" | "activeGames" | "settings">("menu");

  if (view === "activeGames") {
    return <ActiveGamesPage onBack={() => setView("menu")} />;
  }

  if (view === "settings") {
    return <SettingsPage onBack={() => setView("menu")} />;
  }

  return (
    <MenuPage
      onNavigateActiveGames={() => setView("activeGames")}
      onNavigateSettings={() => setView("settings")}
    />
  );
}

export default definePlugin(() => {
  getPlaycountBadgeEnabled().then((enabled) => {
    playcountBadgeEnabled = enabled;
  });
  getTileBadgeEnabled().then((enabled) => {
    tileBadgeEnabled = enabled;
  });
  loadXboxRomAppIds();

  const libraryAppPatch = routerHook.addPatch("/library/app/:appid", patchLibraryApp);
  const libraryHomePatch = routerHook.addPatch("/library/home", patchLibraryHome);

  return {
    // The name shown in various decky menus
    name: "Insignia",
    // The element displayed at the top of your plugin's menu
    titleView: <div className={staticClasses.Title}>Insignia</div>,
    // The content of your plugin's menu
    content: <Content />,
    // The icon displayed in the plugin list
    icon: <InsigniaIcon />,
    // The function triggered when your plugin unloads
    onDismount() {
      routerHook.removePatch("/library/app/:appid", libraryAppPatch);
      routerHook.removePatch("/library/home", libraryHomePatch);
      stopTileBadging();
      console.log("Unloading Insignia")
    },
  };
});
