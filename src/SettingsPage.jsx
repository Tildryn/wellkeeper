import { useState } from "react";
import "./SettingsPage.css";

function decodeTokenEmail(token) {
  try {
    return JSON.parse(atob(token.split(".")[1])).email ?? "";
  } catch {
    return "";
  }
}

function SettingsPage({ authToken, onEmailChanged }) {
  const currentEmail = decodeTokenEmail(authToken);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/email`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ email: newEmail }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((body) => {
            throw new Error(body.error ?? `Server error (${res.status}).`);
          });
        }
        return res.json();
      })
      .then((data) => {
        setLoading(false);
        setNewEmail("");
        setSuccess(true);
        onEmailChanged(data.access_token);
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message);
      });
  }

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h2 className="settings-card__title">Settings</h2>
        <section className="settings-section">
          <h3 className="settings-section__heading">Account</h3>
          <p className="settings-section__current">
            Current email: <span className="settings-section__email">{currentEmail || "—"}</span>
          </p>
          <form className="settings-form" onSubmit={handleSubmit}>
            <div className="settings-form__field">
              <label className="settings-form__label" htmlFor="new-email">New email address</label>
              <input
                id="new-email"
                className="settings-form__input"
                type="email"
                autoComplete="email"
                placeholder={currentEmail || "you@example.com"}
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setSuccess(false); }}
                disabled={loading}
                required
              />
            </div>
            {error && <p className="settings-form__error">{error}</p>}
            {success && <p className="settings-form__success">Email updated successfully.</p>}
            <button className="settings-form__submit" type="submit" disabled={loading || !newEmail}>
              {loading ? "Saving…" : "Update email"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
