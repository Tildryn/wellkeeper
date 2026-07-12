import { useState } from "react";
import { IconEye, IconEyeOff } from "./Icons";
import "./LoginPage.css";

interface PwFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}

function PwField({ id, label, value, onChange, disabled }: PwFieldProps) {
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
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </div>
  );
}

interface ResetPasswordPageProps {
  token: string;
  onSuccess: () => void;
}

function ResetPasswordPage({ token, onSuccess }: ResetPasswordPageProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Server error (${res.status}).`);
      setSuccess(true);
      window.history.replaceState({}, "", window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="login-page">
      <div className="login-card">
        <h1 className="login-card__title">Wellkeeper</h1>
        <p className="login-card__subtitle">Set a new password</p>
        <form className="login-form" onSubmit={handleSubmit}>
          {success ? (
            <>
              <p role="status" className="login-form__success">Password reset successfully.</p>
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
              {error && <p role="alert" className="login-form__error">{error}</p>}
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
    </main>
  );
}

export default ResetPasswordPage;
