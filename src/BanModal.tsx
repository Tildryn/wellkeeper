import { useState, useRef, useEffect } from "react";
import "./BanModal.css";
import type { BanTarget, BanPayload } from "./types";

interface BanModalProps {
  target: BanTarget;
  onConfirm: (payload: BanPayload) => void;
  onCancel: () => void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function BanModal({ target, onConfirm, onCancel }: BanModalProps) {
  const [reason, setReason] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [banDate, setBanDate] = useState("");
  const [banTime, setBanTime] = useState("00:00");

  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => prevFocusRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onCancel(); return; }
    if (e.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function handleConfirm() {
    onConfirm({
      ban_reason:    reason.trim() || undefined,
      ban_temporary: temporary,
      ban_end:       temporary && banDate ? `${banDate} ${banTime}:00` : undefined,
    });
  }

  const confirmDisabled = temporary && !banDate;

  return (
    <div className="ban-modal__overlay" onClick={onCancel}>
      <div
        className="ban-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ban-modal-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="ban-modal__title" id="ban-modal-title">Ban Player</h2>
        <p className="ban-modal__target">{target.playerNames?.[0] || target.cdKeys?.[0]}</p>

        <div className="ban-modal__field">
          <label className="ban-modal__label" htmlFor="ban-reason">Reason <span className="ban-modal__optional">(optional)</span></label>
          <input
            id="ban-reason"
            className="ban-modal__input"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Griefing, harassment, bad vibes…"
          />
        </div>

        <div className="ban-modal__field ban-modal__field--row">
          <input
            id="ban-temporary"
            type="checkbox"
            className="ban-modal__checkbox"
            checked={temporary}
            onChange={(e) => {
              const checked = e.target.checked;
              setTemporary(checked);
              if (checked) {
                const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
                const pad = (n: number) => String(n).padStart(2, "0");
                setBanDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
                setBanTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
              } else {
                setBanDate("");
                setBanTime("00:00");
              }
            }}
          />
          <label className="ban-modal__label" htmlFor="ban-temporary">Temporary ban</label>
        </div>

        {temporary && (
          <div className="ban-modal__field">
            <label className="ban-modal__label" htmlFor="ban-end-date">Ban ends</label>
            <div className="ban-modal__datetime">
              <input
                id="ban-end-date"
                className="ban-modal__input ban-modal__input--date"
                type="date"
                value={banDate}
                onChange={(e) => setBanDate(e.target.value)}
              />
              <input
                id="ban-end-time"
                className="ban-modal__input ban-modal__input--time"
                type="time"
                aria-label="Ban end time"
                value={banTime}
                onChange={(e) => setBanTime(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="ban-modal__actions">
          <button className="ban-modal__cancel" onClick={onCancel}>Cancel</button>
          <button className="ban-modal__confirm" onClick={handleConfirm} disabled={confirmDisabled}>
            Confirm Ban
          </button>
        </div>
      </div>
    </div>
  );
}

export default BanModal;
