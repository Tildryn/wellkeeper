import { useState, useEffect, useMemo } from "react";
import dummy_data from "./players.json";
import PlayerListItem from "./PlayerListItem";
import BannedPlayerItem from "./BannedPlayerItem";
import PlayerSearchItem from "./PlayerSearchItem";
import "./BannedPlayerItem.css";
import "./PlayerSearchItem.css";
import Navbar from "./Navbar";
import SortBar from "./SortBar";
import LoginPage from "./LoginPage";
import MyCDKeysPage from "./MyCDKeysPage";
import RegisterPage from "./RegisterPage";
import PrivacyPage from "./PrivacyPage";
import { PAGES } from "./pages";
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
  const [authToken, setAuthToken] = useState(null);
  const [authView, setAuthView] = useState("login");
  const [registerPrefill, setRegisterPrefill] = useState({ email: "", password: "" });
  const [activePage, setActivePage] = useState(PAGES.ONLINE_PLAYERS);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [playerSessions, setPlayerSessions] = useState([]);
  const [cdKeys, setCdKeys] = useState([]);
  const [cdKeysLoading, setCdKeysLoading] = useState(false);
  const [cdKeysError, setCdKeysError] = useState(null);

  const useDummyData = import.meta.env.VITE_USE_DUMMY_DATA === "true";

  const isDM = useMemo(() => cdKeys.some((k) => k.dm), [cdKeys]);

  function authHeaders(extra = {}) {
    return authToken
      ? { Authorization: `Bearer ${authToken}`, ...extra }
      : { ...extra };
  }

  useEffect(() => {
    if (!authToken) {
      setCdKeys([]);
      return;
    }
    setCdKeysLoading(true);
    setCdKeysError(null);
    fetch(`${import.meta.env.VITE_API_URL}/linked_cd_keys`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json();
      })
      .then((data) => {
        const keys = data.cd_keys ?? [];
        setCdKeys(keys);
        setCdKeysLoading(false);
        if (!keys.some((k) => k.dm)) setActivePage(PAGES.MY_CD_KEYS);
      })
      .catch((err) => {
        setCdKeysError(err.message);
        setCdKeysLoading(false);
        setActivePage(PAGES.MY_CD_KEYS);
      });
  }, [authToken]);

  function navigateTo(page) {
    if (page === PAGES.ONLINE_PLAYERS) setLoading(true);
    setActivePage(page);
  }

  function fetchPlayers(silent = false) {
    if (useDummyData) {
      setPlayers(dummy_data);
      return;
    }
    if (!silent) { setLoading(true); setError(null); }
    const getJson = (url) =>
      fetch(url, { cache: "no-store", headers: authHeaders() }).then((res) => {
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
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ public_cd_key: cdKey }),
    });
  }

  function unbanPlayer(cdKey) {
    if (useDummyData) return;
    fetch(`${import.meta.env.VITE_API_URL}/unban`, {
      method: "DELETE",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ public_cd_key: cdKey }),
    }).then((res) => {
      if (res.ok) setBannedPlayers((prev) => prev.filter((p) => p.public_cd_key !== cdKey));
    });
  }

  function fetchBannedPlayers() {
    setBannedLoading(true);
    setBannedError(null);
    fetch(`${import.meta.env.VITE_API_URL}/banned_players`, { cache: "no-store", headers: authHeaders() })
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
    const getJson = (url) =>
      fetch(url, { cache: "no-store", headers: authHeaders() }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    Promise.allSettled([
      getJson(`${import.meta.env.VITE_API_URL}/player_data`),
      getJson(`${import.meta.env.VITE_API_URL}/player_sessions`),
    ]).then(([playerResult, sessionResult]) => {
      if (playerResult.status === "fulfilled")
        setPlayerSearchData(Array.isArray(playerResult.value) ? playerResult.value.filter((e) => e.public_cd_key) : []);
      else setSearchError(playerResult.reason.message);
      if (sessionResult.status === "fulfilled" && Array.isArray(sessionResult.value))
        setPlayerSessions(sessionResult.value);
      setSearchLoading(false);
    });
  }

  useEffect(() => {
    if (!authToken && !useDummyData) return;
    if (!isDM && !useDummyData) return;
    if (activePage === PAGES.ONLINE_PLAYERS) {
      fetchPlayers();
      if (useDummyData) return;
      const id = setInterval(() => fetchPlayers(true), 10000);
      return () => clearInterval(id);
    }
    if (activePage === PAGES.BANNED_PLAYERS) {
      if (useDummyData) return;
      fetchBannedPlayers();
      const id = setInterval(fetchBannedPlayers, 10000);
      return () => clearInterval(id);
    }
    if (activePage === PAGES.ALL_PLAYERS) {
      if (useDummyData) return;
      if (playerSearchData.length === 0 || playerSessions.length === 0) fetchPlayerSearch();
    }
  }, [activePage, authToken, isDM]);

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

  const sessionMap = useMemo(() => {
    const map = {};
    playerSessions.forEach((s) => { map[s.public_cd_key] = s; });
    return map;
  }, [playerSessions]);

  const filteredPlayerSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? playerSearchData.filter((entry) => {
          if (entry.public_cd_key?.toLowerCase().includes(q)) return true;
          if (entry.player_names?.some((n) => n.toLowerCase().includes(q))) return true;
          if (entry.ip_addresses?.some((ip) => ip.toLowerCase().includes(q))) return true;
          if (entry.characters?.some((c) =>
            c.pcid?.toLowerCase().includes(q) || c.character_name?.toLowerCase().includes(q)
          )) return true;
          return false;
        })
      : playerSearchData;
    return [...filtered].sort((a, b) => {
      const ta = sessionMap[a.public_cd_key]?.logged_off_at ?? "";
      const tb = sessionMap[b.public_cd_key]?.logged_off_at ?? "";
      return tb < ta ? -1 : tb > ta ? 1 : 0;
    });
  }, [playerSearchData, searchQuery, sessionMap]);

  function handleBannedSort(key) {
    if (key === bannedSortKey) {
      setBannedSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setBannedSortKey(key);
      setBannedSortDir("asc");
    }
  }

  if (!authToken) {
    if (authView === "privacy") {
      return <PrivacyPage onBack={() => setAuthView("login")} />;
    }
    if (authView === "register") {
      return (
        <RegisterPage
          initialEmail={registerPrefill.email}
          initialPassword={registerPrefill.password}
          onBack={() => setAuthView("login")}
          onRegistered={() => setAuthView("login")}
          onPrivacy={() => setAuthView("privacy")}
        />
      );
    }
    return (
      <LoginPage
        onLogin={(token) => setAuthToken(token)}
        onRegister={(email, password) => {
          setRegisterPrefill({ email, password });
          setAuthView("register");
        }}
        onPrivacy={() => setAuthView("privacy")}
      />
    );
  }

  if (cdKeysLoading) {
    return (
      <div className="App">
        <Navbar activePage={activePage} onNavigate={navigateTo} isDM={false} onLogout={() => setAuthToken(null)} />
        <div className="page-content"><p>Verifying access…</p></div>
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar activePage={activePage} onNavigate={navigateTo} isDM={isDM} onLogout={() => setAuthToken(null)} />
      <div className="page-content">
        {isDM && activePage === PAGES.ONLINE_PLAYERS && (
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
        {isDM && activePage === PAGES.BANNED_PLAYERS && (
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
        {isDM && activePage === PAGES.ALL_PLAYERS && (
          <>
<div className="list-toolbar">
              <input
                className="search-input"
                type="text"
                placeholder="Search by name, CD key, IP, character…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="refresh-btn" onClick={fetchPlayerSearch}>⟳ Refresh</button>
            </div>
            <span className="result-count">
              {filteredPlayerSearch.length} of {playerSearchData.length} result{playerSearchData.length !== 1 ? "s" : ""} — sorted by last logout
            </span>
            {searchLoading && <p>Loading...</p>}
            {searchError && <p style={{ color: "#c0323a" }}>Error: {searchError}</p>}
            {!searchLoading && !searchError && (
              <div className="search-list">
                {filteredPlayerSearch.length === 0
                  ? <p>No results.</p>
                  : (() => {
                      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
                        .toISOString().slice(0, 19).replace("T", " ");
                      const dividerIndex = filteredPlayerSearch.findIndex(
                        (e) => (sessionMap[e.public_cd_key]?.logged_off_at ?? "") < cutoff
                      );
                      const insertAt = dividerIndex === -1 ? filteredPlayerSearch.length : dividerIndex;
                      const divider = (
                        <div key="__divider" className="search-list__divider">
                          <span>Older than 24 hours</span>
                        </div>
                      );
                      const cards = filteredPlayerSearch.map((entry) => (
                        <PlayerSearchItem
                          key={entry.public_cd_key}
                          {...entry}
                          isBanned={bannedKeySet.has(entry.public_cd_key)}
                          isPending={pendingBanKeys.has(entry.public_cd_key)}
                          onBan={() => banPlayer(entry.public_cd_key)}
                          onUnban={() => unbanPlayer(entry.public_cd_key)}
                          session={sessionMap[entry.public_cd_key] ?? null}
                        />
                      ));
                      return [...cards.slice(0, insertAt), divider, ...cards.slice(insertAt)];
                    })()
                }
              </div>
            )}
          </>
        )}
        {activePage === PAGES.MY_CD_KEYS && (
          <MyCDKeysPage
            authToken={authToken}
            cdKeys={cdKeys}
            cdKeysLoading={cdKeysLoading}
            cdKeysError={cdKeysError}
          />
        )}
      </div>
    </div>
  );
}

export default App;
