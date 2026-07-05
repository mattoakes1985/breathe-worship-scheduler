// Design-system theme — Agent 2 contract artifact (PRD §18.2).
// Values trace to design-tokens.json (extracted brand anchors, not guesses).
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          ink: "#221F1F",
          blue: "#2659A8",
          teal: "#1FB5AA",
          green: "#5AB946",
        },
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        raised: "rgb(var(--c-raised) / <alpha-value>)",
        line: "rgb(var(--c-border) / <alpha-value>)",
        ink: "rgb(var(--c-text-1) / <alpha-value>)",
        soft: "rgb(var(--c-text-2) / <alpha-value>)",
        faint: "rgb(var(--c-text-3) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "accent-strong": "rgb(var(--c-accent-strong) / <alpha-value>)",
        "accent-soft": "rgb(var(--c-accent-soft) / <alpha-value>)",
        info: "rgb(var(--c-info) / <alpha-value>)",
        "info-soft": "rgb(var(--c-info-soft) / <alpha-value>)",
        positive: "rgb(var(--c-positive) / <alpha-value>)",
        "positive-soft": "rgb(var(--c-positive-soft) / <alpha-value>)",
        warning: "rgb(var(--c-warning) / <alpha-value>)",
        "warning-soft": "rgb(var(--c-warning-soft) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
        "danger-soft": "rgb(var(--c-danger-soft) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "Sora", "system-ui", "sans-serif"],
        body: ["Figtree", "'Segoe UI'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(34,31,31,0.06), 0 4px 16px rgba(34,31,31,0.05)",
        raised: "0 4px 12px rgba(34,31,31,0.10), 0 12px 32px rgba(34,31,31,0.08)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #2659A8 0%, #1FB5AA 55%, #5AB946 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
