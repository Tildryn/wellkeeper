import "./PlayerListItem.css";

function PlayerListItem({ online_player_name, character_name, public_cd_key, ip_address, logged_on_at, onBan }) {
  return (
    <div className="player-card">
      <span className="player-card__username">{online_player_name}</span>
      <span className="player-card__character">{character_name}</span>
      <code className="player-card__cdkey">{public_cd_key}</code>
      <code className="player-card__ip">{ip_address}</code>
      <span className="player-card__timestamp">{new Date(logged_on_at).toLocaleString()}</span>
      <div className="player-card__actions">
        <button className="player-card__action-btn">Description</button>
        <button className="player-card__action-btn">Inner World</button>
        <button className="player-card__ban-btn" onClick={onBan}>Ban</button>
      </div>
    </div>
  );
}

export default PlayerListItem;
