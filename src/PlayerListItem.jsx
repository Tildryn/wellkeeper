import { useState } from "react";
import "./PlayerListItem.css";
import "./BannedPlayerItem.css";
import { IconScroll, IconGlobe } from "./Icons";

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
  const [confirming, setConfirming] = useState(false);

  function handleConfirm() {
    setConfirming(false);
    if (isBanned) onUnban(); else onBan();
  }

  return (
    <div className={`player-card${isBanned ? " player-card--kick-pending" : ""}`}>
      <span className="player-card__username">{online_player_name}</span>
      <span className="player-card__character">{character_name}</span>
      <code className="player-card__cdkey">{public_cd_key}</code>
      <code className="player-card__ip">{ip_address}</code>
      <span className="player-card__timestamp">{new Date(logged_on_at).toLocaleString()}</span>
      <div className="player-card__status">
        {/* DM badge hidden for now */}
      </div>
      <div className="player-card__actions">
        <div className="player-card__action-group">
          <button className="player-card__action-btn" title="Description"><IconScroll /></button>
          <button className="player-card__action-btn" title="Inner World"><IconGlobe /></button>
        </div>
        <BootSpinner visible={isBanned} />
        {confirming ? (
          <div className="cdkeys-confirm">
            <span className="cdkeys-confirm__label">{isBanned ? "Unban?" : "Ban?"}</span>
            <button className="cdkeys-confirm__yes" onClick={handleConfirm}>Yes</button>
            <button className="cdkeys-confirm__no" onClick={() => setConfirming(false)}>No</button>
          </div>
        ) : isBanned
          ? <button className="player-card__unban-btn" onClick={() => setConfirming(true)}>Unban</button>
          : <button className="player-card__ban-btn" onClick={() => setConfirming(true)}>Ban</button>
        }
      </div>
    </div>
  );
}

export default PlayerListItem;
