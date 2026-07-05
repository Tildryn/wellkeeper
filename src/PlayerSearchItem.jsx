import "./PlayerSearchItem.css";
import "./PlayerListItem.css";
import "./BannedPlayerItem.css";

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
            <button className="player-card__action-btn" disabled>Description</button>
            <button className="player-card__action-btn" disabled>Inner World</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts.replace(" ", "T"));
  return isNaN(d) ? ts : d.toLocaleString();
}

function PlayerSearchItem({ public_cd_key, player_names, ip_addresses, characters, onBan, onUnban, isPending, isBanned, session }) {
  return (
    <div className="search-card">
      <div className="search-card__header">
        <span className="search-card__label">CD Key</span>
        <code className="search-card__cdkey">{public_cd_key}</code>
        <div className="search-card__header-actions">
          {isBanned
            ? <button className="banned-card__unban-btn" onClick={onUnban}>Unban</button>
            : isPending
              ? <button className="player-card__pending-btn" disabled>Ban Pending</button>
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
    </div>
  );
}

export default PlayerSearchItem;
