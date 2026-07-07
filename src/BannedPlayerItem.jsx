import "./BannedPlayerItem.css";
import "./PlayerSearchItem.css";

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

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function BannedPlayerItem({ ban_id, player_names, cd_keys, ip_addresses, ban_reason, ban_start, ban_end, ban_temporary, onUnban }) {
  return (
    <div className="search-card">
      <div className="search-card__header">
        <span className="search-card__label">Ban</span>
        <code className="search-card__cdkey">#{ban_id}</code>
        <div className="search-card__header-actions">
          <button className="banned-card__unban-btn" onClick={onUnban}>Unban</button>
        </div>
      </div>
      <div className="search-card__row">
        <span className="search-card__label">CD Keys</span>
        <TagList items={cd_keys} />
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
        <span className="search-card__label">Reason</span>
        {ban_reason
          ? <span>{ban_reason}</span>
          : <em className="search-card__empty">No reason given</em>
        }
      </div>
      <div className="search-card__row">
        <span className="search-card__label">Banned At</span>
        <span className="search-card__session">{formatTs(ban_start)}</span>
        <span className="search-card__session-sep">–</span>
        <span className="search-card__session-label">Expires</span>
        <span className="search-card__session">
          {ban_temporary
            ? (ban_end ? formatTs(ban_end) : "—")
            : <span className="banned-card__perm">Permanent</span>
          }
        </span>
      </div>
    </div>
  );
}

export default BannedPlayerItem;
