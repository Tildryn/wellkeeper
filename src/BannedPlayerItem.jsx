import { useState, useEffect, useContext, useRef } from "react";
import EditLockContext from "./EditLockContext";
import { IconCopy, IconCheck } from "./Icons";
import "./BannedPlayerItem.css";
import "./PlayerSearchItem.css";

function UUIDReveal({ displayName, uuid }) {
  const [showUuid, setShowUuid] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  function handleCopy() {
    navigator.clipboard.writeText(uuid).then(() => {
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <>
      <span
        className={`search-card__session banned-card__name-reveal${showUuid ? " banned-card__name-reveal--active" : ""}`}
        onClick={() => setShowUuid((v) => !v)}
      >
        {displayName}
      </span>
      {showUuid && uuid && (
        <button className="banned-card__uuid-copy" onClick={handleCopy} title="Copy UUID">
          <code className="banned-card__uuid-text">{uuid}</code>
          <span className={`banned-card__copy-icon${copied ? " banned-card__copy-icon--done" : ""}`}>
            {copied ? <IconCheck /> : <IconCopy />}
          </span>
        </button>
      )}
    </>
  );
}

function TagList({ items, onRemove, removingItems }) {
  if (!items || items.length === 0) return <span className="search-card__empty">—</span>;
  const sorted = [...items].sort((a, b) => a.length - b.length);
  return (
    <div className="search-card__tags">
      {sorted.map((item) => (
        onRemove ? (
          <span key={item} className="search-card__tag-wrap">
            <code className="search-card__tag">{item}</code>
            <button
              className="search-card__tag-remove"
              onClick={() => onRemove(item)}
              disabled={removingItems?.has(item)}
              title="Remove"
            >×</button>
          </span>
        ) : (
          <code key={item} className="search-card__tag">{item}</code>
        )
      ))}
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function BannedPlayerItem({ ban_id, player_names, cd_keys, ip_addresses, ban_reason, ban_start, ban_end, ban_temporary, creator_display_name, ban_creator, ban_lifter, lifter_display_name, onUnban, onExpunge, onEditBan }) {
  const [currentBanTemporary, setCurrentBanTemporary] = useState(ban_temporary);
  const [currentBanEnd, setCurrentBanEnd] = useState(ban_end);

  const isActive = !currentBanEnd || new Date(currentBanEnd) > new Date();
  const isLifted = !!ban_lifter;
  const statusLabel = isActive ? null : isLifted ? "Lifted" : "Expired";

  const [confirmingUnban, setConfirmingUnban] = useState(false);
  const [confirmingExpunge, setConfirmingExpunge] = useState(false);
  const [currentBanReason, setCurrentBanReason] = useState(ban_reason);

  const [convertingToTemporary, setConvertingToTemporary] = useState(false);
  const [convertDate, setConvertDate] = useState("");
  const [convertTime, setConvertTime] = useState("00:00");
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertError, setConvertError] = useState(null);

  function startConvertToTemporary() {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    setConvertDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setConvertTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setConvertError(null);
    setConvertingToTemporary(true);
  }

  function handleConvertToTemporary() {
    setConvertSaving(true);
    setConvertError(null);
    const newEnd = `${convertDate} ${convertTime}:00`;
    onEditBan({ ban_temporary: true, ban_end: newEnd })
      .then(() => {
        setCurrentBanTemporary(true);
        setCurrentBanEnd(newEnd);
        setConvertingToTemporary(false);
      })
      .catch((err) => setConvertError(err.message))
      .finally(() => setConvertSaving(false));
  }
  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");
  const [reasonSaving, setReasonSaving] = useState(false);
  const [reasonError, setReasonError] = useState(null);

  const [addingField, setAddingField] = useState(null);
  const [addDraft, setAddDraft] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);
  const [removingItems, setRemovingItems] = useState(new Set());

  function handleRemove(removeBodyKey, item) {
    setRemovingItems((prev) => new Set(prev).add(item));
    onEditBan({ [removeBodyKey]: [item] })
      .catch(() => {})
      .finally(() => setRemovingItems((prev) => {
        const next = new Set(prev);
        next.delete(item);
        return next;
      }));
  }

  const setEditActive = useContext(EditLockContext);
  useEffect(() => {
    setEditActive?.(editingReason || addingField !== null);
  }, [editingReason, addingField]);
  useEffect(() => () => setEditActive?.(false), []);

  function startEditReason() {
    setReasonDraft(currentBanReason ?? "");
    setReasonError(null);
    setEditingReason(true);
  }

  function handleSaveReason() {
    setReasonSaving(true);
    setReasonError(null);
    const newReason = reasonDraft.trim() || null;
    onEditBan({ ban_reason: newReason })
      .then(() => { setEditingReason(false); setCurrentBanReason(newReason); })
      .catch((err) => setReasonError(err.message))
      .finally(() => setReasonSaving(false));
  }

  function startAdd(field) {
    setAddDraft("");
    setAddError(null);
    setAddingField(field);
  }

  function handleAdd(bodyKey) {
    const val = addDraft.trim();
    if (!val) return;
    setAddSaving(true);
    setAddError(null);
    onEditBan({ [bodyKey]: [val] })
      .then(() => setAddingField(null))
      .catch((err) => setAddError(err.message))
      .finally(() => setAddSaving(false));
  }

  function renderTagRow(label, items, fieldKey, bodyKey, removeBodyKey, placeholder) {
    return (
      <div className="search-card__row">
        <span className="search-card__label">{label}</span>
        {addingField !== fieldKey && (
          <button className="banned-card__add-btn" onClick={() => startAdd(fieldKey)} title={`Add ${label.toLowerCase()}`}>+</button>
        )}
        <TagList items={items} onRemove={(item) => handleRemove(removeBodyKey, item)} removingItems={removingItems} />
        {addingField === fieldKey && (
          <div className="banned-card__add-row">
            <input
              className="banned-card__reason-input"
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(bodyKey); if (e.key === "Escape") setAddingField(null); }}
              placeholder={placeholder}
              disabled={addSaving}
              autoFocus
            />
            <button className="banned-card__reason-save" onClick={() => handleAdd(bodyKey)} disabled={addSaving || !addDraft.trim()}>
              {addSaving ? "Adding…" : "Add"}
            </button>
            <button className="banned-card__reason-cancel" onClick={() => setAddingField(null)} disabled={addSaving}>
              Cancel
            </button>
            {addError && <span className="banned-card__reason-error">{addError}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="search-card">
      <div className="search-card__header">
        <span className="search-card__label">Ban</span>
        <code className="search-card__cdkey">#{ban_id}</code>
        <span
          className={`banned-card__type banned-card__type--${currentBanTemporary ? "temporary" : "permanent"}${isActive && !currentBanTemporary ? " banned-card__type--convertible" : ""}`}
          onClick={isActive && !currentBanTemporary ? startConvertToTemporary : undefined}
        >
          {currentBanTemporary ? "Temporary" : "Permanent"}
        </span>
        {statusLabel && (
          <span className={`banned-card__status banned-card__status--${statusLabel.toLowerCase()}`}>
            {statusLabel}
          </span>
        )}
        <div className="search-card__header-actions">
          {isActive && (
            <button className="banned-card__unban-btn" onClick={() => setConfirmingUnban(true)} disabled={confirmingUnban}>Unban</button>
          )}
          {confirmingUnban && (
            <div className="cdkeys-confirm">
              <span className="cdkeys-confirm__label">Unban?</span>
              <button className="cdkeys-confirm__yes" onClick={() => { setConfirmingUnban(false); onUnban(); }}>Yes</button>
              <button className="cdkeys-confirm__no" onClick={() => setConfirmingUnban(false)}>No</button>
            </div>
          )}
          <button className="banned-card__expunge-btn" onClick={() => setConfirmingExpunge(true)} disabled={confirmingExpunge}>Expunge</button>
          {confirmingExpunge && (
            <div className="cdkeys-confirm">
              <span className="cdkeys-confirm__label">Expunge?</span>
              <button className="cdkeys-confirm__yes" onClick={() => { setConfirmingExpunge(false); onExpunge(); }}>Yes</button>
              <button className="cdkeys-confirm__no" onClick={() => setConfirmingExpunge(false)}>No</button>
            </div>
          )}
        </div>
      </div>
      {renderTagRow("CD Keys", cd_keys, "cd_keys", "add_cd_keys", "remove_cd_keys", "CD key")}
      {renderTagRow("Names", player_names, "player_names", "add_player_names", "remove_player_names", "Player name")}
      {renderTagRow("IP Addresses", ip_addresses, "ip_addresses", "add_ip_addresses", "remove_ip_addresses", "IP address")}
      <div className="search-card__row">
        <span className="search-card__label">Banned By</span>
        {creator_display_name && ban_creator
          ? <UUIDReveal displayName={creator_display_name} uuid={ban_creator} />
          : creator_display_name
            ? <span className="search-card__session">{creator_display_name}</span>
            : <em className="search-card__empty">Unknown</em>
        }
      </div>
      {ban_lifter && (
        <div className="search-card__row">
          <span className="search-card__label">Lifted By</span>
          {lifter_display_name
            ? <UUIDReveal displayName={lifter_display_name} uuid={ban_lifter} />
            : <em className="search-card__empty">Unknown</em>
          }
        </div>
      )}
      <div className="search-card__row">
        <span className="search-card__label">Reason</span>
        {editingReason ? (
          <>
            <input
              className="banned-card__reason-input"
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveReason(); if (e.key === "Escape") setEditingReason(false); }}
              placeholder="No reason given"
              disabled={reasonSaving}
              autoFocus
            />
            <button className="banned-card__reason-save" onClick={handleSaveReason} disabled={reasonSaving}>
              {reasonSaving ? "Saving…" : "Save"}
            </button>
            <button className="banned-card__reason-cancel" onClick={() => setEditingReason(false)} disabled={reasonSaving}>
              Cancel
            </button>
            {reasonError && <span className="banned-card__reason-error">{reasonError}</span>}
          </>
        ) : (
          <>
            {currentBanReason
              ? <span className="banned-card__reason-text">{currentBanReason}</span>
              : <em className="search-card__empty">No reason given</em>
            }
            <button className="banned-card__reason-edit" onClick={startEditReason}>Edit</button>
          </>
        )}
      </div>
      <div className="search-card__row search-card__row--session">
        <span className="search-card__label">Ban Start</span>
        <span className="search-card__session">{formatTs(ban_start)}</span>
        <span className="search-card__session-sep">–</span>
        <span className="search-card__session-group">
          <span className="search-card__session-label">Ban End</span>
          <span className="search-card__session">
            {currentBanEnd
              ? formatTs(currentBanEnd)
              : currentBanTemporary
                ? "—"
                : <span
                    className={`banned-card__perm${isActive ? " banned-card__perm--clickable" : ""}`}
                    onClick={isActive ? startConvertToTemporary : undefined}
                  >Permanent</span>
            }
          </span>
        </span>
      </div>
      {convertingToTemporary && (
        <div className="ban-modal__overlay" onClick={() => !convertSaving && setConvertingToTemporary(false)}>
          <div className="ban-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="ban-modal__title">Convert to Temporary Ban</h2>
            <div className="ban-modal__field">
              <label className="ban-modal__label">Ban ends</label>
              <div className="ban-modal__datetime">
                <input
                  className="ban-modal__input ban-modal__input--date"
                  type="date"
                  value={convertDate}
                  onChange={(e) => setConvertDate(e.target.value)}
                  disabled={convertSaving}
                />
                <input
                  className="ban-modal__input ban-modal__input--time"
                  type="time"
                  value={convertTime}
                  onChange={(e) => setConvertTime(e.target.value)}
                  disabled={convertSaving}
                />
              </div>
            </div>
            {convertError && <p className="banned-card__reason-error">{convertError}</p>}
            <div className="ban-modal__actions">
              <button className="ban-modal__cancel" onClick={() => setConvertingToTemporary(false)} disabled={convertSaving}>Cancel</button>
              <button className="ban-modal__confirm" onClick={handleConvertToTemporary} disabled={convertSaving || !convertDate}>
                {convertSaving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BannedPlayerItem;
