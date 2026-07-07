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

  const [currentPassword, setCurrentPassword] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const busy = emailLoading || passwordLoading;

  function handleEmailSubmit(e) {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(false);
    setEmailLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/email`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ email: newEmail }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((b) => { throw new Error(b.error ?? `Server error (${res.status}).`); });
        return res.json();
      })
      .then((data) => {
        setEmailLoading(false);
        setNewEmail("");
        setCurrentPassword("");
        setEmailSuccess(true);
        onEmailChanged(data.access_token);
      })
      .catch((err) => {
        setEmailLoading(false);
        setEmailError(err.message);
      });
  }

  function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/password`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((b) => { throw new Error(b.error ?? `Server error (${res.status}).`); });
        return res.json();
      })
      .then(() => {
        setPasswordLoading(false);
        setNewPassword("");
        setConfirmPassword("");
        setCurrentPassword("");
        setPasswordSuccess(true);
      })
      .catch((err) => {
        setPasswordLoading(false);
        setPasswordError(err.message);
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

          <div className="settings-form__field">
            <label className="settings-form__label" htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              className="settings-form__input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="settings-section__divider" />

          <form className="settings-form" onSubmit={handleEmailSubmit}>
            <h4 className="settings-form__subheading">Change email</h4>
            <div className="settings-form__field">
              <label className="settings-form__label" htmlFor="new-email">New email address</label>
              <input
                id="new-email"
                className="settings-form__input"
                type="email"
                autoComplete="email"
                placeholder={currentEmail || "you@example.com"}
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setEmailSuccess(false); }}
                disabled={emailLoading}
                required
              />
            </div>
            {emailError && <p className="settings-form__error">{emailError}</p>}
            {emailSuccess && <p className="settings-form__success">Email updated successfully.</p>}
            <button
              className="settings-form__submit"
              type="submit"
              disabled={emailLoading || !currentPassword || !newEmail}
            >
              {emailLoading ? "Saving…" : "Update email"}
            </button>
          </form>

          <div className="settings-section__divider" />

          <form className="settings-form" onSubmit={handlePasswordSubmit}>
            <h4 className="settings-form__subheading">Change password</h4>
            <div className="settings-form__field">
              <label className="settings-form__label" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                className="settings-form__input"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordSuccess(false); }}
                disabled={passwordLoading}
                required
              />
            </div>
            <div className="settings-form__field">
              <label className="settings-form__label" htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                className="settings-form__input"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordSuccess(false); }}
                disabled={passwordLoading}
                required
              />
            </div>
            {passwordError && <p className="settings-form__error">{passwordError}</p>}
            {passwordSuccess && <p className="settings-form__success">Password updated successfully.</p>}
            <button
              className="settings-form__submit"
              type="submit"
              disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
            >
              {passwordLoading ? "Saving…" : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
