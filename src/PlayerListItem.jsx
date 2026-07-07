import "./PlayerListItem.css";
import "./BannedPlayerItem.css";

const IconScroll = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/>
    <path d="M19 17V5a2 2 0 0 0-2-2H4"/>
    <line x1="10" y1="9" x2="15" y2="9"/>
    <line x1="10" y1="13" x2="16" y2="13"/>
  </svg>
);

const IconGlobe = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
    <path d="M2 12h20"/>
  </svg>
);

const BootSpinner = ({ visible }) => (
  <span className={`player-card__boot-spinner${visible ? "" : " player-card__boot-spinner--hidden"}`} title="Kick Pending">
    <svg className="player-card__spinner-ring" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
      <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
    <svg className="player-card__boot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h4v9.5h2l3 2.5v2H5v-2l3-2.5V3z"/>
    </svg>
  </span>
);

function PlayerListItem({ online_player_name, character_name, public_cd_key, ip_address, logged_on_at, onBan, onUnban, isBanned, isDM }) {
  return (
    <div className={`player-card${isBanned ? " player-card--kick-pending" : ""}`}>
      <span className="player-card__username">{online_player_name}</span>
      <span className="player-card__character">{character_name}</span>
      <code className="player-card__cdkey">{public_cd_key}</code>
      <code className="player-card__ip">{ip_address}</code>
      <span className="player-card__timestamp">{new Date(logged_on_at).toLocaleString()}</span>
      <div className="player-card__status">
        {isDM && <span className="player-card__badge player-card__badge--dm">DM</span>}
      </div>
      <div className="player-card__actions">
        <div className="player-card__action-group">
          <button className="player-card__action-btn" title="Description"><IconScroll /></button>
          <button className="player-card__action-btn" title="Inner World"><IconGlobe /></button>
        </div>
        <BootSpinner visible={isBanned} />
        {isBanned
          ? <button className="player-card__unban-btn" onClick={onUnban}>Unban</button>
          : <button className="player-card__ban-btn" onClick={onBan}>Ban</button>
        }
      </div>
    </div>
  );
}

export default PlayerListItem;
