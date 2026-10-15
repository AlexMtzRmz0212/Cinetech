"use client";

import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
    if (!res) {
      setError("Couldn't reach the server. Try again.");
      setBusy(false);
    } else if (res.ok) window.location.href = "/";
    else {
      setError("Wrong password. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 flex max-w-xs flex-col gap-4 sm:mt-24">
      <h1 className="font-display text-4xl leading-none font-extrabold uppercase">Owner sign in</h1>
      <label className="block">
        <span className="label">Password</span>
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
      </label>
      {error && (
        <p id="login-error" role="alert" className="-mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
