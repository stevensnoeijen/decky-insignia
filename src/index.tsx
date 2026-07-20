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
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { FaSyncAlt, FaArrowLeft, FaChevronRight } from "react-icons/fa";
import { InsigniaIcon } from "./InsigniaIcon";
import { INSIGNIA_GAMES, InsigniaGame } from "./insigniaGames";

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

// Looks up a single title's current online count by its Insignia title ID,
// sharing get_active_games' 60s cache on the backend rather than triggering
// its own fetch.
const getGameOnlineCount = callable<[titleId: string], number>("get_game_online_count");

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
// one-off.
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

// patchLibraryApp wraps the page's own rendered root in a position:relative
// div spanning the full (non-scrolling) viewport -- the page's hero banner
// and details actually live inside an internal scroll container nested
// somewhere below that root, so a badge positioned absolute against the
// outer wrapper stays pinned to the screen instead of scrolling away with the
// hero underneath it. This walks the page root's descendants for the element
// Steam is actually scrolling (has more content than fits, per its computed
// overflow-y), so the badge can be anchored inside *that* instead.
function findLibraryScrollContainer(root: HTMLElement): HTMLElement | null {
  // This route patch's closure is defined in decky's own injected JS context,
  // not the Steam window the patched route actually renders into -- bare
  // `getComputedStyle` here would resolve to that wrong window's version and
  // silently return empty/useless styles for a foreign-document element, so
  // this goes through the element's own view instead (same reasoning as
  // scanAndBadgeTiles's use of findSP()'s window rather than the bare global).
  const view = root.ownerDocument.defaultView;
  if (!view) return null;
  const candidates = root.querySelectorAll<HTMLElement>("*");
  for (const el of Array.from(candidates)) {
    const style = view.getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight - el.clientHeight > 10) {
      return el;
    }
  }
  return null;
}

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
  const displayName = appid ? window.appStore.GetAppOverviewByAppID(Number(appid))?.display_name : undefined;
  const insigniaGame = findMatchingInsigniaGame(displayName);

  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  // navigator.onLine only reflects whether the OS has *some* network
  // interface up -- it stays true on a Wi-Fi with no real internet (captive
  // portal, dead upstream), which is exactly the case most worth skipping a
  // doomed fetch for. SteamClient's own connectivity test (already used by
  // ActiveGamesPage above) is what Steam itself uses to know if it's really
  // reachable, so this reuses that instead.
  const [connectivity, setConnectivity] = useState(EConnectivityTestResult.Unknown);

  useEffect(() => {
    const registration = SteamClient.System.Network.RegisterForConnectivityTestChanges(
      (test) => setConnectivity(test.eConnectivityTestResult)
    );
    SteamClient.System.Network.ForceTestConnectivity();
    return () => registration.unregister();
  }, []);

  useEffect(() => {
    if (!insigniaGame) {
      setOnlineCount(null);
      return;
    }
    // Treated as online unless a test has actually come back bad: Unknown is
    // the state before the first ForceTestConnectivity result lands, and
    // defaulting it to "offline" would skip the very first fetch on every
    // page open just because that result hasn't arrived yet.
    const isOffline =
      connectivity !== EConnectivityTestResult.Unknown && connectivity !== EConnectivityTestResult.Connected;
    let cancelled = false;
    const fetchCount = () => {
      // Re-checked on every call (not just once per effect run) since the
      // interval below lives for as long as this game's library page stays
      // open, and playcountBadgeEnabled can flip mid-session via
      // SettingsPage's toggle -- no point spending a request (and a 10s
      // backend timeout on a dead connection) on a badge that's hidden or
      // can't reach the network anyway.
      if (!playcountBadgeEnabled || isOffline) return;
      getGameOnlineCount(insigniaGame.id)
        .then((count) => {
          if (!cancelled) setOnlineCount(count);
        })
        .catch((e) => {
          console.error("Insignia: failed to load online count", e);
        });
    };
    fetchCount();
    // Matches the backend's own 60s cache TTL for this data, so this mostly
    // just picks up whatever the next natural cache refresh produced rather
    // than forcing extra fetches of its own.
    const interval = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [insigniaGame?.id, connectivity]);

  // patchLibraryApp's wrapper (see below) contains the page's own rendered
  // content alongside this component -- used below to locate the page's
  // actual scroll container rather than that non-scrolling wrapper itself.
  // Note the page's own render output isn't guaranteed to be a single DOM
  // node (confirmed live it can render as a multi-node fragment), so this
  // walks up to the shared parent rather than assuming a specific sibling.
  const markerRef = useRef<HTMLDivElement>(null);
  const [heroAnchor, setHeroAnchor] = useState<HTMLElement | null>(null);
  const createdAnchorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const attach = () => {
      if (cancelled) return;
      const pageRoot = markerRef.current?.parentElement as HTMLElement | null;
      const scrollContainer = pageRoot && findLibraryScrollContainer(pageRoot);
      if (!scrollContainer) {
        // The page's own content (and thus its scroll container) may still
        // be mounting right after navigation; Steam-side pages this large
        // and complex don't appear instantly. Give up after a few seconds
        // rather than retrying forever on a page that genuinely never
        // scrolls (its content fits without overflow).
        if (attempts++ < 15) retryTimeout = setTimeout(attach, 200);
        return;
      }
      // Zero-height so it doesn't add visible space to the page; sits at
      // the very top of the scrolled content (i.e. the hero) since it's a
      // normal-flow first child, so an absolutely-positioned badge inside it
      // scrolls away together with the hero instead of staying pinned to
      // the screen.
      const anchor = scrollContainer.ownerDocument.createElement("div");
      anchor.style.position = "relative";
      anchor.style.height = "0px";
      scrollContainer.insertBefore(anchor, scrollContainer.firstChild);
      createdAnchorRef.current = anchor;
      setHeroAnchor(anchor);
    };
    attach();
    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
      createdAnchorRef.current?.remove();
      createdAnchorRef.current = null;
    };
  }, []);

  const showBadge = playcountBadgeEnabled && xboxEligible && !!insigniaGame;

  return (
    <>
      <div ref={markerRef} style={{ display: "none" }} />
      {showBadge &&
        heroAnchor &&
        createPortal(
          <div style={LIBRARY_BADGE_WRAPPER_STYLE}>
            <div style={LIBRARY_BADGE_PILL_STYLE}>
              <span style={LIBRARY_BADGE_ICON_STYLE}>
                <InsigniaIcon />
              </span>
              <span>{onlineCount ?? 0} Online</span>
            </div>
          </div>,
          heroAnchor
        )}
    </>
  );
}

