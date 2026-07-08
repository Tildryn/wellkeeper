import { useState } from "react";
import { IconEye, IconEyeOff } from "./Icons";
import "./LoginPage.css";

function PwField({ id, label, value, onChange, disabled }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="login-form__field">
      <label className="login-form__label" htmlFor={id}>{label}</label>
      <div className="login-form__pw-wrapper">
        <input
          id={id}
          className="login-form__input"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          placeholder="••••••••"
          value={value}
          onChange={onChange}
          disabled={disabled}
          required
        />
        <button
          type="button"
          className="login-form__eye-btn"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordPage({ token, onSuccess }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/reset_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Server error (${res.status}).`);
      setSuccess(true);
      window.history.replaceState({}, "", window.location.pathname);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-card__title">Wellkeeper</h1>
        <p className="login-card__subtitle">Set a new password</p>
        <form className="login-form" onSubmit={handleSubmit}>
          {success ? (
            <>
              <p className="login-form__success">Password reset successfully.</p>
              <button type="button" className="login-form__submit" onClick={onSuccess}>
                Go to login
              </button>
            </>
          ) : (
            <>
              <PwField
                id="reset-new-password"
                label="New password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                disabled={loading}
              />
              <PwField
                id="reset-confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                disabled={loading}
              />
              {error && <p className="login-form__error">{error}</p>}
              <button
                className="login-form__submit"
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
              >
                {loading ? "Resetting…" : "Reset password"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
