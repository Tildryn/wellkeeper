import { useState } from "react";
import "./LoginPage.css";

function ForgotPasswordPage({ onBack }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/forgot_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Server error (${res.status}).`);
      setMessage(body.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="login-page">
      <div className="login-card">
        <h1 className="login-card__title">Wellkeeper</h1>
        <p className="login-card__subtitle">Reset your password</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="forgot-email">Email address</label>
            <input
              id="forgot-email"
              className="login-form__input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || !!message}
              required
            />
          </div>
          {error && <p role="alert" className="login-form__error">{error}</p>}
          {message && <p role="status" className="login-form__success">{message}</p>}
          {!message && (
            <button className="login-form__submit" type="submit" disabled={loading || !email}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          )}
          <div className="login-form__footer">
            <button type="button" className="login-form__link" onClick={onBack}>Back to login</button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default ForgotPasswordPage;
