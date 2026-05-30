import { useState, useMemo } from "react";
import dummy_data from "./players.json";
import PlayerListItem from "./PlayerListItem";
import Navbar from "./Navbar";
import SortBar from "./SortBar";
import "./App.css";

function sortPlayers(players, key, dir) {
  return [...players].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

function App() {
  const [activePage, setActivePage] = useState("Online Players");
  const [sortKey, setSortKey] = useState("logged_on_at");
  const [sortDir, setSortDir] = useState("desc");

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const onlinePlayers = useMemo(
    () => sortPlayers(dummy_data, sortKey, sortDir),
    [sortKey, sortDir]
  );

  return (
    <div className="App">
      <Navbar activePage={activePage} onNavigate={setActivePage} />
      <div className="page-content">
        {activePage === "Online Players" && (
          <>
            <div className="list-toolbar">
              <SortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <button className="refresh-btn">⟳ Refresh</button>
            </div>
            <div className="player-list">
              <div className="player-list__header">
                <span>Player</span><span>Character</span><span>CD Key</span>
                <span>IP Address</span><span>Logged On</span><span></span>
              </div>
              {onlinePlayers.map((player) => (
                <PlayerListItem key={player.public_cd_key} {...player} />
              ))}
            </div>
          </>
        )}
        {activePage === "Banned Players" && <p>Banned Players — coming soon.</p>}
        {activePage === "Player Search" && <p>Player Search — coming soon.</p>}
      </div>
    </div>
  );
}

export default App;