// Route patch proving out badge placement on a game's library page.
// LibraryPlaycountBadge finds its own DOM anchor by walking up from itself
// to this wrapper (its parent) and searching the page content rendered
// alongside it, so it doesn't matter that this wrapper itself isn't part of
// the page's internal scroll flow -- it only needs to contain that content.
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
// Japan)"), ROM file extensions, and punctuation so names that only differ in
// that kind of formatting still compare equal. The extension strip matters
// for ROM shortcuts specifically: Steam's display name for one is literally
// its filename (e.g. "Halo 2 (USA, Europe) (En,Ja,...).xiso"), and leaving
// ".xiso" in would otherwise dilute the length-coverage ratio nameMatchScore
// uses for short titles enough to drop a real match below threshold.
function normalizeGameName(name: string): string {
  return name
    .replace(/(\.(xiso|iso|xbe))+$/i, "")
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

// Returns a 0-1 similarity score, or null if either name is empty. A plain
// "does either string contain the other" check (with no regard for *how much*
// of the longer one the shorter one covers) would treat "MechAssault" as a
// match for "MechAssault 2 - Lone Wolf" -- a real prefix hit, but on an
// unrelated sequel -- so containment is scored by length-coverage ratio
// rather than auto-accepted, letting a same-length exact match always
// outrank a partial prefix/suffix hit.
function nameMatchScore(a: string, b: string): number | null {
  const normA = normalizeGameName(a);
  const normB = normalizeGameName(b);
  if (!normA || !normB) return null;
  if (normA === normB) return 1;

  if (normA.includes(normB) || normB.includes(normA)) {
    return Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
  }

  const distance = levenshteinDistance(normA, normB);
  return 1 - distance / Math.max(normA.length, normB.length);
}

// Picks the *best*-matching entry rather than the first one to clear the
// threshold: titles that share a prefix with a sequel/edition/demo (e.g.
// "Star Wars: Battlefront" / "Star Wars: Battlefront II") would otherwise
// resolve to whichever entry happens to sort first, showing that game's
// online count under the wrong badge.
function findMatchingInsigniaGame(name: string | null | undefined): InsigniaGame | undefined {
  if (!name) return undefined;

  let best: InsigniaGame | undefined;
  let bestScore = 0;
  for (const game of INSIGNIA_GAMES) {
    const score = nameMatchScore(name, game.name);
    if (score !== null && score >= FUZZY_NAME_MATCH_THRESHOLD && score > bestScore) {
      bestScore = score;
      best = game;
    }
  }
  return best;
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
    // Being an Xbox ROM shortcut is necessary but not sufficient (see
    // LibraryPlaycountBadge above) -- Insignia only serves stats for titles in
    // INSIGNIA_GAMES. xboxRomAppIdSet.has() is a cheap Set lookup, so it's
    // checked first via && short-circuiting to skip the display-name lookup
    // and O(INSIGNIA_GAMES.length) fuzzy match entirely for the vast majority
    // of tiles that aren't Xbox shortcuts at all. Uses the global window's
    // appStore, not win's (findSP()'s window doesn't have one -- confirmed
    // live it's undefined there, which would throw and abort this whole
    // forEach); the global one has full overviews (incl. display_name) for
    // every shortcut regardless of whether it's been individually visited.
    const eligible =
      tileBadgeEnabled &&
      !!appId &&
      !!xboxRomAppIdSet?.has(appId) &&
      !!findMatchingInsigniaGame(window.appStore.GetAppOverviewByAppID(Number(appId))?.display_name);

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
