import { useState, useEffect, useMemo } from "react";
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
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const useDummyData = import.meta.env.VITE_USE_DUMMY_DATA === "true";

  function fetchPlayers() {
    if (useDummyData) {
      setPlayers(dummy_data);
      return;
    }
    setLoading(true);
    setError(null);
    fetch("http://localhost:8000")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setPlayers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchPlayers();
  }, []);

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const onlinePlayers = useMemo(
    () => sortPlayers(players, sortKey, sortDir),
    [players, sortKey, sortDir]
  );

  return (
    <div className="App">
      <Navbar activePage={activePage} onNavigate={setActivePage} />
      <div className="page-content">
        {activePage === "Online Players" && (
          <>
            <div className="list-toolbar">
              <SortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <button className="refresh-btn" onClick={fetchPlayers}>⟳ Refresh</button>
            </div>
            {loading && <p>Loading...</p>}
            {error && <p style={{ color: "#c0323a" }}>Error: {error}</p>}
            {!loading && !error && (
              <div className="player-list">
                <div className="player-list__header">
                  <span>Player</span><span>Character</span><span>CD Key</span>
                  <span>IP Address</span><span>Logged On</span><span></span>
                </div>
                {onlinePlayers.map((player) => (
                  <PlayerListItem key={player.public_cd_key} {...player} />
                ))}
              </div>
            )}
          </>
        )}
        {activePage === "Banned Players" && <p>Banned Players — coming soon.</p>}
        {activePage === "Player Search" && <p>Player Search — coming soon.</p>}
      </div>
    </div>
  );
}

export default App;
