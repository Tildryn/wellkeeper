import { useState, useEffect, useRef } from "react";
import "./PlayerSearchItem.css";
import "./PlayerListItem.css";
import "./BannedPlayerItem.css";
import CharacterButtons from "./CharacterButtons";
import BannedPlayerItem from "./BannedPlayerItem";
import type { Character, Ban, PlayerSession, BanEditFields, ExpandGen, CharacterView, NotesView } from "./types";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface TagListProps {
  items: string[];
}

function TagList({ items }: TagListProps) {
  if (!items || items.length === 0) return <span className="search-card__empty">—</span>;
  const sorted = [...items].sort((a, b) => a.length - b.length);
  return (
    <div className="search-card__tags">
      {sorted.map((item) => (
        <code key={item} className="search-card__tag">{item}</code>
      ))}
    </div>
  );
}

interface CharacterListProps {
  characters: Character[];
  // The key the characters are listed under, whose account notes Notes shows.
  cdKey: string;
  onView: (view: CharacterView) => void;
  onNotes?: (view: NotesView) => void;
}

function CharacterList({ characters, cdKey, onView, onNotes }: CharacterListProps) {
  if (!characters || characters.length === 0) return <span className="search-card__empty">—</span>;
  return (
    <div className="search-card__character-list">
      {characters.map(({ pcid, character_name, inner_world, notes }) => (
        <div key={pcid} className="search-card__character">
          <span className="search-card__char-name">{character_name || "Unknown"}</span>
          <code className="search-card__pcid">{pcid}</code>
          <div className="search-card__char-actions">
            <CharacterButtons
              withText
              name={character_name}
              innerWorld={inner_world}
              notes={notes}
              onDescription={() => onView({ kind: "description", pcid, name: character_name })}
              onInnerWorld={() => onView({ kind: "inner_world", pcid, name: character_name })}
              onNotes={onNotes && (() => onNotes({ pcid, name: character_name, cdKey }))}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}

interface BanSummaryRowProps {
  ban: Ban;
  onClick: () => void;
}

function BanSummaryRow({ ban, onClick }: BanSummaryRowProps) {
  const isActive = !ban.ban_end || new Date(ban.ban_end) > new Date();
  const statusLabel = isActive ? "Active" : ban.ban_lifter ? "Lifted" : "Expired";
  return (
    <button className="search-card__ban-row" onClick={onClick} aria-label={`View ban #${ban.ban_id} details`}>
      <code className="search-card__ban-id">#{ban.ban_id}</code>
      <span className={`banned-card__type banned-card__type--${ban.ban_temporary ? "temporary" : "permanent"}`}>
        {ban.ban_temporary ? "Temporary" : "Permanent"}
      </span>
      <span className={`banned-card__status banned-card__status--${statusLabel.toLowerCase()}`}>
        {statusLabel}
      </span>
      <span className="search-card__session">{formatTs(ban.ban_start)}</span>
    </button>
  );
}

interface PlayerSearchItemProps {
  public_cd_key: string;
  player_names: string[];
  ip_addresses: string[];
  characters: Character[];
  onBan: () => void;
  onUnban: () => void;
  isBanned: boolean;
  session: PlayerSession | null;
  playerBans: Ban[];
  onUnbanById: (banId: number) => void;
  onExpungeById: (banId: number) => void;
  onEditBanById: (banId: number, fields: BanEditFields) => Promise<void>;
  onView: (view: CharacterView) => void;
  onNotes?: (view: NotesView) => void;
  expandGen: ExpandGen | null;
}

function PlayerSearchItem({ public_cd_key, player_names, ip_addresses, characters, onBan, onUnban, isBanned, session, playerBans, onUnbanById, onExpungeById, onEditBanById, onView, onNotes, expandGen }: PlayerSearchItemProps) {
  const [selectedBan, setSelectedBan] = useState<Ban | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [charsExpanded, setCharsExpanded] = useState(() => window.innerWidth > 600);
  const [bansExpanded, setBansExpanded] = useState(() => window.innerWidth > 600);

  const banDetailRef = useRef<HTMLDivElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const confirmYesRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { if (confirming) confirmYesRef.current?.focus(); }, [confirming]);

  useEffect(() => {
    if (!expandGen || expandGen.expanded === null) return;
    setCharsExpanded(expandGen.expanded);
    setBansExpanded(expandGen.expanded);
  }, [expandGen]);

  function openBanDetail(ban: Ban) {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    setSelectedBan(ban);
  }

  function closeBanDetail() {
    setSelectedBan(null);
  }

  useEffect(() => {
    if (!selectedBan) return;
    const first = banDetailRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => prevFocusRef.current?.focus();
  }, [selectedBan?.ban_id]);

  function handleDetailKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { closeBanDetail(); return; }
    if (e.key !== "Tab") return;
    const focusable = Array.from(banDetailRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function handleConfirm() {
    setConfirming(false);
    if (isBanned) onUnban(); else onBan();
  }

  const charsId = `chars-${public_cd_key}`;
  const bansId = `bans-${public_cd_key}`;

  return (
    <div className="search-card">
      <div className="search-card__header">
        <span className="search-card__label">CD Key</span>
        <code className="search-card__cdkey">{public_cd_key}</code>
        <div className="search-card__header-actions">
          {isBanned
            ? <button className="banned-card__unban-btn" onClick={() => setConfirming(true)} disabled={confirming}>Unban</button>
            : <button className="player-card__ban-btn" onClick={() => setConfirming(true)} disabled={confirming}>Ban</button>
          }
          {confirming && (
            <div className="cdkeys-confirm">
              <span className="cdkeys-confirm__label">{isBanned ? "Unban?" : "Ban?"}</span>
              <button ref={confirmYesRef} className="cdkeys-confirm__yes" aria-label={isBanned ? "Confirm unban" : "Confirm ban"} onClick={handleConfirm}>Yes</button>
              <button className="cdkeys-confirm__no" aria-label={isBanned ? "Cancel unban" : "Cancel ban"} onClick={() => setConfirming(false)}>No</button>
            </div>
          )}
        </div>
      </div>
      <div className="search-card__row">
        <span className="search-card__label">Names</span>
        <TagList items={player_names} />
      </div>
      <div className="search-card__row">
        <span className="search-card__label">IP Addresses</span>
        <TagList items={ip_addresses} />
      </div>
      <div className={`search-card__row search-card__row--characters${charsExpanded ? " search-card__row--chars-open" : ""}`}>
        <button
          className="search-card__collapsible-toggle"
          onClick={() => setCharsExpanded(v => !v)}
          aria-expanded={charsExpanded}
          aria-controls={charsId}
        >
          <span className="search-card__label">Characters</span>
          {!charsExpanded && characters && characters.length > 0 && (
            <span className="search-card__collapsible-count">({characters.length})</span>
          )}
          <span className="search-card__collapsible-chevron" aria-hidden="true">{charsExpanded ? "▴" : "▾"}</span>
        </button>
        <div id={charsId}>
          <CharacterList characters={characters} cdKey={public_cd_key} onView={onView} onNotes={onNotes} />
        </div>
      </div>
      <div className="search-card__row search-card__row--session">
        <span className="search-card__label">Last Login</span>
        <span className="search-card__session">{formatTs(session?.logged_on_at)}</span>
        <span className="search-card__session-sep">–</span>
        <span className="search-card__session-group">
          <span className="search-card__session-label">Logout</span>
          <span className="search-card__session">{formatTs(session?.logged_off_at)}</span>
        </span>
      </div>
      {playerBans && playerBans.length > 0 && (
        <div className={`search-card__row search-card__row--bans${bansExpanded ? " search-card__row--bans-open" : ""}`}>
          <button
            className="search-card__collapsible-toggle"
            onClick={() => setBansExpanded(v => !v)}
            aria-expanded={bansExpanded}
            aria-controls={bansId}
          >
            <span className="search-card__label">Bans</span>
            {!bansExpanded && (
              <span className="search-card__collapsible-count">({playerBans.length})</span>
            )}
            <span className="search-card__collapsible-chevron" aria-hidden="true">{bansExpanded ? "▴" : "▾"}</span>
          </button>
          <div id={bansId} className="search-card__ban-list">
            {playerBans.map((ban) => (
              <BanSummaryRow key={ban.ban_id} ban={ban} onClick={() => openBanDetail(ban)} />
            ))}
          </div>
        </div>
      )}
      {selectedBan && (
        <div className="ban-modal__overlay" onClick={closeBanDetail}>
          <div
            className="ban-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ban-detail-title"
            ref={banDetailRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleDetailKeyDown}
          >
            <h2 id="ban-detail-title" className="sr-only">Ban details — #{selectedBan.ban_id}</h2>
            <BannedPlayerItem
              {...selectedBan}
              onUnban={() => { onUnbanById(selectedBan.ban_id); closeBanDetail(); }}
              onExpunge={() => { onExpungeById(selectedBan.ban_id); closeBanDetail(); }}
              onEditBan={(fields) => onEditBanById(selectedBan.ban_id, fields)}
            />
            <button className="ban-modal__cancel ban-detail-modal__close" onClick={closeBanDetail}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerSearchItem;
