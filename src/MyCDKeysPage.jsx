import { useState } from "react";
import "./MyCDKeysPage.css";

function MyCDKeysPage({ authToken, cdKeys, cdKeysLoading, cdKeysError }) {
  const [otp, setOtp] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);

  function generateOtp() {
    setOtpLoading(true);
    setOtpError(null);
    fetch(`${import.meta.env.VITE_API_URL}/otp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json();
      })
      .then((data) => {
        setOtp(data.otp);
        setOtpLoading(false);
      })
      .catch((err) => {
        setOtpError(err.message);
        setOtpLoading(false);
      });
  }

  return (
    <div className="cdkeys-page">
      {otpError && <p style={{ color: "#e05560", fontSize: "13px", margin: 0 }}>Error: {otpError}</p>}
      {otp && (
        <div className="cdkeys-otp">
          <p className="cdkeys-otp__prompt">
            Use the <code>/wellkeeper</code> command ingame to enter this code. This will link the CD Key to this account.
          </p>
          <div className="cdkeys-otp__code">{otp}</div>
        </div>
      )}
      <div className="cdkeys-table-group">
        <button className="cdkeys-add-btn" onClick={generateOtp} disabled={otpLoading}>
          {otpLoading ? "Generating…" : "Link CD Key"}
        </button>
        <div className="cdkeys-table">
          {cdKeysLoading && <p className="cdkeys-empty">Loading…</p>}
          {cdKeysError && <p className="cdkeys-empty" style={{ color: "#e05560" }}>Error: {cdKeysError}</p>}
          {!cdKeysLoading && !cdKeysError && cdKeys.length === 0 && (
            <p className="cdkeys-empty">No CD keys linked yet.</p>
          )}
          {!cdKeysLoading && !cdKeysError && cdKeys.length > 0 && (
            <>
              <div className="cdkeys-table__header">
                <span>CD Key</span>
                <span>DM</span>
              </div>
              {cdKeys.map(({ public_cd_key, dm }) => (
                <div key={public_cd_key} className="cdkeys-table__row">
                  <code className="cdkeys-list__key">{public_cd_key}</code>
                  <div>{dm && <span className="cdkeys-list__dm">DM</span>}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyCDKeysPage;
