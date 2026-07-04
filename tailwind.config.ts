import type { Config } from "tailwindcss";

// Design tokens: a quiet slate/graphite workspace with a teal signature accent.
// Metrics each get a fixed, distinct hue so the eye learns the mapping fast:
// AHT = blue, Shrinkage = amber, CSAT = emerald, Abandonment = rose, Hold = violet.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b1220",
          900: "#0f172a",
          800: "#151f34",
          700: "#1c2942",
          600: "#293a5c",
        },
        mist: {
          50: "#f7f9fc",
          100: "#eef2f8",
          200: "#dde5f0",
          400: "#9aa8c2",
          500: "#6b7a99",
        },
        teal: {
          400: "#2dd4c8",
          500: "#14b8ac",
          600: "#0d9488",
        },
        metric: {
          aht: "#3b82f6",
          shrinkage: "#f59e0b",
          csat: "#10b981",
          abandon: "#f43f5e",
          hold: "#8b5cf6",
          breaks: "#2dd4c8",
        },
      },
      fontFamily: {
        display: ["'Sora'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(8,15,30,0.06), 0 8px 24px -12px rgba(8,15,30,0.25)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
};
export default config;
