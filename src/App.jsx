import { useState, useEffect, useMemo } from "react";
import dummy_data from "./players.json";
import PlayerListItem from "./PlayerListItem";
import BannedPlayerItem from "./BannedPlayerItem";
import "./BannedPlayerItem.css";
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
  const [bannedPlayers, setBannedPlayers] = useState([]);
  const [bannedLoading, setBannedLoading] = useState(false);
  const [bannedError, setBannedError] = useState(null);
  const [pendingBanKeys, setPendingBanKeys] = useState(new Set());

  const useDummyData = import.meta.env.VITE_USE_DUMMY_DATA === "true";

  function fetchPlayers() {
    if (useDummyData) {
      setPlayers(dummy_data);
      return;
    }
    setLoading(true);
    setError(null);
    fetch("http://localhost:8000/online_players")
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

  function fetchPendingBans() {
    if (useDummyData) return;
    fetch("http://localhost:8000/pending_bans")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setPendingBanKeys(new Set(data.map((b) => b.public_cd_key)));
      })
      .catch(() => {});
  }

  function banPlayer(cdKey) {
    if (useDummyData) return;
    fetch("http://localhost:8000/pending_bans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_cd_key: cdKey }),
    }).then(() => {
      setPendingBanKeys((prev) => new Set(prev).add(cdKey));
    });
  }

  function unbanPlayer(cdKey) {
    if (useDummyData) return;
    fetch("http://localhost:8000/unban", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_cd_key: cdKey }),
    });
  }

  function fetchBannedPlayers() {
    setBannedLoading(true);
    setBannedError(null);
    fetch("http://localhost:8000/banned_players")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setBannedPlayers(data);
        setBannedLoading(false);
      })
      .catch((err) => {
        setBannedError(err.message);
        setBannedLoading(false);
      });
  }

  useEffect(() => {
    fetchPlayers();
    fetchPendingBans();
  }, []);

  useEffect(() => {
    if (activePage === "Banned Players" && !useDummyData) fetchBannedPlayers();
  }, [activePage]);

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
                  <PlayerListItem key={player.public_cd_key} {...player} isPending={pendingBanKeys.has(player.public_cd_key)} onBan={() => banPlayer(player.public_cd_key)} />
                ))}
              </div>
            )}
          </>
        )}
        {activePage === "Banned Players" && (
          <>
            <div className="list-toolbar">
              <div />
              <button className="refresh-btn" onClick={fetchBannedPlayers}>⟳ Refresh</button>
            </div>
            {bannedLoading && <p>Loading...</p>}
            {bannedError && <p style={{ color: "#c0323a" }}>Error: {bannedError}</p>}
            {!bannedLoading && !bannedError && (
              <div className="banned-list">
                <div className="banned-list__header">
                  <span>Player</span><span>CD Key</span><span>IP Address</span>
                  <span>Banned By</span><span>Banned At</span><span></span>
                </div>
                {bannedPlayers.length === 0
                  ? <p style={{ gridColumn: "1 / -1", padding: "12px 0" }}>No banned players.</p>
                  : bannedPlayers.map((p) => <BannedPlayerItem key={p.public_cd_key} {...p} onUnban={() => unbanPlayer(p.public_cd_key)} />)
                }
              </div>
            )}
          </>
        )}
        {activePage === "Player Search" && <p>Player Search — coming soon.</p>}
      </div>
    </div>
  );
}

export default App;
