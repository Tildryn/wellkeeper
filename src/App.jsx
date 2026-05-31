import { useState, useEffect, useMemo } from "react";
import dummy_data from "./players.json";
import PlayerListItem from "./PlayerListItem";
import BannedPlayerItem from "./BannedPlayerItem";
import PlayerSearchItem from "./PlayerSearchItem";
import "./BannedPlayerItem.css";
import "./PlayerSearchItem.css";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bannedPlayers, setBannedPlayers] = useState([]);
  const [bannedLoading, setBannedLoading] = useState(false);
  const [bannedError, setBannedError] = useState(null);
  const [bannedSortKey, setBannedSortKey] = useState("banned_at");
  const [bannedSortDir, setBannedSortDir] = useState("desc");
  const [pendingBanKeys, setPendingBanKeys] = useState(new Set());
  const [playerSearchData, setPlayerSearchData] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const useDummyData = import.meta.env.VITE_USE_DUMMY_DATA === "true";

  function navigateTo(page) {
    if (page === "Online Players") setLoading(true);
    setActivePage(page);
  }

  function fetchPlayers(silent = false) {
    if (useDummyData) {
      setPlayers(dummy_data);
      return;
    }
    if (!silent) { setLoading(true); setError(null); }
    const getJson = (url) =>
      fetch(url, { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    Promise.allSettled([
      getJson(`${import.meta.env.VITE_API_URL}/online_players`),
      getJson(`${import.meta.env.VITE_API_URL}/pending_bans`),
    ]).then(([playersResult, pendingResult]) => {
      if (playersResult.status === "fulfilled") setPlayers(playersResult.value);
      else if (!silent) setError(playersResult.reason.message);
      if (pendingResult.status === "fulfilled" && Array.isArray(pendingResult.value))
        setPendingBanKeys(new Set(pendingResult.value.map((b) => b.public_cd_key)));
      if (!silent) setLoading(false);
    });
  }

  function banPlayer(cdKey) {
    if (useDummyData) return;
    setPendingBanKeys((prev) => new Set(prev).add(cdKey));
    fetch(`${import.meta.env.VITE_API_URL}/pending_bans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_cd_key: cdKey }),
    });
  }

  function unbanPlayer(cdKey) {
    if (useDummyData) return;
    fetch(`${import.meta.env.VITE_API_URL}/unban`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_cd_key: cdKey }),
    }).then((res) => {
      if (res.ok) setBannedPlayers((prev) => prev.filter((p) => p.public_cd_key !== cdKey));
    });
  }

  function fetchBannedPlayers() {
    setBannedLoading(true);
    setBannedError(null);
    fetch(`${import.meta.env.VITE_API_URL}/banned_players`, { cache: "no-store" })
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

  function fetchPlayerSearch() {
    setSearchLoading(true);
    setSearchError(null);
    fetch(`${import.meta.env.VITE_API_URL}/player_data`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setPlayerSearchData(Array.isArray(data) ? data.filter((e) => e.public_cd_key) : []);
        setSearchLoading(false);
      })
      .catch((err) => {
        setSearchError(err.message);
        setSearchLoading(false);
      });
  }

  useEffect(() => {
    if (activePage === "Online Players") {
      fetchPlayers();
      if (useDummyData) return;
      const id = setInterval(() => fetchPlayers(true), 10000);
      return () => clearInterval(id);
    }
    if (activePage === "Banned Players") {
      if (useDummyData) return;
      fetchBannedPlayers();
      const id = setInterval(fetchBannedPlayers, 10000);
      return () => clearInterval(id);
    }
    if (activePage === "Player Search") {
      if (useDummyData) return;
      fetchPlayerSearch();
      const id = setInterval(fetchPlayerSearch, 10000);
      return () => clearInterval(id);
    }
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

  const bannedKeySet = useMemo(
    () => new Set(bannedPlayers.map((p) => p.public_cd_key)),
    [bannedPlayers]
  );

  const sortedBannedPlayers = useMemo(
    () => sortPlayers(bannedPlayers, bannedSortKey, bannedSortDir),
    [bannedPlayers, bannedSortKey, bannedSortDir]
  );

  function handleBannedSort(key) {
    if (key === bannedSortKey) {
      setBannedSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setBannedSortKey(key);
      setBannedSortDir("asc");
    }
  }

  return (
    <div className="App">
      <Navbar activePage={activePage} onNavigate={navigateTo} />
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
              <SortBar
                sortKey={bannedSortKey}
                sortDir={bannedSortDir}
                onSort={handleBannedSort}
                fields={[
                  { key: "player_name", label: "Name" },
                  { key: "public_cd_key", label: "CD Key" },
                  { key: "ip_address", label: "IP Address" },
                  { key: "banned_by", label: "Banned By" },
                  { key: "banned_at", label: "Banned At" },
                ]}
              />
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
                {sortedBannedPlayers.length === 0
                  ? <p style={{ gridColumn: "1 / -1", padding: "12px 0" }}>No banned players.</p>
                  : sortedBannedPlayers.map((p) => <BannedPlayerItem key={p.public_cd_key} {...p} onUnban={() => unbanPlayer(p.public_cd_key)} />)
                }
              </div>
            )}
          </>
        )}
        {activePage === "Player Search" && (
          <>
            <div className="list-toolbar">
              <span className="result-count">{playerSearchData.length} result{playerSearchData.length !== 1 ? "s" : ""}</span>
              <button className="refresh-btn" onClick={fetchPlayerSearch}>⟳ Refresh</button>
            </div>
            {searchLoading && <p>Loading...</p>}
            {searchError && <p style={{ color: "#c0323a" }}>Error: {searchError}</p>}
            {!searchLoading && !searchError && (
              <div className="search-list">
                {playerSearchData.length === 0
                  ? <p>No results.</p>
                  : playerSearchData.map((entry) => (
                      <PlayerSearchItem
                        key={entry.public_cd_key}
                        {...entry}
                        isBanned={bannedKeySet.has(entry.public_cd_key)}
                        isPending={pendingBanKeys.has(entry.public_cd_key)}
                        onBan={() => banPlayer(entry.public_cd_key)}
                        onUnban={() => unbanPlayer(entry.public_cd_key)}
                      />
                    ))
                }
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
