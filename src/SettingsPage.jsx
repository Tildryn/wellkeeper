import { useState, useEffect } from "react";
import { IconEye, IconEyeOff } from "./Icons";
import "./SettingsPage.css";

function PasswordInput({ id, value, onChange, disabled, readOnly, onFocus, autoComplete, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="settings-form__pw-wrapper">
      <input
        id={id}
        className="settings-form__input"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        readOnly={readOnly}
        onFocus={onFocus}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <button
        type="button"
        className="settings-form__eye-btn"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

function SettingsPage({ authToken, accountUuid, displayName, onDisplayNameChanged }) {
  const [currentEmail, setCurrentEmail] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/email`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.email) setCurrentEmail(data.email); })
      .catch(() => {});
  }, [authToken]);

  const [newDisplayName, setNewDisplayName] = useState("");
  const [displayNameLoading, setDisplayNameLoading] = useState(false);
  const [displayNameError, setDisplayNameError] = useState(null);
  const [displayNameSuccess, setDisplayNameSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [pwReady, setPwReady] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const busy = displayNameLoading || emailLoading || passwordLoading;

  async function handleDisplayNameSubmit(e) {
    e.preventDefault();
    setDisplayNameError(null);
    setDisplayNameSuccess(false);
    setDisplayNameLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/display_name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ display_name: newDisplayName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Server error (${res.status}).`);
      setNewDisplayName("");
      setDisplayNameSuccess(true);
      onDisplayNameChanged(body.display_name);
    } catch (err) {
      setDisplayNameError(err.message);
    } finally {
      setDisplayNameLoading(false);
    }
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(false);
    setEmailLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ email: newEmail }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Server error (${res.status}).`);
      setCurrentEmail(newEmail);
      setNewEmail("");
      setCurrentPassword(""); setPwReady(false);
      setEmailSuccess(true);
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Server error (${res.status}).`);
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword(""); setPwReady(false);
      setPasswordSuccess(true);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h2 className="settings-card__title">Settings</h2>
        <section className="settings-section">
          <h3 className="settings-section__heading">Account</h3>
          <div className="settings-section__meta">
            <div className="settings-section__meta-grid">
              {currentEmail && (
                <>
                  <span className="settings-section__meta-label">Email</span>
                  <span className="settings-section__meta-value">{currentEmail}</span>
                </>
              )}
              {accountUuid && (
                <>
                  <span className="settings-section__meta-label">UUID</span>
                  <code className="settings-section__meta-uuid">{accountUuid}</code>
                </>
              )}
            </div>
          </div>

          <form className="settings-form" onSubmit={handleDisplayNameSubmit}>
            <h4 className="settings-form__subheading">Display name</h4>
            <div className="settings-form__field">
              <label className="settings-form__label" htmlFor="new-display-name">New display name</label>
              <input
                id="new-display-name"
                className="settings-form__input"
                type="text"
                autoComplete="nickname"
                placeholder={displayName || "Your name"}
                value={newDisplayName}
                onChange={(e) => { setNewDisplayName(e.target.value); setDisplayNameSuccess(false); }}
                disabled={displayNameLoading}
                required
              />
            </div>
            {displayNameError && <p className="settings-form__error">{displayNameError}</p>}
            {displayNameSuccess && <p className="settings-form__success">Display name updated successfully.</p>}
            <button
              className="settings-form__submit"
              type="submit"
              disabled={displayNameLoading || !newDisplayName}
            >
              {displayNameLoading ? "Saving…" : "Update display name"}
            </button>
          </form>

          <div className="settings-section__divider" />

          <div className="settings-form__field">
            <label className="settings-form__label" htmlFor="current-password">Current password</label>
            <PasswordInput
              id="current-password"
              autoComplete="off"
              readOnly={!pwReady}
              onFocus={() => setPwReady(true)}
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
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordSuccess(false); }}
                disabled={passwordLoading}
              />
            </div>
            <div className="settings-form__field">
              <label className="settings-form__label" htmlFor="confirm-password">Confirm new password</label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordSuccess(false); }}
                disabled={passwordLoading}
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
