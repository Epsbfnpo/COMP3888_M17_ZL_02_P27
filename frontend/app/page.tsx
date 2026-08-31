"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = "http://localhost:3001";

type LoginResult = {
  message?: string;
  error?: string;
  user?: {
    id: number;
    username: string;
    email: string;
  };
};

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<LoginResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data: LoginResult = await response.json();
      setResult(data);
    } catch {
      setResult({
        error: "Cannot reach the backend. Make sure it is running on port 3001.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="intro" aria-labelledby="product-title">
        <p className="eyebrow">AI-assisted collaborative worldbuilding</p>
        <h1 id="product-title">Build worlds together.</h1>
        <p className="intro-copy">
          Sign in to continue shaping characters, places, histories, and the
          connections between them.
        </p>
        <div className="world-mark" aria-hidden="true">
          <span />
        </div>
      </section>

      <section className="login-card" aria-labelledby="login-title">
        <div className="card-heading">
          <p className="step-label">Welcome back</p>
          <h2 id="login-title">Sign in</h2>
          <p>Use your worldbuilding account to continue.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
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

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {result?.error && (
          <p className="message error" role="alert">
            {result.error}
          </p>
        )}

        {result?.user && (
          <p className="message success" role="status">
            Login successful. Welcome, {result.user.username}!
          </p>
        )}

        <div className="auth-switch">
          <span>New to the platform?</span>
          <Link href="/register">Create an account</Link>
        </div>

        <div className="demo-note">
          <strong>Local test account</strong>
          <span>sample@example.com / Sample123!</span>
        </div>
      </section>
    </main>
  );
}
