import "./BannedPlayerItem.css";

function BannedPlayerItem({ public_cd_key, player_name, ip_address, banned_by, banned_at, onUnban }) {
  return (
    <div className="banned-card">
      <span className="banned-card__name">{player_name}</span>
      <code className="banned-card__cdkey">{public_cd_key}</code>
      <code className="banned-card__ip">{ip_address}</code>
      <span className="banned-card__by">{banned_by}</span>
      <span className="banned-card__at">{new Date(banned_at).toLocaleString()}</span>
      <div className="banned-card__actions">
        <button className="banned-card__unban-btn" onClick={onUnban}>Unban</button>
      </div>
    </div>
  );
}

export default BannedPlayerItem;
