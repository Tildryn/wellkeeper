import { useState, useEffect, useContext } from "react";
import EditLockContext from "./EditLockContext";
import "./BannedPlayerItem.css";
import "./PlayerSearchItem.css";

function TagList({ items, onRemove, removingItems }) {
  if (!items || items.length === 0) return <span className="search-card__empty">—</span>;
  return (
    <div className="search-card__tags">
      {items.map((item) => (
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
  const isActive = !ban_end || new Date(ban_end) > new Date();
  const isLifted = !!ban_lifter;
  const statusLabel = isActive ? null : isLifted ? "Lifted" : "Expired";

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
    setReasonDraft(ban_reason ?? "");
    setReasonError(null);
    setEditingReason(true);
  }

  function handleSaveReason() {
    setReasonSaving(true);
    setReasonError(null);
    onEditBan({ ban_reason: reasonDraft.trim() || null })
      .then(() => setEditingReason(false))
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
        <TagList items={items} onRemove={(item) => handleRemove(removeBodyKey, item)} removingItems={removingItems} />
        {addingField === fieldKey ? (
          <>
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
          </>
        ) : (
          <button className="banned-card__add-btn" onClick={() => startAdd(fieldKey)} title={`Add ${label.toLowerCase()}`}>+</button>
        )}
      </div>
    );
  }

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
      {renderTagRow("CD Keys", cd_keys, "cd_keys", "add_cd_keys", "remove_cd_keys", "CD key")}
      {renderTagRow("Names", player_names, "player_names", "add_player_names", "remove_player_names", "Player name")}
      {renderTagRow("IP Addresses", ip_addresses, "ip_addresses", "add_ip_addresses", "remove_ip_addresses", "IP address")}
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
            {ban_reason
              ? <span className="banned-card__reason-text">{ban_reason}</span>
              : <em className="search-card__empty">No reason given</em>
            }
            <button className="banned-card__reason-edit" onClick={startEditReason}>Edit</button>
          </>
        )}
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
