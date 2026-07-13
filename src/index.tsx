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

function InsigniaIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 612 792"
      width="1em"
      height="1em"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M307.395 693.432a45.12 45.12 0 0 1-22.301-5.909L65.683 562.482c-15.106-8.607-24.492-24.758-24.492-42.148V274.249c0-17.329 9.336-33.452 24.363-42.075l218.123-127.576a45.17 45.17 0 0 1 22.51-6.028 45.085 45.085 0 0 1 22.444 5.991L546.473 229.79c15.01 8.63 24.333 24.743 24.333 42.061v248.606c0 17.286-9.303 33.392-24.278 42.025L329.892 687.41a45.074 45.074 0 0 1-22.497 6.022zM540.324 551.723 323.69 676.651a32.618 32.618 0 0 1-32.444.083L71.833 551.693a36.09 36.09 0 0 1-18.223-31.359V274.249a36.087 36.087 0 0 1 18.127-31.304l218.209-127.627a32.619 32.619 0 0 1 32.493.013l217.842 125.23a36.095 36.095 0 0 1 18.106 31.291V520.46a36.085 36.085 0 0 1-18.063 31.263z"
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
    icon: <InsigniaIcon />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("Unloading Insignia")
    },
  };
});
