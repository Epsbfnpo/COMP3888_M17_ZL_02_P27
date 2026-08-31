"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = "http://localhost:3001";

type RegisterResult = {
  message?: string;
  error?: string;
  user?: {
    id: number;
    username: string;
    email: string;
  };
};

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    if (password !== confirmPassword) {
      setResult({ error: "Passwords do not match." });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          email,
          password,
        }),
      });

      const data: RegisterResult = await response.json();
      setResult(data);

      if (response.ok) {
        setUsername("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      }
    } catch {
      setResult({
        error:
          "Cannot reach the backend. Make sure it is running on port 3001.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="intro" aria-labelledby="product-title">
        <p className="eyebrow">AI-assisted collaborative worldbuilding</p>

        <h1 id="product-title">Create your world.</h1>

        <p className="intro-copy">
          Create an account to start building characters, places, histories,
          and connected fictional worlds with your community.
        </p>

        <div className="world-mark" aria-hidden="true">
          <span />
        </div>
      </section>

      <section className="login-card" aria-labelledby="register-title">
        <div className="card-heading">
          <p className="step-label">Join the platform</p>

          <h2 id="register-title">Create account</h2>

          <p>Register your worldbuilding account to get started.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>

          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="Choose a username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={50}
            required
          />

          <label htmlFor="email">Email</label>

          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={100}
            required
          />

          <label htmlFor="password">Password</label>

          <div className="password-field">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Create a password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.9 10.9 0 0112 4c5 0 8.7 3.5 10 8a12 12 0 01-2.3 4.3M6.2 6.2C4.2 7.5 2.8 9.5 2 12c1.3 4.5 5 8 10 8a10.8 10.8 0 004.1-.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <label htmlFor="confirm-password">Confirm password</label>

          <div className="password-field">
            <input
              id="confirm-password"
              name="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Enter your password again"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() =>
                setShowConfirmPassword((current) => !current)
              }
              aria-label={
                showConfirmPassword ? "Hide password" : "Show password"
              }
              title={
                showConfirmPassword ? "Hide password" : "Show password"
              }
            >
              {showConfirmPassword ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.9 10.9 0 0112 4c5 0 8.7 3.5 10 8a12 12 0 01-2.3 4.3M6.2 6.2C4.2 7.5 2.8 9.5 2 12c1.3 4.5 5 8 10 8a10.8 10.8 0 004.1-.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Creating account…" : "Create account"}
          </button>
        </form>

        {result?.error && (
          <p className="message error" role="alert">
            {result.error}
          </p>
        )}

        {result?.user && (
          <p className="message success" role="status">
            Registration successful. Welcome, {result.user.username}!
          </p>
        )}

        <div className="auth-switch">
          <span>Already have an account?</span>
          <Link href="/">Sign in</Link>
        </div>
      </section>
    </main>
  );
}