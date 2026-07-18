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
import { FaSyncAlt } from "react-icons/fa";

function InsigniaIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 612 792"
      width="1em"
      height="1em"
      fill="currentColor"
    >
      <mask id="insignia-badge-ring" maskUnits="userSpaceOnUse">
        <rect x="0" y="0" width="612" height="792" fill="white" />
        <path
          fill="black"
          transform="translate(306 396) scale(0.951) translate(-306 -396)"
          d="M540.324 551.723 323.69 676.651a32.618 32.618 0 0 1-32.444.083L71.833 551.693a36.09 36.09 0 0 1-18.223-31.359V274.249a36.087 36.087 0 0 1 18.127-31.304l218.209-127.627a32.619 32.619 0 0 1 32.493.013l217.842 125.23a36.095 36.095 0 0 1 18.106 31.291V520.46a36.085 36.085 0 0 1-18.063 31.263z"
        />
      </mask>
      <path
        mask="url(#insignia-badge-ring)"
        d="M307.395 693.432a45.12 45.12 0 0 1-22.301-5.909L65.683 562.482c-15.106-8.607-24.492-24.758-24.492-42.148V274.249c0-17.329 9.336-33.452 24.363-42.075l218.123-127.576a45.17 45.17 0 0 1 22.51-6.028 45.085 45.085 0 0 1 22.444 5.991L546.473 229.79c15.01 8.63 24.333 24.743 24.333 42.061v248.606c0 17.286-9.303 33.392-24.278 42.025L329.892 687.41a45.074 45.074 0 0 1-22.497 6.022z"
      />
      <path d="M281.924 225h49.898v350h-49.898z" />
    </svg>
  );
}

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

function Header({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return (
    <PanelSectionRow>
      <style>{"@keyframes insignia-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style>
      <Focusable style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <span className={staticClasses.PanelSectionTitle} style={{ padding: 0 }}>Insignia</span>
        <DialogButton
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            height: "28px",
            width: "28px",
            padding: "0",
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FaSyncAlt style={refreshing ? { animation: "insignia-spin 1s linear infinite" } : undefined} />
        </DialogButton>
      </Focusable>
    </PanelSectionRow>
  );
}

function Content() {
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
        <Header refreshing={refreshing} onRefresh={handleRefresh} />
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
        <Header refreshing={refreshing} onRefresh={handleRefresh} />
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
        <Header refreshing={refreshing} onRefresh={handleRefresh} />
        <PanelSectionRow>
          <div>No active lobbies right now.</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection>
      <Header refreshing={refreshing} onRefresh={handleRefresh} />
      {games.length > 0 ? (
        games.map((game) => (
          <StatRow key={game.name} label={game.name} value={game.players} />
        ))
      ) : (
        <StatRow label="Total Active Players" value={total} />
      )}
    </PanelSection>
  );
};

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
