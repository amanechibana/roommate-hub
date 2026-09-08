"use client";

import { Button } from "@/components/ui/button";

import { homeRequest } from "@/lib/home-client";
import { ArrowRight, Home, Leaf, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

export default function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("code") || "");
    try {
      await homeRequest("/api/session", "POST", { code });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-wrap">
      <a href="/" className="auth-brand">
        <Leaf /> common ground.
      </a>
      <section className="auth-card">
        <span className="stat-icon sage">
          <Home size={26} />
        </span>
        <p className="eyebrow">YOUR LITTLE CORNER OF THE WORLD</p>
        <h1>Welcome home.</h1>
        <p className="subtitle">
          A shared space for your people. Enter your household code to come on
          in.
        </p>
        <form onSubmit={submit}>
          <label>
            Household code
            <input
              name="code"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Your household code"
              autoFocus
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button className="button" disabled={busy}>
            {busy ? "Opening the door…" : "Come on in"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-footnote">
          <ShieldCheck size={15} />
          We’ll remember this device for 30 days. No email needed.
        </p>
      </section>
    </main>
  );
}
