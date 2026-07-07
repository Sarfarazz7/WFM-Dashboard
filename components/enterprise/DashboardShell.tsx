"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useCallback } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Executive" },
  { href: "/dashboard/upload-center", label: "Upload Center" },
  { href: "/dashboard/agents", label: "Agent Explorer" },
  { href: "/dashboard/attendance", label: "Attendance" },
  { href: "/dashboard/productivity", label: "Productivity" },
  { href: "/dashboard/shrinkage", label: "Shrinkage" },
  { href: "/dashboard/historical-analytics", label: "Historical" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default memo(function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const logout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  return (
    <div className="min-h-screen bg-ink-950 text-mist-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-500 focus:text-ink-950 focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink-700 bg-ink-900/95 lg:block">
        <div className="border-b border-ink-700 px-5 py-5">
          <p className="text-sm font-display font-semibold text-mist-50">WFM Enterprise</p>
          <p className="mt-1 text-xs text-mist-400">Operations analytics</p>
        </div>
        <nav aria-label="Main navigation" className="px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`mb-1 block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border border-teal-500/40 bg-teal-500/15 text-teal-400"
                    : "text-mist-400 hover:bg-ink-800 hover:text-mist-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-ink-700 bg-ink-950/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-display font-semibold text-mist-50">WFM Enterprise Dashboard</p>
              <p className="text-xs text-mist-400">PostgreSQL backed reporting workspace</p>
            </div>
            <button onClick={logout} className="btn-secondary px-3 py-1.5 text-xs">
              Log out
            </button>
          </div>
          <nav aria-label="Mobile navigation" className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs ${
                    active
                      ? "border-teal-500/50 bg-teal-500/15 text-teal-400"
                      : "border-ink-600 text-mist-400"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main id="main-content" className="mx-auto max-w-7xl px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
});
