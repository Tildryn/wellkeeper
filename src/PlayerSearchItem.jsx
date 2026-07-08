import { useState } from "react";
import "./PlayerSearchItem.css";
import "./PlayerListItem.css";
import "./BannedPlayerItem.css";
import { IconScroll, IconGlobe } from "./Icons";
import BannedPlayerItem from "./BannedPlayerItem";

function TagList({ items }) {
  if (!items || items.length === 0) return <span className="search-card__empty">—</span>;
  return (
    <div className="search-card__tags">
      {items.map((item) => (
        <code key={item} className="search-card__tag">{item}</code>
      ))}
    </div>
  );
}

function CharacterList({ characters }) {
  if (!characters || characters.length === 0) return <span className="search-card__empty">—</span>;
  return (
    <div className="search-card__character-list">
      {characters.map(({ pcid, character_name }) => (
        <div key={pcid} className="search-card__character">
          <span className="search-card__char-name">{character_name || "Unknown"}</span>
          <code className="search-card__pcid">{pcid}</code>
          <div className="search-card__char-actions">
            <button className="player-card__action-btn player-card__action-btn--with-text" disabled><IconScroll /> Description</button>
            <button className="player-card__action-btn player-card__action-btn--with-text" disabled><IconGlobe /> Inner World</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString();
}

function BanSummaryRow({ ban, onClick }) {
  const isActive = !ban.ban_end || new Date(ban.ban_end) > new Date();
  const statusLabel = isActive ? "Active" : ban.ban_lifter ? "Lifted" : "Expired";
  return (
    <button className="search-card__ban-row" onClick={onClick}>
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

function PlayerSearchItem({ public_cd_key, player_names, ip_addresses, characters, onBan, onUnban, isBanned, session, playerBans, onUnbanById, onExpungeById }) {
  const [selectedBan, setSelectedBan] = useState(null);

  return (
    <div className="search-card">
      <div className="search-card__header">
        <span className="search-card__label">CD Key</span>
        <code className="search-card__cdkey">{public_cd_key}</code>
        <div className="search-card__header-actions">
          {isBanned
            ? <button className="banned-card__unban-btn" onClick={onUnban}>Unban</button>
            : <button className="player-card__ban-btn" onClick={onBan}>Ban</button>
          }
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
      <div className="search-card__row">
        <span className="search-card__label">Characters</span>
        <CharacterList characters={characters} />
      </div>
      <div className="search-card__row">
        <span className="search-card__label">Last Login</span>
        <span className="search-card__session">{formatTs(session?.logged_on_at)}</span>
        <span className="search-card__session-sep">–</span>
        <span className="search-card__session-label">Logout</span>
        <span className="search-card__session">{formatTs(session?.logged_off_at)}</span>
      </div>
      {playerBans && playerBans.length > 0 && (
        <div className="search-card__row">
          <span className="search-card__label">Bans</span>
          <div className="search-card__ban-list">
            {playerBans.map((ban) => (
              <BanSummaryRow key={ban.ban_id} ban={ban} onClick={() => setSelectedBan(ban)} />
            ))}
          </div>
        </div>
      )}
      {selectedBan && (
        <div className="ban-modal__overlay" onClick={() => setSelectedBan(null)}>
          <div className="ban-detail-modal" onClick={(e) => e.stopPropagation()}>
            <BannedPlayerItem
              {...selectedBan}
              onUnban={() => { onUnbanById(selectedBan.ban_id); setSelectedBan(null); }}
              onExpunge={() => { onExpungeById(selectedBan.ban_id); setSelectedBan(null); }}
            />
            <button className="ban-modal__cancel ban-detail-modal__close" onClick={() => setSelectedBan(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerSearchItem;
