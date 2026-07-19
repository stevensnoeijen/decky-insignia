import {
  PanelSection,
  PanelSectionRow,
  Focusable,
  DialogButton,
  staticClasses
} from "@decky/ui";
import {
  callable,
  definePlugin,
} from "@decky/api"
import { useEffect, useState, useCallback } from "react";
import { FaSyncAlt, FaArrowLeft, FaChevronRight } from "react-icons/fa";
import { InsigniaIcon } from "./InsigniaIcon";

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

// Calls the python function "get_active_games", which fetches (and caches) the
// current Insignia network stats and returns them in a normalized shape.
const getActiveGames = callable<[], ActiveGamesResponse>("get_active_games");

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

function MenuPage({ onNavigate }: { onNavigate: () => void }) {
  return (
    <PanelSection>
      <Header title="Insignia" />
      <PanelSectionRow>
        <DialogButton
          onClick={onNavigate}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>Active Games</span>
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
    return getActiveGames()
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

function Content() {
  const [view, setView] = useState<"menu" | "activeGames">("menu");

  if (view === "activeGames") {
    return <ActiveGamesPage onBack={() => setView("menu")} />;
  }

  return <MenuPage onNavigate={() => setView("activeGames")} />;
}

export default definePlugin(() => {
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
      console.log("Unloading Insignia")
    },
  };
});
