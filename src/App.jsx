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
import BanModal from "./BanModal";
import RegisterPage from "./RegisterPage";
import PrivacyPage from "./PrivacyPage";
import SettingsPage from "./SettingsPage";
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
  const [bannedSortKey, setBannedSortKey] = useState("ban_start");
  const [bannedSortDir, setBannedSortDir] = useState("desc");
  const [playerSearchData, setPlayerSearchData] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bannedSearchQuery, setBannedSearchQuery] = useState("");
  const [playerSessions, setPlayerSessions] = useState([]);
  const [cdKeys, setCdKeys] = useState([]);
  const [cdKeysLoading, setCdKeysLoading] = useState(false);
  const [cdKeysError, setCdKeysError] = useState(null);
  const [accountUuid, setAccountUuid] = useState(null);
  const [banTarget, setBanTarget] = useState(null);

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
      setAccountUuid(null);
      return;
    }
    setCdKeysLoading(true);
    setCdKeysError(null);
    const getJson = (url) =>
      fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${authToken}` } })
        .then((res) => {
          if (!res.ok) throw new Error(`Server error (${res.status}).`);
          return res.json();
        });
    Promise.allSettled([
      getJson(`${import.meta.env.VITE_API_URL}/linked_cd_keys`),
      getJson(`${import.meta.env.VITE_API_URL}/account_uuid`),
    ]).then(([keysResult, uuidResult]) => {
      const keys = keysResult.status === "fulfilled" ? (keysResult.value.cd_keys ?? []) : [];
      setCdKeys(keys);
      setCdKeysError(keysResult.status === "rejected" ? keysResult.reason.message : null);
      if (uuidResult.status === "fulfilled") setAccountUuid(uuidResult.value.uuid ?? uuidResult.value ?? null);
      setCdKeysLoading(false);
      if (!keys.some((k) => k.dm)) setActivePage(PAGES.MY_CD_KEYS);
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
    getJson(`${import.meta.env.VITE_API_URL}/online_players`)
      .then((data) => {
        setPlayers(data);
        if (!silent) setLoading(false);
      })
      .catch((err) => {
        if (!silent) { setError(err.message); setLoading(false); }
      });
  }

  function openBanModal(cdKeys, playerNames, ipAddresses) {
    setBanTarget({ cdKeys, playerNames, ipAddresses });
  }

  function banPlayer({ ban_reason, ban_temporary, ban_end }) {
    if (!banTarget) return;
    const { cdKeys, playerNames, ipAddresses } = banTarget;
    setBanTarget(null);
    if (useDummyData) return;
    fetch(`${import.meta.env.VITE_API_URL}/bans`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        public_cd_keys: cdKeys,
        player_names:   playerNames,
        ip_addresses:   ipAddresses,
        ban_reason,
        ban_temporary,
        ban_end,
      }),
    }).then((res) => {
      if (res.ok) fetchBannedPlayers();
    });
  }

  function unbanPlayer(banId) {
    if (useDummyData) return;
    const ban = bannedPlayers.find((p) => p.ban_id === banId);
    fetch(`${import.meta.env.VITE_API_URL}/unban`, {
      method: "DELETE",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ban_id: banId }),
    }).then(async (res) => {
      if (res.ok) {
        setBannedPlayers((prev) => prev.filter((p) => p.ban_id !== banId));
      } else {
        const text = await res.text().catch(() => "");
        console.error(`Unban failed (${res.status}):`, text);
        alert(`Unban failed (${res.status})${text ? ": " + text : ""}`);
      }
    }).catch((err) => {
      console.error("Unban request error:", err);
      alert("Unban request failed: " + err.message);
    });
  }

  function fetchBannedPlayers() {
    setBannedLoading(true);
    setBannedError(null);
    fetch(`${import.meta.env.VITE_API_URL}/bans`, { cache: "no-store", headers: authHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((bans) =>
        Promise.allSettled(
          bans.map((b) =>
            fetch(`${import.meta.env.VITE_API_URL}/bans/${b.ban_id}`, { cache: "no-store", headers: authHeaders() })
              .then((r) => r.ok ? r.json() : { ban_id: b.ban_id, cd_keys: [], player_names: [], ip_addresses: [] })
              .catch(() => ({ ban_id: b.ban_id, cd_keys: [], player_names: [], ip_addresses: [] }))
          )
        ).then((results) => {
          const detailMap = {};
          results.forEach((r) => { if (r.status === "fulfilled") detailMap[r.value.ban_id] = r.value; });
          return bans.map((b) => ({ ...b, ...(detailMap[b.ban_id] ?? { cd_keys: [], player_names: [], ip_addresses: [] }) }));
        })
      )
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
      fetchBannedPlayers();
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

  const bannedKeySet = useMemo(() => new Set(bannedPlayers.flatMap((b) => b.cd_keys ?? [])), [bannedPlayers]);

  const dmKeySet = useMemo(() => new Set(cdKeys.filter((k) => k.dm).map((k) => k.public_cd_key)), [cdKeys]);

  const cdKeyToBanId = useMemo(() => {
    const map = {};
    bannedPlayers.forEach((b) => { (b.cd_keys ?? []).forEach((k) => { map[k] = b.ban_id; }); });
    return map;
  }, [bannedPlayers]);

  const sortedBannedPlayers = useMemo(
    () => sortPlayers(bannedPlayers, bannedSortKey, bannedSortDir),
    [bannedPlayers, bannedSortKey, bannedSortDir]
  );

  const filteredBannedPlayers = useMemo(() => {
    const q = bannedSearchQuery.trim().toLowerCase();
    if (!q) return sortedBannedPlayers;
    return sortedBannedPlayers.filter((b) => {
      if (b.cd_keys?.some((k) => k.toLowerCase().includes(q))) return true;
      if (b.player_names?.some((n) => n.toLowerCase().includes(q))) return true;
      if (b.ip_addresses?.some((ip) => ip.toLowerCase().includes(q))) return true;
      if (b.ban_reason?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [sortedBannedPlayers, bannedSearchQuery]);

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
        <Navbar activePage={activePage} onNavigate={navigateTo} isDM={false} accountUuid={accountUuid} onLogout={() => setAuthToken(null)} />
        <div className="page-content"><p>Verifying access…</p></div>
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar activePage={activePage} onNavigate={navigateTo} isDM={isDM} accountUuid={accountUuid} onLogout={() => setAuthToken(null)} />
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
                  <span>IP Address</span><span>Logged On</span><span></span><span></span>
                </div>
                {onlinePlayers.map((player) => (
                  <PlayerListItem key={player.public_cd_key} {...player} isBanned={bannedKeySet.has(player.public_cd_key)} isDM={dmKeySet.has(player.public_cd_key)} onBan={() => openBanModal([player.public_cd_key], player.online_player_name ? [player.online_player_name] : [], player.ip_address ? [player.ip_address] : [])} onUnban={() => unbanPlayer(cdKeyToBanId[player.public_cd_key])} />
                ))}
              </div>
            )}
          </>
        )}
        {isDM && activePage === PAGES.BANNED_PLAYERS && (
          <>
            <div className="list-toolbar">
              <input
                className="search-input"
                type="text"
                placeholder="Search by name, CD key, IP, reason…"
                value={bannedSearchQuery}
                onChange={(e) => setBannedSearchQuery(e.target.value)}
              />
              <SortBar
                sortKey={bannedSortKey}
                sortDir={bannedSortDir}
                onSort={handleBannedSort}
                fields={[
                  { key: "ban_start", label: "Banned At" },
                  { key: "ban_end",   label: "Expires" },
                ]}
              />
              <button className="refresh-btn" onClick={fetchBannedPlayers}>⟳ Refresh</button>
            </div>
            {bannedLoading && <p>Loading...</p>}
            {bannedError && <p style={{ color: "#c0323a" }}>Error: {bannedError}</p>}
            {!bannedLoading && !bannedError && (
              <div className="search-list">
                {filteredBannedPlayers.length === 0
                  ? <p style={{ padding: "12px 0" }}>{bannedPlayers.length === 0 ? "No banned players." : "No results."}</p>
                  : filteredBannedPlayers.map((p) => <BannedPlayerItem key={p.ban_id} {...p} onUnban={() => unbanPlayer(p.ban_id)} />)
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
                          onBan={() => openBanModal([entry.public_cd_key], entry.player_names ?? [], entry.ip_addresses ?? [])}
                          onUnban={() => unbanPlayer(cdKeyToBanId[entry.public_cd_key])}
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
        {activePage === PAGES.SETTINGS && (
          <SettingsPage
            authToken={authToken}
            onEmailChanged={(token) => setAuthToken(token)}
          />
        )}
      </div>
      {banTarget && (
        <BanModal
          target={banTarget}
          onConfirm={banPlayer}
          onCancel={() => setBanTarget(null)}
        />
      )}
    </div>
  );
}

export default App;
