"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Invalid username or password");
        return;
      }
      const rawDest = searchParams.get("from") || "/dashboard";
      const dest = rawDest.startsWith("/") && !rawDest.startsWith("//") ? rawDest : "/dashboard";
      router.push(dest);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Subtle background: soft radial teal glow over the dark navy base */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(45,212,200,0.12) 0%, rgba(11,18,32,0) 60%), #0b1220",
        }}
      />

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
              <span className="text-teal-400 font-display font-semibold text-sm">W</span>
            </div>
          </div>
          <h1 className="text-xl font-display font-semibold text-mist-50">
            WFM Breaksheet Dashboard
          </h1>
          <p className="text-sm text-mist-400 mt-1">Sign in with your team credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="label-eyebrow block mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                className="input w-full"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="label-eyebrow block mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-metric-abandon bg-metric-abandon/10 border border-metric-abandon/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-mist-400 mt-4">
          Forgot password? Contact your admin.
        </p>
      </div>
    </div>
  );
}
