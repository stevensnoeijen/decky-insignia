import {
  PanelSection,
  PanelSectionRow,
  Focusable,
  staticClasses
} from "@decky/ui";
import {
  callable,
  definePlugin,
} from "@decky/api"
import { useEffect, useState } from "react";
import { FaSatelliteDish } from "react-icons/fa";

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

// Calls the python function "get_active_games", which fetches (and caches) the
// current Insignia network stats and returns them in a normalized shape.
const getActiveGames = callable<[], ActiveGamesResponse>("get_active_games");

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <PanelSectionRow>
      <Focusable style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        <span>{label}</span>
        <span style={{ fontWeight: "bold" }}>{value}</span>
      </Focusable>
    </PanelSectionRow>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ActiveGamesResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    getActiveGames().then((result) => {
      if (cancelled) return;
      setStats(result);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <PanelSection title="Insignia">
        <PanelSectionRow>
          <div>Scanning active lobbies...</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (!stats || stats.error) {
    return (
      <PanelSection title="Insignia">
        <PanelSectionRow>
          <div>Could not load stats. Check connection.</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  const games = stats.games ?? [];
  const total = stats.total ?? 0;

  if (games.length === 0 && total === 0) {
    return (
      <PanelSection title="Insignia">
        <PanelSectionRow>
          <div>No active lobbies right now.</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection title="Insignia">
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
    icon: <FaSatelliteDish />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("Unloading Insignia")
    },
  };
});
