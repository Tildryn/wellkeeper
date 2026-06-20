import { useState } from "react";
import "./LoginPage.css";

function RegisterPage({ onBack, onRegistered, initialEmail = "", initialPassword = "" }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e) {
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
      body: JSON.stringify({ email, password }),
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
    <div className="login-page">
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
            <label className="login-form__label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              className="login-form__input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading || success}
              required
            />
          </div>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="reg-confirm">Confirm Password</label>
            <input
              id="reg-confirm"
              className="login-form__input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              disabled={loading || success}
              required
            />
          </div>
          {error && <p className="login-form__error">{error}</p>}
          {success && <p className="login-form__success">Account created. Redirecting to sign in…</p>}
          <button className="login-form__submit" type="submit" disabled={loading || success}>
            {loading ? "Creating account…" : "Create account"}
          </button>
          <div className="login-form__footer">
            <span>Already have an account?</span>
            <button type="button" className="login-form__link" onClick={onBack}>Sign in</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RegisterPage;
