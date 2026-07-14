"use client";

import { useEffect, useRef } from "react";

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function SideDrawer({ open, onClose, title, children }: SideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className="relative w-full max-w-2xl bg-ink-900 border-l border-ink-700 shadow-2xl overflow-y-auto animate-in slide-in-from-right"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-ink-900 border-b border-ink-700">
          <h2 className="text-lg font-display font-semibold text-mist-50">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-mist-400 hover:text-mist-100 hover:bg-ink-700 rounded transition-colors"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string | number | null | undefined;
  suffix?: string;
}

export function DetailRow({ label, value, suffix }: DetailRowProps) {
  const displayValue = value === null || value === undefined || value === "" ? "-" : String(value);
  return (
    <div className="flex justify-between py-2 border-b border-ink-700/50">
      <span className="text-sm text-mist-400">{label}</span>
      <span className="text-sm font-medium text-mist-100">
        {displayValue}{suffix}
      </span>
    </div>
  );
}

interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
}

export function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-mist-300 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-0">{children}</div>
    </div>
  );
}
