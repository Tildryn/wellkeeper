import { useState } from "react";
import { IconEye, IconEyeOff } from "./Icons";
import "./LoginPage.css";

interface RegisterPageProps {
  onBack: () => void;
  onRegistered: () => void;
  onPrivacy: () => void;
  initialEmail?: string;
  initialPassword?: string;
}

function RegisterPage({ onBack, onRegistered, onPrivacy, initialEmail = "", initialPassword = "" }: RegisterPageProps) {
  const [email, setEmail] = useState(initialEmail);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(initialPassword);
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, display_name: displayName }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 409 ? "An account with that email already exists." : `Server error (${res.status}).`);
        return res.json();
      })
      .then(() => {
        setLoading(false);
        setSuccess(true);
        setTimeout(onRegistered, 1500);
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message);
      });
  }

  return (
    <main id="main-content" className="login-page">
      <div className="login-card">
        <h1 className="login-card__title">Wellkeeper</h1>
        <p className="login-card__subtitle">Create an account</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              className="login-form__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading || success}
              required
            />
          </div>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="reg-display-name">Display name</label>
            <input
              id="reg-display-name"
              className="login-form__input"
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              disabled={loading || success}
              required
            />
          </div>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="reg-password">Password</label>
            <div className="login-form__pw-wrapper">
              <input
                id="reg-password"
                className="login-form__input"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading || success}
                required
              />
              <button type="button" className="login-form__eye-btn" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </div>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="reg-confirm">Confirm Password</label>
            <div className="login-form__pw-wrapper">
              <input
                id="reg-confirm"
                className="login-form__input"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                disabled={loading || success}
                required
              />
              <button type="button" className="login-form__eye-btn" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}>
                {showConfirm ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </div>
          {error && <p role="alert" className="login-form__error">{error}</p>}
          {success && <p role="status" className="login-form__success">Account created. Redirecting to sign in…</p>}
          <button className="login-form__submit" type="submit" disabled={loading || success}>
            {loading ? "Creating account…" : "Create account"}
          </button>
          <div className="login-form__footer">
            <span>Already have an account?</span>
            <button type="button" className="login-form__link" onClick={onBack}>Sign in</button>
          </div>
          <div className="login-form__footer">
            <button type="button" className="login-form__link" onClick={onPrivacy}>Privacy Policy</button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default RegisterPage;
