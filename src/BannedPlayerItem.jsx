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

function BannedPlayerItem({ ban_id, player_names, cd_keys, ip_addresses, ban_reason, ban_start, ban_end, ban_temporary, creator_display_name, ban_creator, ban_lifter, lifter_display_name, onUnban, onExpunge }) {
  const isActive = !ban_end || new Date(ban_end) > new Date();
  const isLifted = !!ban_lifter;
  const statusLabel = isActive ? null : isLifted ? "Lifted" : "Expired";

  return (
    <div className="search-card">
      <div className="search-card__header">
        <span className="search-card__label">Ban</span>
        <code className="search-card__cdkey">#{ban_id}</code>
        <span className={`banned-card__type banned-card__type--${ban_temporary ? "temporary" : "permanent"}`}>
          {ban_temporary ? "Temporary" : "Permanent"}
        </span>
        {statusLabel && (
          <span className={`banned-card__status banned-card__status--${statusLabel.toLowerCase()}`}>
            {statusLabel}
          </span>
        )}
        <div className="search-card__header-actions">
          {isActive && (
            <button className="banned-card__unban-btn" onClick={onUnban}>Unban</button>
          )}
          <button className="banned-card__expunge-btn" onClick={onExpunge}>Expunge</button>
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
        <span className="search-card__label">Banned By</span>
        {creator_display_name
          ? <span className="search-card__session">{creator_display_name}</span>
          : <em className="search-card__empty">Unknown</em>
        }
        {ban_creator && <code className="search-card__pcid">{ban_creator}</code>}
      </div>
      {ban_lifter && (
        <div className="search-card__row">
          <span className="search-card__label">Lifted By</span>
          {lifter_display_name
            ? <span className="search-card__session">{lifter_display_name}</span>
            : <em className="search-card__empty">Unknown</em>
          }
          <code className="search-card__pcid">{ban_lifter}</code>
        </div>
      )}
      <div className="search-card__row">
        <span className="search-card__label">Reason</span>
        {ban_reason
          ? <span>{ban_reason}</span>
          : <em className="search-card__empty">No reason given</em>
        }
      </div>
      <div className="search-card__row">
        <span className="search-card__label">Ban Start</span>
        <span className="search-card__session">{formatTs(ban_start)}</span>
        <span className="search-card__session-sep">–</span>
        <span className="search-card__session-label">Ban End</span>
        <span className="search-card__session">
          {ban_end
            ? formatTs(ban_end)
            : ban_temporary
              ? "—"
              : <span className="banned-card__perm">Permanent</span>
          }
        </span>
      </div>
    </div>
  );
}

export default BannedPlayerItem;
