import { useState, useEffect, useRef } from "react";
import { IconX } from "./Icons";
import "./MyCDKeysPage.css";
import type { CdKey } from "./types";

interface MyCDKeysPageProps {
  authToken: string;
  cdKeys: CdKey[];
  cdKeysLoading: boolean;
  cdKeysError: string | null;
  onDeleted: (cdKey: string) => void;
  onRefreshCdKeys: () => void;
}

function MyCDKeysPage({ authToken, cdKeys, cdKeysLoading, cdKeysError, onDeleted, onRefreshCdKeys }: MyCDKeysPageProps) {
  const [otp, setOtp] = useState<string | null>(null);
  const [otpAnnouncement, setOtpAnnouncement] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseCountRef = useRef<number>(0);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!otp) {
      clearInterval(pollRef.current ?? undefined);
      clearTimeout(checkTimeoutRef.current ?? undefined);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(onRefreshCdKeys, 5000);
    return () => clearInterval(pollRef.current ?? undefined);
  }, [otp]);

  function checkNow() {
    setChecking(true);
    onRefreshCdKeys();
    checkTimeoutRef.current = setTimeout(() => setChecking(false), 3000);
  }

  useEffect(() => {
    if (otp && cdKeys.length > baseCountRef.current) {
      setOtp(null);
    }
  }, [cdKeys.length]);

  function handleDelete(public_cd_key: string) {
    setDeleting(public_cd_key);
    setDeleteError(null);
    fetch(`${import.meta.env.VITE_API_URL}/linked_cd_keys`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ public_cd_key }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Server error (${res.status}).`);
        }
        onDeleted(public_cd_key);
      })
      .catch((err) => setDeleteError(err.message))
      .finally(() => setDeleting(null));
  }

  function generateOtp() {
    baseCountRef.current = cdKeys.length;
    setOtpLoading(true);
    setOtpError(null);
    fetch(`${import.meta.env.VITE_API_URL}/otp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json() as Promise<{ otp: string }>;
      })
      .then((data) => {
        setOtp(data.otp);
        setOtpAnnouncement(`Your linking code is: ${data.otp}. Enter it ingame using the /wellkeeper command.`);
        setOtpLoading(false);
      })
      .catch((err) => {
        setOtpError(err.message);
        setOtpLoading(false);
      });
  }

  return (
    <div className="cdkeys-page">
      <h2 className="sr-only">My CD Keys</h2>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{otpAnnouncement}</p>
      {otpError && <p role="alert" style={{ color: "#e05560", fontSize: "13px", margin: 0 }}>Error: {otpError}</p>}
      {deleteError && <p role="alert" style={{ color: "#e05560", fontSize: "13px", margin: 0 }}>Error: {deleteError}</p>}
      {otp && (
        <div className="cdkeys-otp" aria-live="polite" aria-atomic="true">
          <p className="cdkeys-otp__prompt">
            Use the <code>/wellkeeper</code> command ingame to enter this code. This will link the CD Key to this account.
          </p>
          <div className="cdkeys-otp__code">{otp}</div>
          <button className="cdkeys-otp__done-btn" onClick={checkNow} disabled={checking}>
            {checking ? "Checking…" : "I've linked it"}
          </button>
        </div>
      )}
      <div className="cdkeys-table-group">
        <button className="cdkeys-add-btn" onClick={generateOtp} disabled={otpLoading}>
          {otpLoading ? "Generating…" : "Link CD Key"}
        </button>
        {cdKeysLoading && <p role="status" className="cdkeys-empty">Loading…</p>}
        {cdKeysError && <p role="alert" className="cdkeys-empty" style={{ color: "#e05560" }}>Error: {cdKeysError}</p>}
        {!cdKeysLoading && !cdKeysError && cdKeys.length === 0 && (
          <p className="cdkeys-empty">No CD keys linked yet.</p>
        )}
        {!cdKeysLoading && !cdKeysError && cdKeys.length > 0 && (
          <div className="cdkeys-table" role="table" aria-label="Linked CD Keys">
            <div className="cdkeys-table__header" role="row">
              <span role="columnheader">CD Key</span>
              <span role="columnheader">DM</span>
              <span role="columnheader"><span className="sr-only">Actions</span></span>
            </div>
            {cdKeys.map(({ public_cd_key, dm }) => (
              <div key={public_cd_key} className="cdkeys-table__row" role="row">
                <code className="cdkeys-list__key" role="cell">{public_cd_key}</code>
                <div className="cdkeys-col-dm" role="cell">{dm && <span className="cdkeys-list__dm">DM</span>}</div>
                <div className="cdkeys-col-actions" role="cell">
                  {confirmKey !== public_cd_key ? (
                    <button
                      className="cdkeys-delete-btn"
                      onClick={() => setConfirmKey(public_cd_key)}
                      disabled={deleting !== null || otp !== null}
                      aria-label="Unlink CD key"
                    >
                      {deleting === public_cd_key ? "…" : <IconX />}
                    </button>
                  ) : (
                    <div className="cdkeys-confirm">
                      <span className="cdkeys-confirm__label">Sure?</span>
                      <button autoFocus className="cdkeys-confirm__yes" aria-label="Confirm unlink" onClick={() => { setConfirmKey(null); handleDelete(public_cd_key); }} disabled={deleting !== null}>Yes</button>
                      <button className="cdkeys-confirm__no" aria-label="Cancel unlink" onClick={() => setConfirmKey(null)}>No</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MyCDKeysPage;
