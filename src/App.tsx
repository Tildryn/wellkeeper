import { useState, useEffect, useMemo, useRef } from "react";
import EditLockContext from "./EditLockContext";
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
import CharacterTextModal from "./CharacterTextModal";
import NotesModal from "./NotesModal";
import LocationModal from "./LocationModal";
import RegisterPage from "./RegisterPage";
import PrivacyPage from "./PrivacyPage";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ResetPasswordPage from "./ResetPasswordPage";
import SettingsPage from "./SettingsPage";
import EconomyPage from "./EconomyPage";
import DemographicsPage from "./DemographicsPage";
import MetricsPage from "./MetricsPage";
import { IconRefresh } from "./Icons";
import { PAGES, PAGE_TITLES, type Page } from "./pages";
import type { OnlinePlayer, Ban, BanBase, BanDetails, PlayerData, PlayerSession, CdKey, BanTarget, BanPayload, BanEditFields, ExpandGen, CharacterView, InnerWorldState, LocationView, NotesView } from "./types";
import "./App.css";

type AuthView = "login" | "register" | "reset_password" | "forgot_password" | "privacy";

function sortPlayers(players: OnlinePlayer[], key: string, dir: string): OnlinePlayer[] {
  return [...players].sort((a, b) => {
    const av = a[key as keyof OnlinePlayer] as string;
    const bv = b[key as keyof OnlinePlayer] as string;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [authView, setAuthView] = useState<AuthView>(() =>
    new URLSearchParams(window.location.search).get("token") ? "reset_password" : "login"
  );
  const [registerPrefill, setRegisterPrefill] = useState({ email: "", password: "" });
  const [activePage, setActivePage] = useState<Page>(PAGES.ONLINE_PLAYERS);
  const [sortKey, setSortKey] = useState("logged_on_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [players, setPlayers] = useState<OnlinePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBansData, setActiveBansData] = useState<Ban[]>([]);
  const [activeBansLoading, setActiveBansLoading] = useState(false);
  const [activeBansError, setActiveBansError] = useState<string | null>(null);
  const [bannedPlayers, setBannedPlayers] = useState<Ban[]>([]);
  const [bannedLoading, setBannedLoading] = useState(false);
  const [bannedError, setBannedError] = useState<string | null>(null);
  const [playerSearchData, setPlayerSearchData] = useState<PlayerData[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bannedSearchQuery, setBannedSearchQuery] = useState("");
  const [bansFilter, setBansFilter] = useState("active");
  const [playerSessions, setPlayerSessions] = useState<PlayerSession[]>([]);
  const [cdKeys, setCdKeys] = useState<CdKey[]>([]);
  const [cdKeysLoading, setCdKeysLoading] = useState(false);
  const [cdKeysError, setCdKeysError] = useState<string | null>(null);
  const [accountUuid, setAccountUuid] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<BanTarget | null>(null);
  const [characterView, setCharacterView] = useState<CharacterView | null>(null);
  const [locationView, setLocationView] = useState<LocationView | null>(null);
  const [notesView, setNotesView] = useState<NotesView | null>(null);
  const [expandGen, setExpandGen] = useState<ExpandGen>({ v: 0, expanded: null });
  const [onlineExpandGen, setOnlineExpandGen] = useState<ExpandGen>({ v: 0, expanded: null });
  const [actionError, setActionError] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const useDummyData = import.meta.env.VITE_USE_DUMMY_DATA === "true";
  const editLockRef = useRef(false);
  function setEditActive(active: boolean) { editLockRef.current = active; }

  const isDM = useMemo(() => cdKeys.some((k) => k.dm), [cdKeys]);

  useEffect(() => {
    const pageTitle = PAGE_TITLES[activePage];
    document.title = pageTitle ? `${pageTitle} — Wellkeeper` : "Wellkeeper — NWN Server Administration";
    setActionError(null);
    mainRef.current?.focus();
  }, [activePage]);

  function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return authToken
      ? { Authorization: `Bearer ${authToken}`, ...extra }
      : { ...extra };
  }

  useEffect(() => {
    if (!authToken) {
      setCdKeys([]);
      setAccountUuid(null);
      setDisplayName(null);
      return;
    }
    setCdKeysLoading(true);
    setCdKeysError(null);
    const getJson = (url: string) =>
      fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${authToken}` } })
        .then((res) => {
          if (!res.ok) throw new Error(`Server error (${res.status}).`);
          return res.json();
        });
    Promise.allSettled([
      getJson(`${import.meta.env.VITE_API_URL}/linked_cd_keys`),
      getJson(`${import.meta.env.VITE_API_URL}/account_uuid`),
      getJson(`${import.meta.env.VITE_API_URL}/display_name`),
    ]).then(([keysResult, uuidResult, displayNameResult]) => {
      const keys: CdKey[] = keysResult.status === "fulfilled" ? (keysResult.value.cd_keys ?? []) : [];
      setCdKeys(keys);
      setCdKeysError(keysResult.status === "rejected" ? keysResult.reason.message : null);
      if (uuidResult.status === "fulfilled") setAccountUuid(uuidResult.value.uuid ?? uuidResult.value ?? null);
      if (displayNameResult.status === "fulfilled") setDisplayName(displayNameResult.value.display_name || null);
      setCdKeysLoading(false);
      if (!keys.some((k) => k.dm)) setActivePage(PAGES.MY_CD_KEYS);
    });
  }, [authToken]);

  function fetchCdKeys() {
    fetch(`${import.meta.env.VITE_API_URL}/linked_cd_keys`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${authToken ?? ""}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ cd_keys?: CdKey[] }>;
      })
      .then((data) => setCdKeys(data.cd_keys ?? []))
      .catch(() => {});
  }

  function navigateTo(page: Page) {
    if (page === PAGES.ONLINE_PLAYERS) setLoading(true);
    setActivePage(page);
  }

  function fetchPlayers(silent = false) {
    if (useDummyData) {
      setPlayers(dummy_data as OnlinePlayer[]);
      return;
    }
    if (!silent) { setLoading(true); setError(null); }
    const getJson = (url: string) =>
      fetch(url, { cache: "no-store", headers: authHeaders() }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<OnlinePlayer[]>;
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

  function openBanModal(cdKeys: string[], playerNames: string[], ipAddresses: string[]) {
    setBanTarget({ cdKeys, playerNames, ipAddresses });
  }

  // Once a DM has been shown a character's Inner World, stop its button
  // glowing everywhere it appears, rather than wait for the next fetch of
  // each list (the player search is never re-fetched on its own).
  function setInnerWorldState(pcid: string, state: InnerWorldState) {
    setPlayers((prev) => prev.map((p) => (p.pcid === pcid ? { ...p, inner_world: state } : p)));
    setPlayerSearchData((prev) => prev.map((entry) =>
      entry.characters.some((c) => c.pcid === pcid)
        ? { ...entry, characters: entry.characters.map((c) => (c.pcid === pcid ? { ...c, inner_world: state } : c)) }
        : entry
    ));
  }

  function banPlayer({ ban_reason, ban_temporary, ban_end }: BanPayload) {
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
      if (res.ok) { fetchActiveBans(); fetchBannedPlayers(); }
    });
  }

  function unbanPlayer(banId: number) {
    if (useDummyData) return;
    fetch(`${import.meta.env.VITE_API_URL}/unban`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ban_id: banId }),
    }).then(async (res) => {
      if (res.ok) {
        fetchActiveBans();
        fetchBannedPlayers();
      } else {
        const text = await res.text().catch(() => "");
        console.error(`Unban failed (${res.status}):`, text);
        setActionError(`Unban failed (${res.status})${text ? ": " + text : ""}`);
      }
    }).catch((err) => {
      console.error("Unban request error:", err);
      setActionError("Unban request failed: " + err.message);
    });
  }

  function expungeBan(banId: number) {
    if (useDummyData) return;
    fetch(`${import.meta.env.VITE_API_URL}/expunge`, {
      method: "DELETE",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ban_id: banId }),
    }).then(async (res) => {
      if (res.ok) {
        fetchActiveBans();
        fetchBannedPlayers();
      } else {
        const text = await res.text().catch(() => "");
        console.error(`Expunge failed (${res.status}):`, text);
        setActionError(`Expunge failed (${res.status})${text ? ": " + text : ""}`);
      }
    }).catch((err) => {
      console.error("Expunge request error:", err);
      setActionError("Expunge request failed: " + err.message);
    });
  }

  async function editBan(banId: number, fields: BanEditFields): Promise<void> {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/bans/${banId}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Server error (${res.status}).`);
    }
    fetchActiveBans();
    fetchBannedPlayers();
  }

  function fetchBannedPlayers() {
    setBannedLoading(true);
    setBannedError(null);
    fetch(`${import.meta.env.VITE_API_URL}/bans`, { cache: "no-store", headers: authHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<BanBase[]>;
      })
      .then((bans) =>
        Promise.allSettled(
          bans.map((b) =>
            fetch(`${import.meta.env.VITE_API_URL}/bans/${b.ban_id}`, { cache: "no-store", headers: authHeaders() })
              .then((r) => r.ok ? r.json() as Promise<BanDetails> : { ban_id: b.ban_id, cd_keys: [], player_names: [], ip_addresses: [] } as BanDetails)
              .catch(() => ({ ban_id: b.ban_id, cd_keys: [], player_names: [], ip_addresses: [] } as BanDetails))
          )
        ).then((results) => {
          const detailMap: Record<number, BanDetails> = {};
          results.forEach((r) => { if (r.status === "fulfilled") detailMap[r.value.ban_id] = r.value; });
          return bans.map((b) => {
            const d = detailMap[b.ban_id];
            return { ...b, cd_keys: d?.cd_keys ?? [], player_names: d?.player_names ?? [], ip_addresses: d?.ip_addresses ?? [] } as Ban;
          });
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

  function fetchActiveBans() {
    setActiveBansLoading(true);
    setActiveBansError(null);
    fetch(`${import.meta.env.VITE_API_URL}/active_bans`, { cache: "no-store", headers: authHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<BanBase[]>;
      })
      .then((bans) =>
        Promise.allSettled(
          bans.map((b) =>
            fetch(`${import.meta.env.VITE_API_URL}/bans/${b.ban_id}`, { cache: "no-store", headers: authHeaders() })
              .then((r) => r.ok ? r.json() as Promise<BanDetails> : { ban_id: b.ban_id, cd_keys: [], player_names: [], ip_addresses: [] } as BanDetails)
              .catch(() => ({ ban_id: b.ban_id, cd_keys: [], player_names: [], ip_addresses: [] } as BanDetails))
          )
        ).then((results) => {
          const detailMap: Record<number, BanDetails> = {};
          results.forEach((r) => { if (r.status === "fulfilled") detailMap[r.value.ban_id] = r.value; });
          return bans.map((b) => {
            const d = detailMap[b.ban_id];
            return { ...b, cd_keys: d?.cd_keys ?? [], player_names: d?.player_names ?? [], ip_addresses: d?.ip_addresses ?? [] } as Ban;
          });
        })
      )
      .then((data) => {
        setActiveBansData(data);
        setActiveBansLoading(false);
      })
      .catch((err) => {
        setActiveBansError(err.message);
        setActiveBansLoading(false);
      });
  }

  function fetchPlayerSearch() {
    setSearchLoading(true);
    setSearchError(null);
    const getJson = (url: string) =>
      fetch(url, { cache: "no-store", headers: authHeaders() }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    Promise.allSettled([
      getJson(`${import.meta.env.VITE_API_URL}/player_data`),
      getJson(`${import.meta.env.VITE_API_URL}/player_sessions`),
    ]).then(([playerResult, sessionResult]) => {
      if (playerResult.status === "fulfilled")
        setPlayerSearchData(Array.isArray(playerResult.value) ? (playerResult.value as PlayerData[]).filter((e) => e.public_cd_key) : []);
      else setSearchError(playerResult.reason.message);
      if (sessionResult.status === "fulfilled" && Array.isArray(sessionResult.value))
        setPlayerSessions(sessionResult.value as PlayerSession[]);
      setSearchLoading(false);
    });
  }

  useEffect(() => {
    if (!authToken && !useDummyData) return;
    if (!isDM && !useDummyData) return;
    if (activePage === PAGES.ONLINE_PLAYERS) {
      fetchPlayers();
      if (useDummyData) return;
      fetchActiveBans();
      const id = setInterval(() => fetchPlayers(true), 10000);
      return () => clearInterval(id);
    }
    if (activePage === PAGES.BANS) {
      if (useDummyData) return;
      fetchActiveBans();
      fetchBannedPlayers();
      const id = setInterval(() => { if (!editLockRef.current) fetchActiveBans(); }, 10000);
      return () => clearInterval(id);
    }
    if (activePage === PAGES.ALL_PLAYERS) {
      if (useDummyData) return;
      if (playerSearchData.length === 0 || playerSessions.length === 0) fetchPlayerSearch();
      fetchActiveBans();
      fetchBannedPlayers();
    }
  }, [activePage, authToken, isDM]);

  function handleSort(key: string) {
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
    () => new Set(activeBansData.flatMap((b) => b.cd_keys ?? [])),
    [activeBansData]
  );

  const cdKeyToBanId = useMemo(() => {
    const map: Record<string, number> = {};
    activeBansData.forEach((b) => { (b.cd_keys ?? []).forEach((k) => { map[k] = b.ban_id; }); });
    return map;
  }, [activeBansData]);

  const filteredBannedPlayers = useMemo(() => {
    const q = bannedSearchQuery.trim().toLowerCase();
    if (!q) return activeBansData;
    return activeBansData.filter((b) => {
      if (b.cd_keys?.some((k) => k.toLowerCase().includes(q))) return true;
      if (b.player_names?.some((n) => n.toLowerCase().includes(q))) return true;
      if (b.ip_addresses?.some((ip) => ip.toLowerCase().includes(q))) return true;
      if (b.ban_reason?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [activeBansData, bannedSearchQuery]);

  const inactiveBans = useMemo(
    () => bannedPlayers.filter((b) => b.ban_end && new Date(b.ban_end) <= new Date()),
    [bannedPlayers]
  );

  const filteredAllBans = useMemo(() => {
    const q = bannedSearchQuery.trim().toLowerCase();
    if (!q) return inactiveBans;
    return inactiveBans.filter((b) => {
      if (b.cd_keys?.some((k) => k.toLowerCase().includes(q))) return true;
      if (b.player_names?.some((n) => n.toLowerCase().includes(q))) return true;
      if (b.ip_addresses?.some((ip) => ip.toLowerCase().includes(q))) return true;
      if (b.ban_reason?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [inactiveBans, bannedSearchQuery]);

  const cdKeyToBans = useMemo(() => {
    const map: Record<string, Ban[]> = {};
    bannedPlayers.forEach((b) => {
      (b.cd_keys ?? []).forEach((k) => {
        if (!map[k]) map[k] = [];
        map[k].push(b);
      });
    });
    return map;
  }, [bannedPlayers]);

  const sessionMap = useMemo(() => {
    const map: Record<string, PlayerSession> = {};
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


  if (!authToken) {
    if (authView === "privacy") {
      return <PrivacyPage onBack={() => setAuthView("login")} />;
    }
    if (authView === "forgot_password") {
      return <ForgotPasswordPage onBack={() => setAuthView("login")} />;
    }
    if (authView === "reset_password") {
      return <ResetPasswordPage token={resetToken} onSuccess={() => setAuthView("login")} />;
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
        onForgotPassword={() => setAuthView("forgot_password")}
        onPrivacy={() => setAuthView("privacy")}
      />
    );
  }

  if (cdKeysLoading) {
    return (
      <div className="App">
        <Navbar activePage={activePage} onNavigate={navigateTo} isDM={false} displayName={displayName} onLogout={() => setAuthToken(null)} />
        <main id="main-content" className="page-content"><p role="status">Verifying access…</p></main>
      </div>
    );
  }

  return (
    <EditLockContext.Provider value={setEditActive}>
    <div className="App">
      <Navbar activePage={activePage} onNavigate={navigateTo} isDM={isDM} displayName={displayName} onLogout={() => setAuthToken(null)} />
      <main id="main-content" ref={mainRef} tabIndex={-1} className="page-content">
        <h1 className="sr-only">Wellkeeper</h1>
        {actionError && <p role="alert" style={{ color: "#e05560", fontSize: "13px", margin: "0 0 8px" }}>{actionError}</p>}
        {isDM && activePage === PAGES.ONLINE_PLAYERS && (
          <>
            <h2 className="sr-only">{PAGE_TITLES[PAGES.ONLINE_PLAYERS]}</h2>
            <div className="list-toolbar">
              <SortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} fields={[
                { key: "online_player_name", label: "Name" },
                { key: "character_name",     label: "Character" },
                { key: "logged_on_at",       label: "Logged On" },
              ]} />
              <div className="expand-controls">
                <button className="refresh-btn" onClick={() => setOnlineExpandGen(g => ({ v: g.v + 1, expanded: true }))}>Expand All</button>
                <button className="refresh-btn" onClick={() => setOnlineExpandGen(g => ({ v: g.v + 1, expanded: false }))}>Collapse All</button>
              </div>
              <button className="refresh-btn refresh-btn--refresh" aria-label="Refresh" onClick={() => fetchPlayers()}><IconRefresh /><span className="refresh-btn__label" aria-hidden="true"> Refresh</span></button>
            </div>
            {loading && <p role="status">Loading...</p>}
            {error && <p role="alert" style={{ color: "#c0323a" }}>Error: {error}</p>}
            {!loading && !error && onlinePlayers.length === 0 && (
              <p className="result-count">No players are currently online.</p>
            )}
            {!loading && !error && onlinePlayers.length > 0 && (
              <span className="result-count" aria-live="polite" aria-atomic="true">
                {onlinePlayers.length} player{onlinePlayers.length !== 1 ? "s" : ""} online
              </span>
            )}
            {!loading && !error && onlinePlayers.length > 0 && (
              <div className="player-list">
                <div className="player-list__header">
                  <span>Player</span><span>Character</span><span>CD Key</span>
                  <span>IP Address</span><span>Logged On</span><span></span><span></span>
                </div>
                {onlinePlayers.map((player) => (
                  <PlayerListItem
                    key={player.public_cd_key}
                    {...player}
                    isBanned={bannedKeySet.has(player.public_cd_key)}
                    onBan={() => openBanModal([player.public_cd_key], player.online_player_name ? [player.online_player_name] : [], player.ip_address ? [player.ip_address] : [])}
                    onUnban={() => unbanPlayer(cdKeyToBanId[player.public_cd_key])}
                    onDescription={player.pcid ? () => setCharacterView({ kind: "description", pcid: player.pcid!, name: player.character_name }) : undefined}
                    onInnerWorld={player.pcid ? () => setCharacterView({ kind: "inner_world", pcid: player.pcid!, name: player.character_name }) : undefined}
                    onNotes={player.pcid ? () => setNotesView({ pcid: player.pcid!, name: player.character_name, cdKey: player.public_cd_key }) : undefined}
                    onLocation={player.pcid ? () => setLocationView({ pcid: player.pcid!, name: player.character_name }) : undefined}
                    expandGen={onlineExpandGen}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {isDM && activePage === PAGES.BANS && (
          <>
            <h2 className="sr-only">{PAGE_TITLES[PAGES.BANS]}</h2>
            <div className="list-toolbar">
              <div className="bans-filter">
                <button
                  aria-pressed={bansFilter === "active"}
                  className={`bans-filter__btn${bansFilter === "active" ? " bans-filter__btn--active" : ""}`}
                  onClick={() => { setBansFilter("active"); setBannedSearchQuery(""); }}
                >Active</button>
                <button
                  aria-pressed={bansFilter === "old"}
                  className={`bans-filter__btn${bansFilter === "old" ? " bans-filter__btn--active" : ""}`}
                  onClick={() => { setBansFilter("old"); setBannedSearchQuery(""); }}
                >Old</button>
              </div>
              <input
                className="search-input"
                type="text"
                aria-label="Search bans"
                placeholder="Search by name, CD key, IP, reason…"
                value={bannedSearchQuery}
                onChange={(e) => setBannedSearchQuery(e.target.value)}
              />
              <button className="refresh-btn refresh-btn--refresh" aria-label="Refresh" onClick={bansFilter === "active" ? fetchActiveBans : fetchBannedPlayers}><IconRefresh /><span className="refresh-btn__label" aria-hidden="true"> Refresh</span></button>
            </div>
            <span className="result-count" aria-live="polite" aria-atomic="true">
              {bansFilter === "active"
                ? `${filteredBannedPlayers.length} of ${activeBansData.length} active ban${activeBansData.length !== 1 ? "s" : ""}`
                : `${filteredAllBans.length} of ${inactiveBans.length} old ban${inactiveBans.length !== 1 ? "s" : ""}`}
            </span>
            {bansFilter === "active" && (
              <>
                {activeBansLoading && <p role="status">Loading...</p>}
                {activeBansError && <p role="alert" style={{ color: "#c0323a" }}>Error: {activeBansError}</p>}
                {!activeBansLoading && !activeBansError && (
                  <div className="search-list">
                    {filteredBannedPlayers.length === 0
                      ? <p style={{ padding: "12px 0" }}>{activeBansData.length === 0 ? "No active bans." : "No results."}</p>
                      : filteredBannedPlayers.map((p) => <BannedPlayerItem key={p.ban_id} {...p} onUnban={() => unbanPlayer(p.ban_id)} onExpunge={() => expungeBan(p.ban_id)} onEditBan={(fields) => editBan(p.ban_id, fields)} />)
                    }
                  </div>
                )}
              </>
            )}
            {bansFilter === "old" && (
              <>
                {bannedLoading && <p role="status">Loading...</p>}
                {bannedError && <p role="alert" style={{ color: "#c0323a" }}>Error: {bannedError}</p>}
                {!bannedLoading && !bannedError && (
                  <div className="search-list">
                    {filteredAllBans.length === 0
                      ? <p style={{ padding: "12px 0" }}>{bannedSearchQuery ? "No results." : "No old bans."}</p>
                      : filteredAllBans.map((p) => <BannedPlayerItem key={p.ban_id} {...p} onUnban={() => unbanPlayer(p.ban_id)} onExpunge={() => expungeBan(p.ban_id)} onEditBan={(fields) => editBan(p.ban_id, fields)} />)
                    }
                  </div>
                )}
              </>
            )}
          </>
        )}
        {isDM && activePage === PAGES.ALL_PLAYERS && (
          <>
            <h2 className="sr-only">{PAGE_TITLES[PAGES.ALL_PLAYERS]}</h2>
            <div className="list-toolbar">
              <input
                className="search-input"
                type="text"
                aria-label="Search players"
                placeholder="Search by name, CD key, IP, character…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="refresh-btn" onClick={() => setExpandGen(g => ({ v: g.v + 1, expanded: true }))}>Expand All</button>
              <button className="refresh-btn" onClick={() => setExpandGen(g => ({ v: g.v + 1, expanded: false }))}>Collapse All</button>
              <button className="refresh-btn refresh-btn--refresh" aria-label="Refresh" onClick={fetchPlayerSearch}><IconRefresh /><span className="refresh-btn__label" aria-hidden="true"> Refresh</span></button>
            </div>
            <span className="result-count" aria-live="polite" aria-atomic="true">
              {filteredPlayerSearch.length} of {playerSearchData.length} result{playerSearchData.length !== 1 ? "s" : ""} — sorted by last logout
            </span>
            {searchLoading && <p role="status">Loading...</p>}
            {searchError && <p role="alert" style={{ color: "#c0323a" }}>Error: {searchError}</p>}
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
                        <div key="__divider" className="search-list__divider" role="separator" aria-label="Older than 24 hours">
                          <span aria-hidden="true">Older than 24 hours</span>
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
                          playerBans={cdKeyToBans[entry.public_cd_key] ?? []}
                          onUnbanById={(banId) => unbanPlayer(banId)}
                          onExpungeById={(banId) => expungeBan(banId)}
                          onEditBanById={(banId, fields) => editBan(banId, fields)}
                          onView={setCharacterView}
                          onNotes={setNotesView}
                          expandGen={expandGen}
                        />
                      ));
                      return [...cards.slice(0, insertAt), divider, ...cards.slice(insertAt)];
                    })()
                }
              </div>
            )}
          </>
        )}
        {isDM && activePage === PAGES.ECONOMY && <EconomyPage authToken={authToken} />}
        {isDM && activePage === PAGES.DEMOGRAPHICS && <DemographicsPage authToken={authToken} />}
        {isDM && activePage === PAGES.METRICS && <MetricsPage authToken={authToken} />}
        {activePage === PAGES.MY_CD_KEYS && (
          <MyCDKeysPage
            authToken={authToken}
            cdKeys={cdKeys}
            cdKeysLoading={cdKeysLoading}
            cdKeysError={cdKeysError}
            onDeleted={(key) => setCdKeys((prev) => prev.filter((k) => k.public_cd_key !== key))}
            onRefreshCdKeys={fetchCdKeys}
          />
        )}
        {activePage === PAGES.SETTINGS && (
          <SettingsPage
            authToken={authToken}
            accountUuid={accountUuid}
            displayName={displayName}
            onDisplayNameChanged={(name) => setDisplayName(name)}
          />
        )}
      </main>
      {banTarget && (
        <BanModal
          target={banTarget}
          onConfirm={banPlayer}
          onCancel={() => setBanTarget(null)}
        />
      )}
      {characterView && (
        <CharacterTextModal
          view={characterView}
          authToken={authToken}
          onClose={() => setCharacterView(null)}
          onInnerWorldState={setInnerWorldState}
        />
      )}
      {notesView && (
        <NotesModal
          view={notesView}
          authToken={authToken}
          onClose={() => setNotesView(null)}
        />
      )}
      {locationView && (
        <LocationModal
          view={locationView}
          authToken={authToken}
          onClose={() => setLocationView(null)}
        />
      )}
    </div>
    </EditLockContext.Provider>
  );
}

export default App;
